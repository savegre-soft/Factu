/**
 * Sesión del usuario en una cookie `httpOnly`.
 *
 * Antes el JWT viajaba en `localStorage` y cualquier XSS podía leerlo y robar
 * la sesión completa. En una cookie `httpOnly` el JavaScript de la página no
 * puede tocarlo: un XSS puede hacer peticiones en nombre del usuario mientras
 * la pestaña está abierta, pero no llevarse el token.
 *
 * El header `Authorization: Bearer` se mantiene: lo usan las API keys de las
 * integraciones y los clientes que no son un navegador.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";

export const COOKIE_SESION = "factu_sesion";

/** Segundos de vida de la cookie, derivados de JWT_EXPIRES_IN ("8h", "7d"…). */
function duracionSegundos(): number {
  const m = /^(\d+)\s*([smhd])$/.exec(env.JWT_EXPIRES_IN.trim());
  if (!m) return 8 * 60 * 60;
  const cantidad = Number(m[1]);
  const factor = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];
  return cantidad * factor;
}

function opciones() {
  return {
    httpOnly: true,
    // `lax` deja pasar la cookie en la vuelta del OAuth (navegación GET) pero la
    // bloquea en peticiones cross-site, que es de donde vendría un CSRF.
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production" && env.API_PUBLIC_URL.startsWith("https://"),
    path: "/",
    maxAge: duracionSegundos(),
  };
}

/** Deja la sesión iniciada en el navegador. */
export function ponerCookieSesion(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_SESION, token, opciones());
}

/** Cierra la sesión del navegador. */
export function borrarCookieSesion(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_SESION, { path: "/" });
}

export function leerCookieSesion(request: FastifyRequest): string | undefined {
  return request.cookies?.[COOKIE_SESION];
}
