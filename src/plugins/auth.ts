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
import { apiKeyService, API_KEY_PREFIJO } from "../services/apiKeys/index.js";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  rol: Rol;
  /** Presente para usuarios humanos; ausente en cuentas de servicio (API key). */
  email?: string;
  /** "service" cuando el actor es una API key; ausente/"user" para humanos. */
  kind?: "user" | "service";
  /** Cédulas de emisor permitidas (solo API keys); vacío/ausente = sin límite. */
  emisores?: string[];
  /** Etiqueta de la integración (solo API keys). */
  label?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

/** Extrae el token del header `Authorization: Bearer <token>`. */
function tokenDeAuthorization(request: FastifyRequest): string | undefined {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return undefined;
  return auth.slice("Bearer ".length).trim();
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

  /**
   * Resuelve al actor (humano por JWT o app externa por API key) y deja el
   * principal en `request.user`. Devuelve `true` si autenticó; si no, ya
   * respondió 401 y devuelve `false`.
   */
  async function autenticar(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const token = tokenDeAuthorization(request);

    // Cuenta de servicio: la key se presenta como Bearer y empieza con "factu_".
    if (token && token.startsWith(API_KEY_PREFIJO)) {
      const principal = await apiKeyService.autenticar(token);
      if (!principal) {
        reply.status(401).send({ error: "API key inválida, revocada o expirada" });
        return false;
      }
      request.user = principal;
      return true;
    }

    // Usuario humano: JWT de sesión.
    try {
      await request.jwtVerify();
      return true;
    } catch {
      reply.status(401).send({ error: "No autenticado (token ausente o inválido)" });
      return false;
    }
  }

  app.decorate("authenticate", async function (request: FastifyRequest, reply: FastifyReply) {
    await autenticar(request, reply);
  });

  app.decorate("requierePermiso", function (permiso: Permiso): preHandlerHookHandler {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!(await autenticar(request, reply))) return;
      if (!rolTienePermiso(request.user.rol, permiso)) {
        return reply.status(403).send({
          error: `Tu rol (${request.user.rol}) no tiene permiso para esta acción`,
        });
      }
    };
  });
}
