import Fastify, { type FastifyInstance } from "fastify";
import { registrarSwagger } from "./plugins/swagger.js";
import { registrarAuth } from "./plugins/auth.js";
import { homeRoutes } from "./routes/home.js";
import { healthRoutes } from "./routes/health.js";
import { ambienteRoutes } from "./routes/ambiente.js";
import { claveRoutes } from "./routes/clave.js";
import { authRoutes } from "./routes/auth.js";
import { haciendaRoutes } from "./routes/hacienda.js";
import { facturaRoutes } from "./routes/factura.js";
import { firmaRoutes } from "./routes/firma.js";
import { comprobanteRoutes } from "./routes/comprobante.js";
import { mensajeReceptorRoutes } from "./routes/mensajeReceptor.js";
import { documentosRecibidosRoutes } from "./routes/documentosRecibidos.js";
import { correoRoutes } from "./routes/correo.js";
import { borradorRoutes } from "./routes/borradores.js";
import { emisorRoutes } from "./routes/emisor.js";
import { estadisticasRoutes } from "./routes/estadisticas.js";
import { apiKeyRoutes } from "./routes/apiKeys.js";

/** Construye la instancia de Fastify con Swagger, autenticación y rutas. */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Swagger y auth deben registrarse antes que las rutas.
  registrarSwagger(app);
  registrarAuth(app);

  app.register(homeRoutes);
  app.register(healthRoutes);
  app.register(ambienteRoutes); // /ambiente  (stag/prod, solo lectura)
  app.register(claveRoutes);
  app.register(authRoutes); // /auth/*  (usuarios)
  app.register(haciendaRoutes); // /hacienda/*  (sesión IDP)
  app.register(emisorRoutes);
  app.register(facturaRoutes);
  app.register(firmaRoutes);
  app.register(comprobanteRoutes);
  app.register(borradorRoutes); // /borradores/*
  app.register(mensajeReceptorRoutes);
  app.register(documentosRecibidosRoutes); // /recibidos/*
  app.register(correoRoutes); // /correo/*  (buzón IMAP)
  app.register(estadisticasRoutes); // /estadisticas/*
  app.register(apiKeyRoutes); // /api-keys/*  (integraciones)

  return app;
}
