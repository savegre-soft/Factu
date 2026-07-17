import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { generarP12Autofirmado } from "../services/firma/certificado.js";
import { firmarXadesBes, verificarFirma } from "../services/firma/xadesSigner.js";

const demoSchema = z.object({
  /** XML a firmar (p. ej. el que devuelve /factura/xml). */
  xml: z.string().min(1),
});

export async function firmaRoutes(app: FastifyInstance): Promise<void> {
  /**
   * DEMO / SOLO PRUEBAS: firma un XML con un certificado autofirmado generado al
   * vuelo y devuelve el XML firmado junto con el resultado de la verificación.
   * En producción, la firma usará el .p12 real del emisor (aún por integrar).
   */
  app.post("/firma/demo", async (request, reply) => {
    const parsed = demoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }

    const { certificado } = generarP12Autofirmado({ password: "demo", commonName: "Demo Factu" });
    const firmado = await firmarXadesBes(parsed.data.xml, certificado, {
      productionPlace: { country: "Costa Rica" },
    });
    const verificado = await verificarFirma(firmado);

    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .send({ verificado, firmado });
  });
}
