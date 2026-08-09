/**
 * Documentos recibidos: las facturas que NOS emiten, para responder con el
 * mensaje receptor.
 *
 * Un documento se registra a partir de su XML (carga manual, routing interno al
 * emitir, o correo). Desde él se genera el mensaje receptor —aceptación,
 * aceptación parcial o rechazo— y se ENVÍA a Hacienda: responder es una
 * obligación con plazo, así que generar el XML y dejarlo guardado no basta.
 */
import { randomUUID } from "node:crypto";
import { parsearComprobante } from "../../domain/documentoRecibido/parseComprobante.js";
import {
  generarMensajeReceptorXml,
  RespuestaMensaje,
} from "../../domain/mensajeReceptor/mensajeReceptor.js";
import {
  generarConsecutivo,
  TipoComprobante,
  TIPO_POR_RESPUESTA_MR,
} from "../../domain/clave/clave.js";
import { fechaEmisionISO } from "../../domain/factura/facturaXml.js";
import { TipoIdentificacion } from "../../domain/factura/types.js";
import { construirEnvelope } from "../hacienda/envelope.js";
import type { HaciendaReceptionClient } from "../hacienda/reception.js";
import type {
  DocumentoRecibidoRecord,
  DocumentoRecibidoRepository,
} from "../../infra/repos/types.js";
import { emitirEvento } from "../webhooks/index.js";
import { notificarEvento } from "../notificaciones/index.js";

export type OrigenDocumento = "manual" | "interno" | "correo";

export interface ResultadoRegistro {
  documento: DocumentoRecibidoRecord;
  /** true si ya existía (mismo tenant + clave); no se duplica. */
  yaExistia: boolean;
}

export interface DatosMensajeReceptor {
  respuesta: RespuestaMensaje;
  detalleMensaje?: string;
}

/** Lo que hace falta para firmar y enviar el mensaje receptor. */
export interface EnvioMensajeReceptor {
  /** Firma el XML con el certificado del emisor indicado. */
  firmar: (cedula: string, xml: string) => Promise<string>;
  obtenerToken: (cedula: string) => Promise<string>;
  cliente: Pick<HaciendaReceptionClient, "enviar" | "esperarEstadoFinal">;
}

/** Deduce el tipo de identificación por el largo de la cédula. */
function tipoIdentificacion(cedula: string): TipoIdentificacion {
  if (cedula.length === 10) return TipoIdentificacion.Juridica;
  if (cedula.length >= 11) return TipoIdentificacion.Dimex;
  return TipoIdentificacion.Fisica;
}

export class DocumentosRecibidosService {
  constructor(
    private readonly repo: DocumentoRecibidoRepository,
    /** Sin esto el mensaje receptor se genera pero no se puede enviar. */
    private readonly envio?: EnvioMensajeReceptor,
  ) {}

  /**
   * Registra un comprobante recibido a partir de su XML. Deduplica por clave
   * dentro del tenant: si ya existe, devuelve el existente sin crear otro.
   */
  async registrarDesdeXml(
    tenantId: string,
    xml: string,
    origen: OrigenDocumento,
  ): Promise<ResultadoRegistro> {
    const datos = parsearComprobante(xml);

    const existente = await this.repo.buscarPorClave(tenantId, datos.clave);
    if (existente) return { documento: existente, yaExistia: true };

    const documento = await this.repo.crear({
      id: randomUUID(),
      tenantId,
      clave: datos.clave,
      tipo: datos.tipo,
      numeroConsecutivo: datos.numeroConsecutivo,
      fechaEmision: new Date(datos.fechaEmision),
      emisorNombre: datos.emisorNombre,
      emisorCedula: datos.emisorIdentificacion.numero,
      receptorCedula: datos.receptorIdentificacion?.numero ?? "",
      receptorNombre: datos.receptorNombre ?? null,
      moneda: datos.moneda,
      totalComprobante: datos.totalComprobante,
      totalImpuesto: datos.totalImpuesto,
      xml,
      origen,
    });

    const datosEvento = {
      clave: documento.clave,
      tipo: documento.tipo,
      emisorNombre: documento.emisorNombre,
      emisorCedula: documento.emisorCedula,
      moneda: documento.moneda,
      totalComprobante: documento.totalComprobante,
      origen,
    };
    emitirEvento(tenantId, "documento.recibido", datosEvento);
    notificarEvento(tenantId, "documento.recibido", datosEvento);

    return { documento, yaExistia: false };
  }

