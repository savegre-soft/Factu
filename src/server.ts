import Fastify from "fastify";
import { env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { claveRoutes } from "./routes/clave.js";
import { authRoutes } from "./routes/auth.js";
import { facturaRoutes } from "./routes/factura.js";
import { firmaRoutes } from "./routes/firma.js";
import { comprobanteRoutes } from "./routes/comprobante.js";
import { mensajeReceptorRoutes } from "./routes/mensajeReceptor.js";

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(healthRoutes);
  app.register(claveRoutes);
  app.register(authRoutes);
  app.register(facturaRoutes);
  app.register(firmaRoutes);
  app.register(comprobanteRoutes);
  app.register(mensajeReceptorRoutes);
  return app;
}

const app = buildServer();

app.listen({ port: env.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
