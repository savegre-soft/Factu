import Fastify, { type FastifyInstance } from "fastify";
import { registrarSwagger } from "./plugins/swagger.js";
import { healthRoutes } from "./routes/health.js";
import { claveRoutes } from "./routes/clave.js";
import { authRoutes } from "./routes/auth.js";
import { facturaRoutes } from "./routes/factura.js";
import { firmaRoutes } from "./routes/firma.js";
import { comprobanteRoutes } from "./routes/comprobante.js";
import { mensajeReceptorRoutes } from "./routes/mensajeReceptor.js";
import { emisorRoutes } from "./routes/emisor.js";

/** Construye la instancia de Fastify con Swagger y todas las rutas registradas. */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Swagger debe registrarse antes que las rutas para capturar sus esquemas.
  registrarSwagger(app);

  app.register(healthRoutes);
  app.register(claveRoutes);
  app.register(authRoutes);
  app.register(emisorRoutes);
  app.register(facturaRoutes);
  app.register(firmaRoutes);
  app.register(comprobanteRoutes);
  app.register(mensajeReceptorRoutes);

  return app;
}
