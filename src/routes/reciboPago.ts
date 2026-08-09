/**
 * Recibo Electrónico de Pago (REP), obligatorio en v4.4 al cobrar una venta a
 * crédito.
 *
 * Sigue el mismo camino que una factura —clave, XML, firma, envío y estado—
 * pero con su propia estructura y su propia serie de consecutivos (tipo 10).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generarClave, SituacionComprobante, TipoComprobante } from "../domain/clave/clave.js";
import { generarReciboPagoXml } from "../domain/reciboPago/reciboPagoXml.js";
import { fechaEmisionISO } from "../domain/factura/facturaXml.js";
import { CodigoImpuesto, TipoIdentificacion, TipoMedioPago } from "../domain/factura/types.js";
import { comprobanteRepository } from "../infra/repos/index.js";
import { certStore } from "../services/emisor/index.js";
import { firmar } from "../services/firma/index.js";
import { tokenStore, SinSesionHaciendaError } from "../services/auth/index.js";
import { receptionClient, construirEnvelope } from "../services/hacienda/index.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { emitirEvento } from "../services/webhooks/index.js";
import { env } from "../config/env.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";
import { reciboPagoEnviarSchema } from "../plugins/schemas.js";

/** Clave del contador de consecutivos: el REP tiene su propia serie. */
const SERIE_REP = "REP";

const parteSchema = z.object({
  nombre: z.string().min(1),
  identificacion: z.object({
    tipo: z.nativeEnum(TipoIdentificacion),
    numero: z.string().regex(/^\d+$/),
  }),
  correoElectronico: z.string().email().optional(),
});

const cuerpoSchema = z.object({
  cedulaEmisor: z.string().regex(/^\d+$/),
  sucursal: z.number().int().nonnegative().default(1),
  terminal: z.number().int().nonnegative().default(1),
  /** Si se omite, lo reserva la API de la serie del REP. */
  consecutivo: z.number().int().nonnegative().optional(),
  situacion: z.nativeEnum(SituacionComprobante).optional(),
  emisor: parteSchema,
  receptor: parteSchema,
  condicionVenta: z.string().default("01"),
  lineas: z
    .array(
      z.object({
        detalle: z.string().min(1),
        montoTotal: z.number().nonnegative(),
        impuestos: z
          .array(
            z.object({
              codigo: z.nativeEnum(CodigoImpuesto),
              codigoTarifa: z.string().optional(),
              tarifa: z.number().nonnegative().optional(),
              monto: z.number().nonnegative(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  moneda: z.object({ codigo: z.string(), tipoCambio: z.number().positive().optional() }).optional(),
  mediosPago: z
    .array(z.object({ tipo: z.nativeEnum(TipoMedioPago), monto: z.number().optional() }))
    .optional(),
  /** Obligatoria: la factura que se está cobrando. */
  informacionReferencia: z
    .array(
      z.object({
        tipoDoc: z.string(),
        numero: z.string(),
        fechaEmision: z.coerce.date(),
        codigo: z.string(),
        razon: z.string(),
      }),
    )
    .min(1),
});

export async function reciboPagoRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/recibo-pago/enviar",
    { schema: reciboPagoEnviarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = cuerpoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const datos = parsed.data;
      if (!(await emisorDelTenant(request, reply, datos.cedulaEmisor))) return;

      const serie = {
        cedulaEmisor: datos.cedulaEmisor,
        sucursal: datos.sucursal,
        terminal: datos.terminal,
        tipo: SERIE_REP,
      };
      const numero =
        datos.consecutivo ?? (await comprobanteRepository.reservarConsecutivo(serie));

      const fecha = new Date();
      const { clave, consecutivo } = generarClave({
        cedulaEmisor: datos.cedulaEmisor,
        sucursal: datos.sucursal,
        terminal: datos.terminal,
        tipo: TipoComprobante.ReciboElectronicoPago,
        consecutivo: numero,
        situacion: datos.situacion ?? SituacionComprobante.Normal,
        fecha,
      });

      let entregado = false;
      try {
        const xml = generarReciboPagoXml({
          ...datos,
          clave,
          numeroConsecutivo: consecutivo,
          fechaEmision: fecha,
          proveedorSistemas: env.PROVEEDOR_SISTEMAS,
        });

        const certificado = await certStore.obtenerCertificado(datos.cedulaEmisor);
        const xmlFirmado = await firmar(xml, certificado);
        const token = await tokenStore.getAccessToken(datos.cedulaEmisor);

        await receptionClient.enviar(
          token,
          construirEnvelope(xmlFirmado, {
            clave,
            fecha: fechaEmisionISO(fecha),
            emisor: datos.emisor.identificacion,
            receptor: datos.receptor.identificacion,
          }),
        );
        entregado = true;
        const estado = await receptionClient.esperarEstadoFinal(token, clave);

        registrarAuditoria({
          tenantId: request.user.tenantId,
          actor: actorDesde(request.user, request.ip),
          accion: "recibo-pago.emitir",
          recurso: "recibo-pago",
          recursoId: clave,
          detalle: `${consecutivo} → ${estado.estado}`,
        });
        emitirEvento(request.user.tenantId, `recibo-pago.${estado.estado}`, {
          clave,
          consecutivo,
          estado: estado.estado,
          cedulaEmisor: datos.cedulaEmisor,
        });

        return {
          clave,
          consecutivo,
          estado: estado.estado,
          respuestaXml: estado.respuestaXml,
        };
      } catch (err) {
        // No llegó a Hacienda: el número vuelve a la serie.
        if (!entregado && datos.consecutivo === undefined) {
          await comprobanteRepository.liberarConsecutivo(serie, numero).catch(() => {});
        }
        if (err instanceof SinSesionHaciendaError) {
          return reply
            .status(401)
            .send({ error: "Sin sesión con Hacienda", detalle: err.message });
        }
        request.log.error(err);
        return reply.status(502).send({
          error: "Fallo al emitir el recibo de pago",
          detalle: (err as Error).message,
        });
      }
    },
  );
}
