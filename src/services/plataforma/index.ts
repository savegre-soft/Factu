/** Composición de los servicios de plataforma (panel interno de Savegre) sobre los repositorios activos. */
import {
  credencialPlataformaRepository,
  pagoSuscripcionRepository,
  suscripcionRepository,
} from "../../infra/repos/index.js";
import { CredencialPlataformaService } from "./credencialPlataformaService.js";
import { SuscripcionService } from "./suscripcionService.js";

export const credencialPlataformaService = new CredencialPlataformaService(credencialPlataformaRepository);
export const suscripcionService = new SuscripcionService(suscripcionRepository, pagoSuscripcionRepository);

export * from "./credencialPlataformaService.js";
export * from "./suscripcionService.js";
