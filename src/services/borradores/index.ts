/** Composición del servicio de borradores sobre el repositorio activo. */
import { borradorRepository } from "../../infra/repos/index.js";
import { BorradorService } from "./borradorService.js";

export const borradorService = new BorradorService(borradorRepository);

export * from "./borradorService.js";
