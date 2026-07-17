import type { FastifyInstance } from "fastify";
import { datosFacturaSchema } from "./factura.js";
import { tokenStore } from "../services/auth/index.js";
import { receptionClient, emitirComprobante } from "../services/hacienda/index.js";
import { firmar } from "../services/firma/index.js";
import { generarP12Autofirmado, type Certificado } from "../services/firma/certificado.js";
import { certStore } from "../services/emisor/index.js";
import { comprobanteRepository, emisorRepository } from "../infra/repos/index.js";
import { documentosRecibidosService } from "../services/documentosRecibidos/index.js";
import { TipoDocumento } from "../domain/factura/facturaXml.js";
import { validarComprobante } from "../domain/validacion/validacion.js";
import {
  comprobanteEnviarSchema,
  comprobanteGetSchema,
  comprobantesListarSchema,
} from "../plugins/schemas.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";
import type { DatosFactura } from "../services/hacienda/emision.js";

/** Mapea el segmento de la ruta al tipo de documento. */
const RUTA_A_TIPO: Record<string, TipoDocumento> = {
  factura: TipoDocumento.FacturaElectronica,
  tiquete: TipoDocumento.TiqueteElectronico,
  "nota-credito": TipoDocumento.NotaCredito,
  "nota-debito": TipoDocumento.NotaDebito,
};

export async function comprobanteRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Emite un comprobante de punta a punta: clave → XML → firma → envío → estado.
   * `tipo` ∈ { factura, tiquete, nota-credito, nota-debito }.
   *
   * Requisitos: haber hecho /auth/login para el emisor (la clave del token es la
   * cédula del emisor) y tener HACIENDA_API_URL configurada.
   *
   * ⚠️ Por ahora firma con un certificado autofirmado de PRUEBA. La carga del .p12
   * real del emisor es parte de la gestión de emisores (pendiente).
   */
  app.post(
    "/comprobante/:tipo/enviar",
    { schema: comprobanteEnviarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
    const tipoParam = (request.params as { tipo: string }).tipo;
    const tipo = RUTA_A_TIPO[tipoParam];
    if (!tipo) {
      return reply.status(404).send({
        error: `Tipo de comprobante desconocido: "${tipoParam}"`,
        tiposValidos: Object.keys(RUTA_A_TIPO),
      });
    }

    const parsed = datosFacturaSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const datos = parsed.data as DatosFactura;

    // El emisor debe estar registrado y pertenecer al tenant del usuario.
    if (!(await emisorDelTenant(request, reply, datos.cedulaEmisor))) return;

    // Validación de reglas de negocio antes de firmar/enviar (falla temprano).
    const errores = validarComprobante(tipo, datos);
    if (errores.length > 0) {
      return reply.status(400).send({ error: "Comprobante inválido", errores });
    }

    // Usa el certificado real del emisor si está cargado; si no, cae a uno
    // autofirmado de PRUEBA (marcado en la respuesta).
    let certificado: Certificado;
    let certificadoDemo = false;
    if (await certStore.tieneCertificado(datos.cedulaEmisor)) {
      certificado = await certStore.obtenerCertificado(datos.cedulaEmisor);
    } else {
      certificado = generarP12Autofirmado({
        password: "demo",
        commonName: datos.emisor.nombre,
        cedula: datos.cedulaEmisor,
      }).certificado;
      certificadoDemo = true;
    }

    try {
      const result = await emitirComprobante(tipo, datos, {
        obtenerToken: () => tokenStore.getAccessToken(datos.cedulaEmisor),
        firmar,
        cliente: receptionClient,
        certificado,
      });

      // Persiste el comprobante con su estado final.
      await comprobanteRepository.crear({
        clave: result.clave,
        cedulaEmisor: datos.cedulaEmisor,
        tipo,
        consecutivo: result.consecutivo,
        estado: result.estado.estado,
        xmlFirmado: result.xmlFirmado,
        respuestaXml: result.estado.respuestaXml,
      });

      // Routing interno: si el receptor es un emisor registrado en Factu, el
      // comprobante aparece en sus "documentos recibidos" para que responda con
      // el mensaje receptor. Nunca debe romper la emisión.
      const cedulaReceptor = datos.receptor?.identificacion?.numero;
      if (cedulaReceptor) {
        try {
          const emisorReceptor = await emisorRepository.buscar(cedulaReceptor);
          if (emisorReceptor) {
            await documentosRecibidosService.registrarDesdeXml(
              emisorReceptor.tenantId,
              result.xmlFirmado,
              "interno",
            );
          }
        } catch (err) {
          request.log.warn({ err }, "No se pudo registrar el documento recibido (routing interno)");
        }
      }

      return {
        tipo: tipoParam,
        clave: result.clave,
        consecutivo: result.consecutivo,
        envio: result.envio,
        estado: result.estado.estado,
        respuestaXml: result.estado.respuestaXml,
        certificadoDemo,
      };
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: "Fallo al emitir el comprobante",
        detalle: (err as Error).message,
      });
    }
  });

  /** Lista los comprobantes emitidos del tenant (todos sus emisores). */
  app.get(
    "/comprobantes",
    { schema: comprobantesListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request) => {
      const emisores = await emisorRepository.listarPorTenant(request.user.tenantId);
      const porEmisor = await Promise.all(
        emisores.map((e) => comprobanteRepository.listarPorEmisor(e.cedula)),
      );
      const nombres = new Map(emisores.map((e) => [e.cedula, e.nombre]));
      return porEmisor
        .flat()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((c) => ({
          clave: c.clave,
          tipo: c.tipo,
          consecutivo: c.consecutivo,
          estado: c.estado,
          cedulaEmisor: c.cedulaEmisor,
          emisorNombre: nombres.get(c.cedulaEmisor) ?? "",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
    },
  );

  /** Consulta un comprobante persistido por su clave (dentro del tenant). */
  app.get(
    "/comprobante/:clave",
    { schema: comprobanteGetSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
    const clave = (request.params as { clave: string }).clave;
    const record = await comprobanteRepository.buscar(clave);
    if (!record) return reply.status(404).send({ error: "Comprobante no encontrado" });
    // Aislamiento: el comprobante debe pertenecer a un emisor del tenant.
    if (!(await emisorDelTenant(request, reply, record.cedulaEmisor))) return;
    return {
      clave: record.clave,
      tipo: record.tipo,
      consecutivo: record.consecutivo,
      estado: record.estado,
      cedulaEmisor: record.cedulaEmisor,
      xmlFirmado: record.xmlFirmado ?? null,
      respuestaXml: record.respuestaXml ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  });
}
