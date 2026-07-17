/** Composición del servicio de estadísticas sobre los repositorios activos. */
import {
  comprobanteRepository,
  emisorRepository,
  usuarioRepository,
} from "../../infra/repos/index.js";
import { EstadisticasService } from "./estadisticasService.js";

export const estadisticasService = new EstadisticasService(
  usuarioRepository,
  emisorRepository,
  comprobanteRepository,
);

export * from "./estadisticasService.js";
