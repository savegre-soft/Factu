/**
 * Cabeceras de seguridad HTTP (helmet).
 *
 * La API responde JSON, no HTML, así que la mayoría de las protecciones del
 * navegador no aplican; lo que sí importa es no filtrar la URL de origen en el
 * `Referer`, impedir que un navegador adivine el tipo de contenido y forzar
 * HTTPS donde lo haya.
 *
 * La CSP se desactiva a propósito: /docs sirve Swagger y Scalar, que cargan
 * scripts y estilos propios, y una política restrictiva rompería la
 * documentación sin ganar nada en endpoints que devuelven JSON.
 */
import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

export function registrarSeguridad(app: FastifyInstance): void {
  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    // Sin esto, la URL completa de la API viaja como Referer a terceros.
    referrerPolicy: { policy: "no-referrer" },
    // HSTS solo tiene sentido servido por HTTPS; en desarrollo estorbaría.
    hsts: env.NODE_ENV === "production" ? { maxAge: 15552000, includeSubDomains: true } : false,
  });
}
