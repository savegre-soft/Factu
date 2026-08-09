/**
 * Límite de peticiones.
 *
 * Un techo global generoso protege a la API de un cliente descontrolado, y las
 * rutas sensibles (login, registro, reseteo de contraseña y autenticación
 * contra Hacienda) llevan un límite mucho más estricto: sin él, probar
 * contraseñas por fuerza bruta no cuesta nada.
 *
 * La clave es el usuario autenticado cuando lo hay, y la IP cuando no: así una
 * oficina detrás de una sola IP pública no se bloquea entre sí.
 */
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

/** Rutas de autenticación: pocas peticiones por minuto. */
const RUTAS_SENSIBLES = [
  "/auth/login",
  "/auth/registro",
  "/auth/password/olvide",
  "/auth/password/reset",
  "/hacienda/login",
];

const MAX_GLOBAL = 300; // por minuto
const MAX_SENSIBLE = 10; // por minuto

function clave(request: FastifyRequest): string {
  // `user` solo está resuelto en rutas autenticadas; en las públicas cae en la IP.
  return request.user?.sub ?? request.ip;
}

export function registrarRateLimit(app: FastifyInstance): void {
  app.register(rateLimit, {
    global: true,
    max: (request) => (RUTAS_SENSIBLES.includes(request.routeOptions.url ?? "") ? MAX_SENSIBLE : MAX_GLOBAL),
    timeWindow: "1 minute",
    keyGenerator: clave,
    // La documentación y el health check no deben consumir cupo.
    allowList: (request) =>
      request.url.startsWith("/docs") || request.url === "/health" || request.url === "/",
    // El `statusCode` va en el cuerpo: sin él, Fastify trata la respuesta como
    // un error sin clasificar y responde 500 en lugar de 429.
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Demasiadas peticiones",
      detalle: `Máximo ${context.max} por ${context.after}. Probá de nuevo en unos segundos.`,
    }),
  });
}
