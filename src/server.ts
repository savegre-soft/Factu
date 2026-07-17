import Fastify from "fastify";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { claveRoutes } from "./routes/clave.js";
import { authRoutes } from "./routes/auth.js";
import { facturaRoutes } from "./routes/factura.js";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(healthRoutes);
  app.register(claveRoutes);
  app.register(authRoutes);
  app.register(facturaRoutes);
  return app;
}

const app = buildServer();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
