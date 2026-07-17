/**
 * Poller de correo: cada cierto intervalo revisa los buzones activos y registra
 * los XML que hayan llegado. Corre dentro del proceso de la API.
 *
 * Se controla con CORREO_POLL_ENABLED y CORREO_POLL_MINUTOS. Evita solaparse
 * consigo mismo si una corrida tarda más que el intervalo.
 */
import { env } from "../../config/env.js";
import { correoService } from "./index.js";

let corriendo = false;

export function iniciarPollerCorreo(log: (msg: string) => void): void {
  if (!env.CORREO_POLL_ENABLED) {
    log("[correo] poller deshabilitado (CORREO_POLL_ENABLED=false)");
    return;
  }

  const intervaloMs = env.CORREO_POLL_MINUTOS * 60_000;

  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      await correoService.sincronizarTodos();
    } catch (err) {
      log(`[correo] error en el poll: ${(err as Error).message}`);
    } finally {
      corriendo = false;
    }
  };

  // `unref` para no impedir que el proceso termine si es lo único pendiente.
  setInterval(tick, intervaloMs).unref();
  log(`[correo] poller activo: revisa los buzones cada ${env.CORREO_POLL_MINUTOS} min`);
}
