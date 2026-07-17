/** Poller de reintentos de webhooks (mismo patrón que correo/entrega). */
import { env } from "../../config/env.js";
import { webhookService } from "./index.js";

let corriendo = false;

export function iniciarPollerWebhooks(log: (msg: string) => void): void {
  if (!env.WEBHOOK_ENABLED) {
    log("[webhooks] deshabilitados (WEBHOOK_ENABLED=false)");
    return;
  }
  const intervaloMs = env.WEBHOOK_POLL_MINUTOS * 60_000;
  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await webhookService.reintentarPendientes();
    } catch (err) {
      log(`[webhooks] error al reintentar: ${(err as Error).message}`);
    } finally {
      corriendo = false;
    }
  };
  setInterval(tick, intervaloMs).unref();
  log(`[webhooks] reintentos activos cada ${env.WEBHOOK_POLL_MINUTOS} min`);
}
