/** Composición del servicio de chat sobre los repositorios activos. */
import { mensajeRepository, usuarioRepository } from "../../infra/repos/index.js";
import { ChatService } from "./chatService.js";

export const chatService = new ChatService(mensajeRepository, usuarioRepository);

export * from "./chatService.js";
