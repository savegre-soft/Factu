/**
 * Sesión con el IDP de Hacienda (por emisor). Antes vivía en /auth/*; ahora está
 * bajo /hacienda/* para no chocar con la autenticación de usuarios.
 *
 * Requiere usuario autenticado con permiso de emisión, y que el emisor pertenezca
 * a su tenant.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tokenStore, HaciendaAuthError, SinSesionHaciendaError } from "../services/auth/index.js";
import { haciendaLoginSchema, haciendaEmisorSchema } from "../plugins/schemas.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";
import { esCredencialInvalida } from "../domain/auth/erroresIdp.js";

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
          // El IDP devuelve 400 invalid_grant cuando el usuario o la clave están
          // mal: eso es culpa de las credenciales (401), no de la integración
          // (502). Mandarlo todo a 502 hacía imposible distinguir un tecleo
          // equivocado de Hacienda caída.
          const esCredencial = esCredencialInvalida(err.status, err.body);
          return reply.status(esCredencial ? 401 : 502).send({
            error: esCredencial
              ? "Usuario o contraseña de Hacienda incorrectos"
              : "Hacienda no pudo procesar la autenticación",
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
        // 401 solo cuando falta la sesión; un fallo del IDP al renovar es 502.
        if (err instanceof SinSesionHaciendaError) {
          return reply.status(401).send({ error: err.message });
        }
        request.log.error(err);
        return reply.status(502).send({
          error: "No se pudo renovar la sesión con Hacienda",
          detalle: (err as Error).message,
        });
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
