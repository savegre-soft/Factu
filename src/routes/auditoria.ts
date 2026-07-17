/**
 * Auditoría y registro del sistema, visibles desde Configuración. Solo admin.
 *
 *   GET /auditoria   → acciones de negocio (quién hizo qué)
 *   GET /logs        → eventos técnicos (pollers, entregas, webhooks, errores)
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listarAuditoria } from "../services/auditoria/index.js";
import { listarLogs } from "../services/logs/index.js";
import { Permiso } from "../domain/auth/roles.js";
import { auditoriaListarSchema, logsListarSchema } from "../plugins/schemas.js";

const auditoriaQuery = z.object({
  accion: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});

const logsQuery = z.object({
  nivel: z.enum(["info", "warn", "error"]).optional(),
  origen: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(500).optional(),
});

export async function auditoriaRoutes(app: FastifyInstance): Promise<void> {
  // La auditoría y los logs son información administrativa sensible.
  const soloAdmin = { preHandler: app.requierePermiso(Permiso.GestionarUsuarios) };

  app.get("/auditoria", { schema: auditoriaListarSchema, ...soloAdmin }, async (request) => {
    const q = auditoriaQuery.parse(request.query);
    return listarAuditoria(request.user.tenantId, { accion: q.accion, limite: q.limite });
  });

  app.get("/logs", { schema: logsListarSchema, ...soloAdmin }, async (request) => {
    const q = logsQuery.parse(request.query);
    return listarLogs(request.user.tenantId, { nivel: q.nivel, origen: q.origen, limite: q.limite });
  });
}
