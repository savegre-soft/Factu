/**
 * Chat entre usuarios del tenant.
 *
 *   GET  /chat/contactos               → usuarios del tenant + no leídos + último msg
 *   GET  /chat/no-leidos               → total de mensajes sin leer (badge)
 *   GET  /chat/mensajes/:usuarioId     → conversación con un usuario (marca leídos)
 *   POST /chat/mensajes                → envía un mensaje { para, texto }
 *
 * Requiere usuario humano autenticado (las API keys de servicio no chatean).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { chatService } from "../services/chat/index.js";
import {
  chatContactosSchema,
  chatNoLeidosSchema,
  chatConversacionSchema,
  chatEnviarSchema,
} from "../plugins/schemas.js";

const enviarSchema = z.object({
  para: z.string().min(1),
  texto: z.string().min(1).max(4000),
});

/** El chat es solo para personas; una API key de servicio no tiene con quién chatear. */
function esServicio(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.kind === "service") {
    reply.status(403).send({ error: "El chat es solo para usuarios" });
    return true;
  }
  return false;
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/contactos", { schema: chatContactosSchema, preHandler: app.authenticate }, async (request, reply) => {
    if (esServicio(request, reply)) return;
    return chatService.contactos(request.user.tenantId, request.user.sub);
  });

  app.get("/chat/no-leidos", { schema: chatNoLeidosSchema, preHandler: app.authenticate }, async (request, reply) => {
    if (esServicio(request, reply)) return;
    const total = await chatService.totalNoLeidos(request.user.tenantId, request.user.sub);
    return { total };
  });

  app.get(
    "/chat/mensajes/:usuarioId",
    { schema: chatConversacionSchema, preHandler: app.authenticate },
    async (request, reply) => {
      if (esServicio(request, reply)) return;
      const otroId = (request.params as { usuarioId: string }).usuarioId;
      const conv = await chatService.conversacion(request.user.tenantId, request.user.sub, otroId);
      // Al abrir la conversación, lo recibido queda como leído.
      await chatService.marcarLeidos(request.user.tenantId, request.user.sub, otroId);
      return conv.map((m) => ({
        id: m.id,
        deId: m.deId,
        paraId: m.paraId,
        texto: m.texto,
        mio: m.deId === request.user.sub,
        createdAt: m.createdAt,
      }));
    },
  );

  app.post("/chat/mensajes", { schema: chatEnviarSchema, preHandler: app.authenticate }, async (request, reply) => {
    if (esServicio(request, reply)) return;
    const parsed = enviarSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    try {
      const m = await chatService.enviar(
        request.user.tenantId,
        request.user.sub,
        parsed.data.para,
        parsed.data.texto,
      );
      return reply.status(201).send({
        id: m.id,
        deId: m.deId,
        paraId: m.paraId,
        texto: m.texto,
        mio: true,
        createdAt: m.createdAt,
      });
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
