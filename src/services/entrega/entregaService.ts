/**
 * Entrega del comprobante al cliente por correo, con auditoría y reintentos.
 *
 * Flujo: cuando Hacienda ACEPTA un comprobante, se registra un envío (auditoría)
 * y se intenta mandar al correo del receptor un correo con el PDF y el XML
 * firmado adjuntos. Cada intento actualiza el registro (estado, error, intentos).
 * Un poller reintenta los fallidos/pendientes hasta agotar los intentos.
 *
 * Se reutiliza el XML firmado ya persistido (no se regenera nada): el PDF se
 * genera a partir de él, de modo que el reenvío manual y los reintentos usan un
 * único camino.
 */
import { randomUUID } from "node:crypto";
import type {
  ComprobanteRepository,
  EnvioComprobanteRecord,
  EnvioComprobanteRepository,
} from "../../infra/repos/types.js";
import type { EmailSender } from "./emailSender.js";
import { asuntoFactura, cuerpoFacturaHtml } from "./plantillaCorreo.js";
import { generarFacturaPdf, parsearParaPdf } from "./comprobantePdf.js";
import { emitirEvento } from "../webhooks/index.js";
import { notificarEvento } from "../notificaciones/index.js";
import { registrarLog } from "../logs/index.js";

export interface EntregaConfig {
  habilitado: boolean;
  maxIntentos: number;
}

/** Vista pública de un envío (idéntica al record; no hay secretos). */
export type EnvioPublico = EnvioComprobanteRecord;

export class EntregaService {
  constructor(
    private readonly envios: EnvioComprobanteRepository,
    private readonly comprobantes: ComprobanteRepository,
    private readonly sender: EmailSender,
    private readonly config: EntregaConfig,
  ) {}

  /** ¿La entrega automática está activa y el envío configurado para el tenant? */
  async activa(tenantId: string): Promise<boolean> {
    return this.config.habilitado && (await this.sender.disponible(tenantId));
  }

  /**
   * Registra y entrega tras la aceptación. No lanza: cualquier fallo queda en la
   * auditoría. Si no hay correo de receptor o la entrega no está activa, no hace
   * nada.
   */
  async entregarAlAceptar(entrada: {
    tenantId: string;
    clave: string;
    cedulaEmisor: string;
    consecutivo: string;
    correoReceptor?: string;
  }): Promise<void> {
    if (!entrada.correoReceptor) return;
    if (!(await this.activa(entrada.tenantId))) return;

    const envio = await this.envios.crear({
      id: randomUUID(),
      tenantId: entrada.tenantId,
      clave: entrada.clave,
      cedulaEmisor: entrada.cedulaEmisor,
      destinatario: entrada.correoReceptor,
      asunto: asuntoFactura(entrada.consecutivo),
      estado: "pendiente",
    });
    await this.intentar(envio.id);
  }

  /** Reenvío manual: crea un nuevo intento (a un correo dado o el último usado). */
  async reenviar(
    tenantId: string,
    clave: string,
    correo?: string,
  ): Promise<EnvioComprobanteRecord | null> {
    const comprobante = await this.comprobantes.buscar(clave);
    if (!comprobante) return null;

    const previos = await this.envios.listarPorClave(tenantId, clave);
    const destinatario = correo ?? previos[0]?.destinatario;
    if (!destinatario) throw new Error("No hay un correo de destino; indícalo para reenviar");

    const datos = parsearParaPdf(comprobante.xmlFirmado ?? "");
    const envio = await this.envios.crear({
      id: randomUUID(),
      tenantId,
      clave,
      cedulaEmisor: comprobante.cedulaEmisor,
      destinatario,
      asunto: asuntoFactura(datos.consecutivo || comprobante.consecutivo),
      estado: "pendiente",
    });
    return this.intentar(envio.id);
  }

  /** Historial de envíos de un comprobante. */
  async historial(tenantId: string, clave: string): Promise<EnvioComprobanteRecord[]> {
    return this.envios.listarPorClave(tenantId, clave);
  }

  /** Reintenta los envíos fallidos/pendientes (usado por el poller). */
  async reintentarPendientes(): Promise<void> {
    const pendientes = await this.envios.listarReintentables(this.config.maxIntentos);
    for (const envio of pendientes) {
      await this.intentar(envio.id).catch(() => {});
    }
  }

  /**
   * Ejecuta un intento de envío: genera el PDF desde el XML firmado, adjunta PDF
   * y XML, y manda el correo. Registra el resultado en la auditoría.
   */
  async intentar(id: string): Promise<EnvioComprobanteRecord | null> {
    const envio = await this.envios.buscarPorId(id);
    if (!envio) return null;
    if (envio.estado === "enviado") return envio;

    const intentos = envio.intentos + 1;

    const comprobante = await this.comprobantes.buscar(envio.clave);
    if (!comprobante?.xmlFirmado) {
      if (intentos >= this.config.maxIntentos) this.notificar(envio, "fallido");
      return this.envios.actualizar(id, {
        estado: "fallido",
        error: "No hay XML firmado para adjuntar",
        intentos,
      });
    }

    try {
      const datos = parsearParaPdf(comprobante.xmlFirmado);
      const pdf = await generarFacturaPdf(datos, comprobante.estado);

      await this.sender.enviar(envio.tenantId, {
        to: envio.destinatario,
        subject: envio.asunto,
        html: cuerpoFacturaHtml({
          numero: datos.consecutivo || comprobante.consecutivo,
          cliente: datos.receptorNombre,
          emisor: datos.emisorNombre,
        }),
        attachments: [
          {
            filename: `factura-${envio.clave}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
          {
            filename: `factura-${envio.clave}.xml`,
            content: comprobante.xmlFirmado,
            contentType: "application/xml",
          },
        ],
      });

      this.notificar(envio, "enviado");
      return this.envios.actualizar(id, { estado: "enviado", error: null, intentos });
    } catch (err) {
      if (intentos >= this.config.maxIntentos) this.notificar(envio, "fallido");
      return this.envios.actualizar(id, {
        estado: "fallido",
        error: (err as Error).message,
        intentos,
      });
    }
  }

  /** Notifica a los webhooks el resultado final de la entrega al cliente. */
  private notificar(envio: EnvioComprobanteRecord, estado: "enviado" | "fallido"): void {
    const datosEvento = {
      clave: envio.clave,
      cedulaEmisor: envio.cedulaEmisor,
      destinatario: envio.destinatario,
      estado,
    };
    emitirEvento(envio.tenantId, "entrega.cliente", datosEvento);
    notificarEvento(envio.tenantId, "entrega.cliente", datosEvento);
    if (estado === "fallido") {
      registrarLog({
        nivel: "warn",
        origen: "entrega",
        tenantId: envio.tenantId,
        mensaje: `No se pudo entregar el comprobante ${envio.clave} a ${envio.destinatario}`,
        detalle: `Agotados los reintentos de envío por correo.`,
      });
    }
  }
}
