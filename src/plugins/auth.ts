/**
 * Plugin de autenticación y autorización.
 *
 * - Registra @fastify/jwt con el secreto de sesión.
 * - Expone `app.authenticate` (preHandler que exige un JWT válido).
 * - Expone `app.requierePermiso(permiso)` para guardas por rol.
 *
 * El JWT lleva el id del usuario, su tenant y su rol; a partir de él las rutas
 * saben quién actúa y sobre qué tenant, garantizando el aislamiento.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { env } from "../config/env.js";
import { Permiso, Rol, rolTienePermiso } from "../domain/auth/roles.js";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  rol: Rol;
  email: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requierePermiso: (permiso: Permiso) => preHandlerHookHandler;
  }
}

/** Secreto de firma efectivo (con aviso en desarrollo si no se configuró). */
function jwtSecret(): string {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET es obligatorio en producción");
  }
  // eslint-disable-next-line no-console
  console.warn("[auth] JWT_SECRET no configurado; usando secreto de desarrollo.");
  return "dev-jwt-secret-inseguro-solo-desarrollo";
}

export function registrarAuth(app: FastifyInstance): void {
  app.register(fastifyJwt, { secret: jwtSecret() });

  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: "No autenticado (token ausente o inválido)" });
    }
  });

  app.decorate("requierePermiso", function (permiso: Permiso): preHandlerHookHandler {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({ error: "No autenticado (token ausente o inválido)" });
      }
      if (!rolTienePermiso(request.user.rol, permiso)) {
        return reply.status(403).send({
          error: `Tu rol (${request.user.rol}) no tiene permiso para esta acción`,
        });
      }
    };
  });
}
