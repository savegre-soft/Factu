/** Poller de reintentos de notificaciones (mismo patrón que webhooks/entrega). */
import { env } from "../../config/env.js";
import { notificacionesService } from "./index.js";

let corriendo = false;

export function iniciarPollerNotificaciones(log: (msg: string) => void): void {
  if (!env.NOTIF_ENABLED) {
    log("[notificaciones] deshabilitadas (NOTIF_ENABLED=false)");
    return;
  }
  const intervaloMs = env.NOTIF_POLL_MINUTOS * 60_000;
  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await notificacionesService.reintentarPendientes();
    } catch (err) {
      log(`[notificaciones] error al reintentar: ${(err as Error).message}`);
    } finally {
      corriendo = false;
    }
  };
  setInterval(tick, intervaloMs).unref();
  log(`[notificaciones] reintentos activos cada ${env.NOTIF_POLL_MINUTOS} min`);
}
