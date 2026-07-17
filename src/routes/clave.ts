import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generarClave, TipoComprobante, SituacionComprobante } from "../domain/clave/clave.js";

const bodySchema = z.object({
  cedulaEmisor: z.string().regex(/^\d+$/),
  sucursal: z.number().int().nonnegative(),
  terminal: z.number().int().nonnegative(),
  tipo: z.nativeEnum(TipoComprobante),
  consecutivo: z.number().int().nonnegative(),
  situacion: z.nativeEnum(SituacionComprobante).optional(),
});

export async function claveRoutes(app: FastifyInstance): Promise<void> {
  app.post("/clave", async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    return generarClave(parsed.data);
  });
}
