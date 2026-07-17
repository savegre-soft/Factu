/** Composición del servicio de webhooks + helper para disparar eventos. */
import { env } from "../../config/env.js";
import {
  webhookRepository,
  webhookEntregaRepository,
  masterKey,
} from "../../infra/repos/index.js";
import { WebhookService } from "./webhookService.js";

export const webhookService = new WebhookService(
  webhookRepository,
  webhookEntregaRepository,
  masterKey(),
  { habilitado: env.WEBHOOK_ENABLED, maxIntentos: env.WEBHOOK_MAX_INTENTOS },
);

/**
 * Dispara un evento sin bloquear ni romper al que lo emite. Los sitios de la app
 * (emisión, recepción, entrega) llaman a esto; el servicio hace el resto.
 */
export function emitirEvento(tenantId: string, evento: string, datos: unknown): void {
  void webhookService.emitir(tenantId, evento, datos).catch(() => {});
}

export * from "./webhookService.js";
