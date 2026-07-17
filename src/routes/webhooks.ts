/**
 * Webhooks salientes: integraciones con sistemas externos por HTTP.
 *
 *   GET    /webhooks              → lista los webhooks del tenant
 *   POST   /webhooks              → crea un webhook
 *   PUT    /webhooks/:id          → actualiza un webhook
 *   DELETE /webhooks/:id          → elimina un webhook
 *   POST   /webhooks/:id/probar   → envía un evento de prueba
 *   GET    /webhooks/:id/entregas → historial de entregas
 *
 * Solo administradores (Permiso.GestionarIntegraciones). El secreto de firma se
 * guarda cifrado y nunca se devuelve.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { webhookService } from "../services/webhooks/index.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  webhookListarSchema,
  webhookCrearSchema,
  webhookActualizarSchema,
  webhookEliminarSchema,
  webhookProbarSchema,
  webhookEntregasSchema,
} from "../plugins/schemas.js";

const EVENTOS = [
  "comprobante.aceptado",
  "comprobante.rechazado",
  "documento.recibido",
  "entrega.cliente",
] as const;

const cuerpoSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  eventos: z.array(z.enum(EVENTOS)).min(1),
  activo: z.boolean().default(true),
});

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/webhooks",
    { schema: webhookListarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request) => webhookService.listar(request.user.tenantId),
  );

  app.post(
    "/webhooks",
    { schema: webhookCrearSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const parsed = cuerpoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const webhook = await webhookService.crear(request.user.tenantId, parsed.data);
      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "webhook.crear",
        recurso: "webhook",
        recursoId: webhook.id,
        detalle: `${webhook.url} (${webhook.eventos.join(", ")})`,
      });
      return reply.status(201).send(webhook);
    },
  );

  app.put(
    "/webhooks/:id",
    { schema: webhookActualizarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const parsed = cuerpoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const { id } = request.params as { id: string };
      const webhook = await webhookService.actualizar(request.user.tenantId, id, parsed.data);
      if (!webhook) return reply.status(404).send({ error: "Webhook no encontrado" });
      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "webhook.actualizar",
        recurso: "webhook",
        recursoId: webhook.id,
        detalle: `${webhook.url} (activo: ${webhook.activo})`,
      });
      return webhook;
    },
  );

  app.delete(
    "/webhooks/:id",
    { schema: webhookEliminarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await webhookService.eliminar(request.user.tenantId, id);
      if (!ok) return reply.status(404).send({ error: "Webhook no encontrado" });
      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "webhook.eliminar",
        recurso: "webhook",
        recursoId: id,
      });
      return { id, eliminado: true };
    },
  );

  app.post(
    "/webhooks/:id/probar",
    { schema: webhookProbarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const resultado = await webhookService.probar(request.user.tenantId, id);
      if (!resultado) return reply.status(404).send({ error: "Webhook no encontrado" });
      return {
        estado: resultado.estado,
        statusCode: resultado.statusCode ?? null,
        error: resultado.error ?? null,
      };
    },
  );

  app.get(
    "/webhooks/:id/entregas",
    { schema: webhookEntregasSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request) => {
      const { id } = request.params as { id: string };
      const entregas = await webhookService.historial(request.user.tenantId, id);
      // No exponemos el payload completo en el listado; sí un resumen.
      return entregas.map((e) => ({
        id: e.id,
        evento: e.evento,
        estado: e.estado,
        statusCode: e.statusCode ?? null,
        error: e.error ?? null,
        intentos: e.intentos,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));
    },
  );
}
