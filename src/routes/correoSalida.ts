/**
 * Configuración del correo de SALIDA (SMTP) de la organización, para entregar los
 * comprobantes al cliente.
 *
 *   GET    /correo-salida          → configuración actual (sin contraseña)
 *   PUT    /correo-salida          → guarda / actualiza la configuración
 *   DELETE /correo-salida          → elimina la configuración (cae al global)
 *   POST   /correo-salida/probar   → prueba la conexión SMTP
 *
 * Solo administradores (Permiso.GestionarIntegraciones).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { smtpConfigService } from "../services/entrega/index.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  correoSalidaGetSchema,
  correoSalidaGuardarSchema,
  correoSalidaEliminarSchema,
  correoSalidaProbarSchema,
} from "../plugins/schemas.js";

const guardarSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  usuario: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  remitente: z.string().min(1),
  activo: z.boolean().default(true),
});

const probarSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  usuario: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
});

export async function correoSalidaRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = { preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) };

  app.get("/correo-salida", { schema: correoSalidaGetSchema, ...soloAdmin }, async (request) => {
    const config = await smtpConfigService.obtener(request.user.tenantId);
    const efectiva = await smtpConfigService.efectiva(request.user.tenantId);
    return { config, efectiva };
  });

  app.put("/correo-salida", { schema: correoSalidaGuardarSchema, ...soloAdmin }, async (request, reply) => {
    const parsed = guardarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const guardada = await smtpConfigService.guardar(request.user.tenantId, parsed.data);
    registrarAuditoria({
      tenantId: request.user.tenantId,
      actor: actorDesde(request.user, request.ip),
      accion: "config.smtp.guardar",
      recurso: "config",
      detalle: `SMTP ${parsed.data.host}:${parsed.data.port} (activo: ${parsed.data.activo})`,
    });
    return guardada;
  });

  app.delete("/correo-salida", { schema: correoSalidaEliminarSchema, ...soloAdmin }, async (request) => {
    await smtpConfigService.eliminar(request.user.tenantId);
    registrarAuditoria({
      tenantId: request.user.tenantId,
      actor: actorDesde(request.user, request.ip),
      accion: "config.smtp.eliminar",
      recurso: "config",
    });
    return { eliminado: true };
  });

  app.post("/correo-salida/probar", { schema: correoSalidaProbarSchema, ...soloAdmin }, async (request, reply) => {
    const parsed = probarSchema.safeParse(request.body);
    if (!parsed.success || !parsed.data.password) {
      return reply
        .status(400)
        .send({ error: "Reingresa el servidor, usuario y contraseña para probar" });
    }
    try {
      await smtpConfigService.probar(parsed.data);
      return { ok: true };
    } catch (err) {
      return reply.status(502).send({ error: "No se pudo conectar", detalle: (err as Error).message });
    }
  });
}
