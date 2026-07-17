/**
 * Sesión con el IDP de Hacienda (por emisor). Antes vivía en /auth/*; ahora está
 * bajo /hacienda/* para no chocar con la autenticación de usuarios.
 *
 * Requiere usuario autenticado con permiso de emisión, y que el emisor pertenezca
 * a su tenant.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tokenStore, HaciendaAuthError } from "../services/auth/index.js";
import { haciendaLoginSchema, haciendaEmisorSchema } from "../plugins/schemas.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";

const loginSchema = z.object({
  emisor: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});
const emisorSchema = z.object({ emisor: z.string().min(1) });

export async function haciendaRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/hacienda/login",
    { schema: haciendaLoginSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const { emisor, username, password } = parsed.data;
      if (!(await emisorDelTenant(request, reply, emisor))) return;

      try {
        const tokens = await tokenStore.login(emisor, username, password);
        return {
          emisor,
          accessExpiresAt: tokens.accessExpiresAt,
          refreshExpiresAt: tokens.refreshExpiresAt,
        };
      } catch (err) {
        if (err instanceof HaciendaAuthError) {
          return reply.status(err.status === 401 ? 401 : 502).send({
            error: "Autenticación con Hacienda falló",
            detalle: err.body,
          });
        }
        throw err;
      }
    },
  );

  app.post(
    "/hacienda/token",
    { schema: haciendaEmisorSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = emisorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      if (!(await emisorDelTenant(request, reply, parsed.data.emisor))) return;
      try {
        const accessToken = await tokenStore.getAccessToken(parsed.data.emisor);
        return { accessToken };
      } catch (err) {
        return reply.status(401).send({ error: (err as Error).message });
      }
    },
  );

  app.post(
    "/hacienda/logout",
    { schema: haciendaEmisorSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = emisorSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      if (!(await emisorDelTenant(request, reply, parsed.data.emisor))) return;
      await tokenStore.logout(parsed.data.emisor);
      return { ok: true };
    },
  );
}