  async listar(
    tenantId: string,
    pagina?: { limite: number; desplazamiento: number },
  ): Promise<{ items: DocumentoRecibidoRecord[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.listarPorTenant(tenantId, pagina),
      this.repo.contarPorTenant(tenantId),
    ]);
    return { items, total };
  }

  /** Devuelve un documento del tenant, o null si no existe o es de otro tenant. */
  async obtener(tenantId: string, id: string): Promise<DocumentoRecibidoRecord | null> {
    const doc = await this.repo.buscarPorId(id);
    return doc && doc.tenantId === tenantId ? doc : null;
  }

  /** Elimina un documento del tenant. Devuelve false si no existe o es de otro tenant. */
  async eliminar(tenantId: string, id: string): Promise<boolean> {
    const doc = await this.repo.buscarPorId(id);
    if (!doc || doc.tenantId !== tenantId) return false;
    await this.repo.eliminar(id);
    return true;
  }

  /**
   * Genera (y guarda) el mensaje receptor de un documento recibido del tenant.
   * Devuelve null si el documento no existe o es de otro tenant.
   *
   * El consecutivo del receptor se genera de forma secuencial simple por tenant.
   */
  async generarMensajeReceptor(
    tenantId: string,
    id: string,
    datos: DatosMensajeReceptor,
  ): Promise<DocumentoRecibidoRecord | null> {
    const doc = await this.repo.buscarPorId(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    if (!doc.receptorCedula) {
      throw new Error("El documento no tiene cédula de receptor; no se puede generar el mensaje");
    }

    const consecutivo = await this.siguienteConsecutivoReceptor(tenantId, datos.respuesta);

    const xml = generarMensajeReceptorXml({
      clave: doc.clave,
      numeroCedulaEmisor: doc.emisorCedula,
      fechaEmisionDoc: doc.fechaEmision,
      mensaje: datos.respuesta,
      detalleMensaje: datos.detalleMensaje,
      montoTotalImpuesto: doc.totalImpuesto,
      totalFactura: doc.totalComprobante,
      numeroCedulaReceptor: doc.receptorCedula,
      numeroConsecutivoReceptor: consecutivo,
    });

    await this.repo.guardarMensajeReceptor(id, {
      respuesta: datos.respuesta,
      consecutivo,
      xml,
    });

    return this.repo.buscarPorId(id);
  }

  /**
   * Consecutivo del mensaje receptor, secuencial por tenant. El código de tipo
   * depende de la respuesta: 05 aceptación, 06 parcial, 07 rechazo.
   */
  private async siguienteConsecutivoReceptor(
    tenantId: string,
    respuesta: RespuestaMensaje,
  ): Promise<string> {
    const total = await this.repo.contarPorTenant(tenantId);
    const docs = await this.repo.listarPorTenant(tenantId, {
      limite: Math.max(total, 1),
      desplazamiento: 0,
    });
    const respondidos = docs.filter((d) => d.mrConsecutivo).length;
    return generarConsecutivo({
      sucursal: 1,
      terminal: 1,
      tipo: TIPO_POR_RESPUESTA_MR[respuesta] ?? TipoComprobante.MensajeAceptacion,
      consecutivo: respondidos + 1,
    });
  }

  /**
   * Firma el mensaje receptor ya generado y lo envía a recepción de Hacienda.
   *
   * Se firma con el certificado del receptor —uno de nuestros emisores— porque
   * es quien responde. El sobre lleva la clave del comprobante ORIGINAL y, como
   * campo aparte, el consecutivo de quien responde.
   */
  async enviarMensajeReceptor(
    tenantId: string,
    id: string,
  ): Promise<DocumentoRecibidoRecord | null> {
    const doc = await this.repo.buscarPorId(id);
    if (!doc || doc.tenantId !== tenantId) return null;
    if (!doc.mrXml || !doc.mrConsecutivo) {
      throw new Error("Primero hay que generar el mensaje receptor");
    }
    if (!this.envio) {
      throw new Error("El envío de mensajes receptor no está configurado");
    }

    const xmlFirmado = await this.envio.firmar(doc.receptorCedula, doc.mrXml);
    const token = await this.envio.obtenerToken(doc.receptorCedula);

    const envelope = construirEnvelope(xmlFirmado, {
      clave: doc.clave,
      fecha: fechaEmisionISO(doc.fechaEmision),
      emisor: { tipo: tipoIdentificacion(doc.emisorCedula), numero: doc.emisorCedula },
      receptor: { tipo: tipoIdentificacion(doc.receptorCedula), numero: doc.receptorCedula },
      consecutivoReceptor: doc.mrConsecutivo,
    });

    await this.envio.cliente.enviar(token, envelope);
    const estado = await this.envio.cliente.esperarEstadoFinal(token, doc.clave);

    await this.repo.guardarEnvioMensajeReceptor(id, {
      estado: estado.estado,
      xmlFirmado,
      respuestaXml: estado.respuestaXml,
    });

    emitirEvento(tenantId, `mensaje-receptor.${estado.estado}`, {
      clave: doc.clave,
      consecutivo: doc.mrConsecutivo,
      respuesta: doc.mrRespuesta,
      estado: estado.estado,
    });

    return this.repo.buscarPorId(id);
  }
}
