/**
 * Configuración del buzón de correo (IMAP) de la organización y su sincronización.
 *
 *   GET    /correo               → configuración actual (sin contraseña)
 *   PUT    /correo               → guarda / actualiza la configuración
 *   DELETE /correo               → elimina la configuración
 *   POST   /correo/probar        → prueba la conexión IMAP
 *   POST   /correo/sincronizar   → revisa el buzón ahora y registra los XML
 *
 * Solo administradores (Permiso.GestionarIntegraciones).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { correoService } from "../services/correo/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  correoGetSchema,
  correoGuardarSchema,
  correoEliminarSchema,
  correoProbarSchema,
  correoSincronizarSchema,
} from "../plugins/schemas.js";

const guardarSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  usuario: z.string().min(1),
  password: z.string().min(1),
  carpeta: z.string().default("INBOX"),
  activo: z.boolean().default(true),
});

export async function correoRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = { preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) };

  app.get("/correo", { schema: correoGetSchema, ...soloAdmin }, async (request) => {
    const buzon = await correoService.obtenerBuzon(request.user.tenantId);
    return buzon ?? { configurado: false };
  });

  app.put("/correo", { schema: correoGuardarSchema, ...soloAdmin }, async (request, reply) => {
    const parsed = guardarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const buzon = await correoService.guardarBuzon(request.user.tenantId, parsed.data);
    return buzon;
  });

  app.delete("/correo", { schema: correoEliminarSchema, ...soloAdmin }, async (request) => {
    await correoService.eliminarBuzon(request.user.tenantId);
    return { eliminado: true };
  });

  app.post("/correo/probar", { schema: correoProbarSchema, ...soloAdmin }, async (request, reply) => {
    // Si viene cuerpo, prueba esa config; si no, la guardada.
    const parsed = guardarSchema.partial({ activo: true }).safeParse(request.body ?? {});
    try {
      if (parsed.success && parsed.data.host && parsed.data.password) {
        await correoService.probar({
          host: parsed.data.host,
          port: parsed.data.port!,
          secure: parsed.data.secure ?? true,
          usuario: parsed.data.usuario!,
          password: parsed.data.password,
          carpeta: parsed.data.carpeta ?? "INBOX",
        });
      } else {
        const buzon = await correoService.obtenerBuzon(request.user.tenantId);
        if (!buzon) return reply.status(400).send({ error: "No hay un buzón configurado" });
        // Sin la contraseña en claro no se puede reprobar la guardada: pide reingresarla.
        return reply.status(400).send({
          error: "Para probar, reingresa la contraseña del buzón en el formulario",
        });
      }
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: "No se pudo conectar", detalle: (err as Error).message });
    }
  });

  app.post(
    "/correo/sincronizar",
    { schema: correoSincronizarSchema, ...soloAdmin },
    async (request, reply) => {
      try {
        const resultado = await correoService.sincronizar(request.user.tenantId);
        return resultado;
      } catch (err) {
        return reply.status(502).send({
          error: "No se pudo sincronizar el buzón",
          detalle: (err as Error).message,
        });
      }
    },
  );
}
