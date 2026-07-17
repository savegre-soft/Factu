/**
 * Poller de reintentos de entrega: cada cierto intervalo reintenta los correos
 * fallidos/pendientes que aún no agotaron sus intentos. Corre en el proceso de
 * la API (mismo patrón que el poller de correo entrante).
 */
import { env } from "../../config/env.js";
import { entregaService } from "./index.js";

let corriendo = false;

export function iniciarPollerEntrega(log: (msg: string) => void): void {
  if (!env.ENTREGA_ENABLED) {
    log("[entrega] deshabilitada (ENTREGA_ENABLED=false)");
    return;
  }

  const intervaloMs = env.ENTREGA_POLL_MINUTOS * 60_000;

  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await entregaService.reintentarPendientes();
    } catch (err) {
      log(`[entrega] error al reintentar: ${(err as Error).message}`);
    } finally {
      corriendo = false;
    }
  };

  setInterval(tick, intervaloMs).unref();
  log(`[entrega] reintentos activos cada ${env.ENTREGA_POLL_MINUTOS} min`);
}
