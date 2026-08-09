/** Punto de entrada: arranca el servidor HTTP. */
import { env } from "./config/env.js";
import { buildServer } from "./server.js";
import { iniciarPollerCorreo } from "./services/correo/poller.js";
import { iniciarPollerEntrega } from "./services/entrega/poller.js";
import { iniciarPollerWebhooks } from "./services/webhooks/poller.js";
import { iniciarPollerNotificaciones } from "./services/notificaciones/poller.js";
import { iniciarPollerReconsulta } from "./services/hacienda/pollerReconsulta.js";

const app = buildServer();

// Red de seguridad: un error no controlado (p. ej. un socket del poller de
// correo) NO debe tumbar toda la API. Se registra y el proceso sigue vivo.
process.on("unhandledRejection", (razon) => {
  app.log.error({ razon }, "unhandledRejection (ignorado para no caer)");
});
process.on("uncaughtException", (err) => {
  app.log.error({ err }, "uncaughtException (ignorado para no caer)");
});

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(
  () => {
    app.log.info(`Documentación disponible en http://localhost:${env.PORT}/docs`);
    // Revisión periódica de los buzones de correo (XML entrantes).
    iniciarPollerCorreo((msg) => app.log.info(msg));
    // Reintentos de entrega del comprobante al cliente (correo saliente).
    iniciarPollerEntrega((msg) => app.log.info(msg));
    // Reintentos de webhooks salientes (integraciones con sistemas externos).
    iniciarPollerWebhooks((msg) => app.log.info(msg));
    // Reintentos de notificaciones (SMS, WhatsApp, Slack, Teams).
    iniciarPollerNotificaciones((msg) => app.log.info(msg));
    // Comprobantes que Hacienda tardó en resolver: se vuelven a consultar.
    iniciarPollerReconsulta((msg) => app.log.info(msg));
  },
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);
