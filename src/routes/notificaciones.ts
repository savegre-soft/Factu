/**
 * Notificaciones: canales de comunicación (SMS, WhatsApp, Slack, Teams) que
 * reaccionan a los eventos del sistema. Módulo independiente de Integraciones.
 *
 *   GET    /notification-channels              → canales configurados
 *   POST   /notification-channels              → crea un canal
 *   PUT    /notification-channels/:id          → actualiza un canal
 *   DELETE /notification-channels/:id          → elimina un canal
 *   POST   /notification-channels/:id/probar   → envía una notificación de prueba
 *   GET    /notification-providers             → catálogo de proveedores + campos
 *   GET    /notification-events                → catálogo de eventos
 *   GET    /notifications                      → historial de envíos
 *
 * Solo administradores (Permiso.GestionarNotificaciones).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notificacionesService, providerRegistry } from "../services/notificaciones/index.js";
import { EVENTOS_NOTIFICACION } from "../services/notificaciones/eventos.js";
import type { ChannelType, ProviderKey } from "../services/notificaciones/tipos.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  canalNotifListarSchema,
  canalNotifCrearSchema,
  canalNotifActualizarSchema,
  canalNotifEliminarSchema,
  canalNotifProbarSchema,
  notifProveedoresSchema,
  notifEventosSchema,
  notifHistorialSchema,
} from "../plugins/schemas.js";

const EVENTOS = [
  "comprobante.aceptado",
  "comprobante.rechazado",
  "documento.recibido",
  "entrega.cliente",
] as const;

const cuerpoCanal = z.object({
  tipo: z.enum(["sms", "whatsapp", "slack", "teams", "bitrix24"]),
  proveedor: z.enum(["twilio", "whatsapp_cloud", "slack", "teams", "bitrix24"]),
  nombre: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
  eventos: z.array(z.enum(EVENTOS)).min(1),
  activo: z.boolean().default(true),
});

export async function notificacionesRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = { preHandler: app.requierePermiso(Permiso.GestionarNotificaciones) };

  app.get("/notification-channels", { schema: canalNotifListarSchema, ...soloAdmin }, async (request) =>
    notificacionesService.listar(request.user.tenantId),
  );

  app.post("/notification-channels", { schema: canalNotifCrearSchema, ...soloAdmin }, async (request, reply) => {
    const parsed = cuerpoCanal.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    try {
      const canal = await notificacionesService.crear(request.user.tenantId, {
        ...parsed.data,
        tipo: parsed.data.tipo as ChannelType,
        proveedor: parsed.data.proveedor as ProviderKey,
      });
      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "notificacion.canal.crear",
        recurso: "notification_channel",
        recursoId: canal.id,
        detalle: `${canal.nombre} (${canal.proveedor})`,
      });
      return reply.status(201).send(canal);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.put("/notification-channels/:id", { schema: canalNotifActualizarSchema, ...soloAdmin }, async (request, reply) => {
    const parsed = cuerpoCanal.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const { id } = request.params as { id: string };
    try {
      const canal = await notificacionesService.actualizar(request.user.tenantId, id, {
        ...parsed.data,
        tipo: parsed.data.tipo as ChannelType,
        proveedor: parsed.data.proveedor as ProviderKey,
      });
      if (!canal) return reply.status(404).send({ error: "Canal no encontrado" });
      registrarAuditoria({
        tenantId: request.user.tenantId,
        actor: actorDesde(request.user, request.ip),
        accion: "notificacion.canal.actualizar",
        recurso: "notification_channel",
        recursoId: canal.id,
        detalle: `${canal.nombre} (activo: ${canal.activo})`,
      });
      return canal;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  app.delete("/notification-channels/:id", { schema: canalNotifEliminarSchema, ...soloAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await notificacionesService.eliminar(request.user.tenantId, id);
    if (!ok) return reply.status(404).send({ error: "Canal no encontrado" });
    registrarAuditoria({
      tenantId: request.user.tenantId,
      actor: actorDesde(request.user, request.ip),
      accion: "notificacion.canal.eliminar",
      recurso: "notification_channel",
      recursoId: id,
    });
    return { id, eliminado: true };
  });

  app.post("/notification-channels/:id/probar", { schema: canalNotifProbarSchema, ...soloAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const resultado = await notificacionesService.probar(request.user.tenantId, id);
    if (!resultado) return reply.status(404).send({ error: "Canal no encontrado" });
    return {
      estado: resultado.estado,
      destino: resultado.destino ?? null,
      error: resultado.error ?? null,
    };
  });

  app.get("/notification-providers", { schema: notifProveedoresSchema, ...soloAdmin }, async () =>
    providerRegistry.todos().map((p) => ({
      clave: p.clave,
      canal: p.canal,
      nombre: p.nombre,
      campos: p.campos,
    })),
  );

  app.get("/notification-events", { schema: notifEventosSchema, ...soloAdmin }, async () =>
    Object.entries(EVENTOS_NOTIFICACION).map(([clave, etiqueta]) => ({ clave, etiqueta })),
  );

  app.get("/notifications", { schema: notifHistorialSchema, ...soloAdmin }, async (request) => {
    const q = z
      .object({
        estado: z.enum(["pendiente", "enviado", "fallido", "reintentando"]).optional(),
        canalId: z.string().optional(),
        limite: z.coerce.number().int().min(1).max(500).optional(),
      })
      .parse(request.query);
    const mensajes = await notificacionesService.historial(request.user.tenantId, q);
    // El contenido y la respuesta cruda pueden ser grandes: se devuelve un resumen.
    return mensajes.map((m) => ({
      id: m.id,
      canalId: m.canalId,
      proveedor: m.proveedor,
      evento: m.evento,
      destino: m.destino,
      contenido: m.contenido,
      estado: m.estado,
      intentos: m.intentos,
      maxIntentos: m.maxIntentos,
      proximoIntentoAt: m.proximoIntentoAt,
      error: m.error,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  });
}
