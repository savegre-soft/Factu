import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tokenStore, HaciendaAuthError } from "../services/auth/index.js";
import { authLoginSchema, authTokenSchema, authLogoutSchema } from "../plugins/schemas.js";

const loginSchema = z.object({
  /** Clave bajo la que se cachean los tokens (normalmente la cédula del emisor). */
  emisor: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

const emisorSchema = z.object({ emisor: z.string().min(1) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { schema: authLoginSchema }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const { emisor, username, password } = parsed.data;
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
  });

  // Devuelve un access token válido (renovando si hace falta). Útil para depurar.
  app.post("/auth/token", { schema: authTokenSchema }, async (request, reply) => {
    const parsed = emisorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    try {
      const accessToken = await tokenStore.getAccessToken(parsed.data.emisor);
      return { accessToken };
    } catch (err) {
      return reply.status(401).send({ error: (err as Error).message });
    }
  });

  app.post("/auth/logout", { schema: authLogoutSchema }, async (request, reply) => {
    const parsed = emisorSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    await tokenStore.logout(parsed.data.emisor);
    return { ok: true };
  });
}
