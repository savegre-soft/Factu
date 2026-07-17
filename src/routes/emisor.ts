import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { emisorRepository } from "../infra/repos/index.js";
import { certStore } from "../services/emisor/index.js";
import { emisorRegistrarSchema, emisorCertificadoSchema } from "../plugins/schemas.js";

const registrarSchema = z.object({
  cedula: z.string().regex(/^\d+$/),
  nombre: z.string().min(1),
});

const certificadoSchema = z.object({
  /** Archivo .p12 codificado en base64. */
  p12Base64: z.string().min(1),
  /** Clave (PIN) del .p12. */
  password: z.string().min(1),
});

export async function emisorRoutes(app: FastifyInstance): Promise<void> {
  /** Registra (o actualiza) un emisor. */
  app.post("/emisor", { schema: emisorRegistrarSchema }, async (request, reply) => {
    const parsed = registrarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const emisor = await emisorRepository.upsert(parsed.data);
    return { cedula: emisor.cedula, nombre: emisor.nombre, tieneCertificado: Boolean(emisor.certificado) };
  });

  /** Sube el certificado .p12 del emisor (se guarda cifrado en reposo). */
  app.post("/emisor/:cedula/certificado", { schema: emisorCertificadoSchema }, async (request, reply) => {
    const cedula = (request.params as { cedula: string }).cedula;
    const parsed = certificadoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }

    const emisor = await emisorRepository.buscar(cedula);
    if (!emisor) {
      return reply.status(404).send({ error: `Emisor "${cedula}" no registrado` });
    }

    try {
      const p12 = Buffer.from(parsed.data.p12Base64, "base64");
      await certStore.guardar(cedula, p12, parsed.data.password);
      return { cedula, tieneCertificado: true };
    } catch (err) {
      return reply.status(400).send({
        error: "El certificado no se pudo cargar (¿.p12 o clave incorrectos?)",
        detalle: (err as Error).message,
      });
    }
  });
}
