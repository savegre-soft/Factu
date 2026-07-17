import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
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
import { correoSalidaRoutes } from "./routes/correoSalida.js";
import { borradorRoutes } from "./routes/borradores.js";
import { chatRoutes } from "./routes/chat.js";
import { emisorRoutes } from "./routes/emisor.js";
import { estadisticasRoutes } from "./routes/estadisticas.js";
import { apiKeyRoutes } from "./routes/apiKeys.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { auditoriaRoutes } from "./routes/auditoria.js";
import { registrarLog } from "./services/logs/index.js";

/** Construye la instancia de Fastify con Swagger, autenticación y rutas. */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  // Swagger y auth deben registrarse antes que las rutas.
  registrarSwagger(app);
  registrarAuth(app);

  // Los errores no controlados (500) quedan en el registro del sistema, además
  // del logger de Fastify. Es un hook de observación: no altera la respuesta ni
  // el manejo de errores por defecto de Fastify (validaciones 4xx, etc.).
  app.addHook("onError", async (request, _reply, error: FastifyError) => {
    if ((error.statusCode ?? 500) < 500) return;
    registrarLog({
      nivel: "error",
      origen: "api",
      tenantId: request.user?.tenantId ?? null,
      mensaje: `${request.method} ${request.url} → ${error.message}`,
      detalle: error.stack ?? null,
    });
  });

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
  app.register(chatRoutes); // /chat/*  (mensajería entre usuarios del tenant)
  app.register(mensajeReceptorRoutes);
  app.register(documentosRecibidosRoutes); // /recibidos/*
  app.register(correoRoutes); // /correo/*  (buzón IMAP entrante)
  app.register(correoSalidaRoutes); // /correo-salida/*  (SMTP saliente)
  app.register(estadisticasRoutes); // /estadisticas/*
  app.register(apiKeyRoutes); // /api-keys/*  (integraciones)
  app.register(webhookRoutes); // /webhooks/*  (integraciones salientes)
  app.register(auditoriaRoutes); // /auditoria, /logs  (registro, solo admin)

  return app;
}
