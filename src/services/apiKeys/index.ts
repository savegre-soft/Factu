/** Composición del servicio de API keys sobre el repositorio activo. */
import { apiKeyRepository } from "../../infra/repos/index.js";
import { ApiKeyService } from "./apiKeyService.js";

export const apiKeyService = new ApiKeyService(apiKeyRepository);

export * from "./apiKeyService.js";
