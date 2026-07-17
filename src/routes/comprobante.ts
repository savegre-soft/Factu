import type { FastifyInstance } from "fastify";
import { datosFacturaSchema } from "./factura.js";
import { tokenStore } from "../services/auth/index.js";
import { receptionClient, emitirComprobante } from "../services/hacienda/index.js";
import { firmarXadesBes } from "../services/firma/xadesSigner.js";
import { generarP12Autofirmado } from "../services/firma/certificado.js";
import { TipoDocumento } from "../domain/factura/facturaXml.js";
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
  app.post("/comprobante/:tipo/enviar", async (request, reply) => {
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

    // Certificado de prueba (reemplazar por el .p12 real del emisor).
    const { certificado } = generarP12Autofirmado({
      password: "demo",
      commonName: datos.emisor.nombre,
      cedula: datos.cedulaEmisor,
    });

    try {
      const result = await emitirComprobante(tipo, datos, {
        obtenerToken: () => tokenStore.getAccessToken(datos.cedulaEmisor),
        firmar: firmarXadesBes,
        cliente: receptionClient,
        certificado,
      });

      return {
        tipo: tipoParam,
        clave: result.clave,
        consecutivo: result.consecutivo,
        envio: result.envio,
        estado: result.estado.estado,
        respuestaXml: result.estado.respuestaXml,
      };
    } catch (err) {
      request.log.error(err);
      return reply.status(502).send({
        error: "Fallo al emitir el comprobante",
        detalle: (err as Error).message,
      });
    }
  });
}
