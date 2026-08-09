/**
 * Poller de re-consulta: cada cierto intervalo pregunta a Hacienda por los
 * comprobantes que quedaron sin veredicto y, cuando llega, cierra el ciclo
 * (webhook, notificación y entrega al cliente) igual que lo habría hecho la
 * emisión si Hacienda hubiera contestado a tiempo.
 *
 * Se controla con RECONSULTA_ENABLED y RECONSULTA_MINUTOS.
 */
import { env } from "../../config/env.js";
import { comprobanteRepository, emisorRepository } from "../../infra/repos/index.js";
import { tokenStore } from "../auth/index.js";
import { entregaService } from "../entrega/index.js";
import { parsearParaPdf } from "../entrega/comprobantePdf.js";
import { emitirEvento } from "../webhooks/index.js";
import { notificarEvento } from "../notificaciones/index.js";
import { receptionClient } from "./index.js";
import { ReconsultaService } from "./reconsulta.js";

let corriendo = false;

export function iniciarPollerReconsulta(log: (msg: string) => void): void {
  if (!env.RECONSULTA_ENABLED) {
    log("[reconsulta] deshabilitada (RECONSULTA_ENABLED=false)");
    return;
  }

  const servicio = new ReconsultaService({
    comprobantes: comprobanteRepository,
    emisores: emisorRepository,
    cliente: receptionClient,
    tokens: tokenStore,
    log,
    alResolver: async (info) => {
      const evento = `comprobante.${info.estado}`;
      const datosEvento = {
        clave: info.clave,
        tipo: info.tipo,
        consecutivo: info.consecutivo,
        estado: info.estado,
        cedulaEmisor: info.cedulaEmisor,
      };
      emitirEvento(info.tenantId, evento, datosEvento);
      notificarEvento(info.tenantId, evento, datosEvento);

      // Aceptación tardía: el correo al cliente nunca se disparó, porque en el
      // momento de emitir el estado todavía no era definitivo.
      if (info.estado !== "aceptado") return;
      const comprobante = await comprobanteRepository.buscar(info.clave);
      if (!comprobante?.xmlFirmado) return;
      const correoReceptor = parsearParaPdf(comprobante.xmlFirmado).receptorCorreo;
      if (!correoReceptor) return;

      await entregaService
        .entregarAlAceptar({
          tenantId: info.tenantId,
          clave: info.clave,
          cedulaEmisor: info.cedulaEmisor,
          consecutivo: info.consecutivo,
          correoReceptor,
        })
        .catch((err) => log(`[reconsulta] no se pudo entregar ${info.clave}: ${err.message}`));
    },
  });

  const intervaloMs = env.RECONSULTA_MINUTOS * 60_000;

  const tick = async () => {
    if (corriendo) return;
    corriendo = true;
    try {
      const r = await servicio.barrer();
      if (r.revisados > 0) {
        log(`[reconsulta] ${r.revisados} pendiente(s): ${r.resueltos} resuelto(s)`);
      }
    } catch (err) {
      log(`[reconsulta] error en el barrido: ${(err as Error).message}`);
    } finally {
      corriendo = false;
    }
  };

  setInterval(tick, intervaloMs).unref();
  log(`[reconsulta] activa: revisa los pendientes cada ${env.RECONSULTA_MINUTOS} min`);
}
