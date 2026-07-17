/** Composición del servicio de correo y del poller sobre los repositorios activos. */
import { buzonRepository } from "../../infra/repos/index.js";
import { masterKey } from "../../infra/repos/index.js";
import { documentosRecibidosService } from "../documentosRecibidos/index.js";
import { CorreoService } from "./correoService.js";

export const correoService = new CorreoService(
  buzonRepository,
  documentosRecibidosService,
  masterKey(),
);

export * from "./correoService.js";
