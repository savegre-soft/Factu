/** Composición del servicio de documentos recibidos sobre el repositorio activo. */
import { documentoRecibidoRepository } from "../../infra/repos/index.js";
import { DocumentosRecibidosService } from "./documentosRecibidosService.js";

export const documentosRecibidosService = new DocumentosRecibidosService(
  documentoRecibidoRepository,
);

export * from "./documentosRecibidosService.js";
