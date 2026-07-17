/**
 * Borradores de factura.
 *
 *   POST   /borradores        → guarda un borrador
 *   GET    /borradores        → lista los borradores del tenant
 *   GET    /borradores/:id     → detalle (con los datos del formulario)
 *   PUT    /borradores/:id     → actualiza un borrador
 *   DELETE /borradores/:id     → elimina un borrador
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { borradorService } from "../services/borradores/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  borradorCrearSchema,
  borradorActualizarSchema,
  borradorListarSchema,
  borradorGetSchema,
  borradorEliminarSchema,
} from "../plugins/schemas.js";

const bodySchema = z.object({
  tipo: z.enum(["factura", "tiquete", "nota-credito", "nota-debito"]),
  cedulaEmisor: z.string().optional().nullable(),
  receptorNombre: z.string().optional().nullable(),
  total: z.number().optional(),
  datos: z.unknown(),
});

export async function borradorRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/borradores",
    { schema: borradorCrearSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      return reply.status(201).send(await borradorService.crear(request.user.tenantId, parsed.data));
    },
  );

  app.put(
    "/borradores/:id",
    { schema: borradorActualizarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const b = await borradorService.actualizar(request.user.tenantId, id, parsed.data);
      if (!b) return reply.status(404).send({ error: "Borrador no encontrado" });
      return b;
    },
  );

  app.get(
    "/borradores",
    { schema: borradorListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request) => {
      const lista = await borradorService.listar(request.user.tenantId);
      // El listado no incluye el JSON completo del formulario (puede ser grande).
      return lista.map(({ datos: _omit, ...resto }) => resto);
    },
  );

  app.get(
    "/borradores/:id",
    { schema: borradorGetSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const b = await borradorService.obtener(request.user.tenantId, id);
      if (!b) return reply.status(404).send({ error: "Borrador no encontrado" });
      return b;
    },
  );

  app.delete(
    "/borradores/:id",
    { schema: borradorEliminarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await borradorService.eliminar(request.user.tenantId, id);
      if (!ok) return reply.status(404).send({ error: "Borrador no encontrado" });
      return { id, eliminado: true };
    },
  );
}
