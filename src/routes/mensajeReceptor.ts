import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  generarMensajeReceptorXml,
  RespuestaMensaje,
} from "../domain/mensajeReceptor/mensajeReceptor.js";
import { mensajeReceptorSchema } from "../plugins/schemas.js";

const bodySchema = z.object({
  clave: z.string().length(50),
  numeroCedulaEmisor: z.string().regex(/^\d+$/),
  fechaEmisionDoc: z.coerce.date(),
  mensaje: z.nativeEnum(RespuestaMensaje),
  detalleMensaje: z.string().optional(),
  montoTotalImpuesto: z.number().nonnegative().optional(),
  totalFactura: z.number().nonnegative(),
  numeroCedulaReceptor: z.string().regex(/^\d+$/),
  numeroConsecutivoReceptor: z.string().length(20),
});

export async function mensajeReceptorRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Genera el XML (sin firmar) de un Mensaje Receptor: la aceptación, aceptación
   * parcial o rechazo de un comprobante recibido.
   *
   * El envío reutiliza el mismo cliente de recepción y firma que los demás
   * comprobantes (pendiente de confirmar los detalles del sobre para MR).
   */
  app.post("/mensaje-receptor/xml", { schema: mensajeReceptorSchema }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const xml = generarMensajeReceptorXml(parsed.data);
    return reply.header("Content-Type", "application/xml; charset=utf-8").send(xml);
  });
}
