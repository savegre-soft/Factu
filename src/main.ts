/** Punto de entrada: arranca el servidor HTTP. */
import { env } from "./config/env.js";
import { buildServer } from "./server.js";

const app = buildServer();

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(
  () => {
    app.log.info(`Documentación disponible en http://localhost:${env.PORT}/docs`);
  },
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);
