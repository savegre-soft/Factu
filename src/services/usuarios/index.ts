/** Composición del servicio de usuarios sobre los repositorios activos. */
import { tenantRepository, usuarioRepository } from "../../infra/repos/index.js";
import { UsuarioService } from "./usuarioService.js";

export const usuarioService = new UsuarioService(tenantRepository, usuarioRepository);

export * from "./usuarioService.js";
export * from "./password.js";
