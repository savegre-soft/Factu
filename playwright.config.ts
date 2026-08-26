import { defineConfig } from "@playwright/test";

/**
 * Pruebas E2E de API (sin navegador — Factu no tiene frontend propio).
 *
 * Cada spec levanta el servidor real (`buildServer()`) EN PROCESO, con
 * `PERSISTENCIA=memoria`, y usa `request.newContext()` para llamarlo por
 * HTTP de verdad — así el flujo completo (Fastify + plugins + guardas +
 * rutas + servicios) queda bajo prueba, sin depender de Postgres.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
