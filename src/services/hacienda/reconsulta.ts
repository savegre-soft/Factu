/**
 * Re-consulta del estado de comprobantes que quedaron sin veredicto.
 *
 * Durante la emisión se espera el estado unos 15 segundos (5 intentos × 3 s). Si
 * Hacienda tarda más, el comprobante se queda en "recibido" o "procesando" para
 * siempre: nadie vuelve a preguntar. Esto lo arregla — un barrido periódico que
 * pregunta por los pendientes y, cuando el veredicto llega, dispara lo mismo que
 * habría disparado la emisión (webhook, notificación y entrega al cliente).
 */
import type { ComprobanteRepository, EmisorRepository } from "../../infra/repos/types.js";
import type { HaciendaReceptionClient } from "./reception.js";
import type { TokenStore } from "../auth/tokenStore.js";

export interface DependenciasReconsulta {
  comprobantes: ComprobanteRepository;
  emisores: EmisorRepository;
  cliente: Pick<HaciendaReceptionClient, "consultarEstado">;
  tokens: Pick<TokenStore, "getAccessToken">;
  /** Efectos al alcanzar un estado definitivo. Se inyectan para poder probar. */
  alResolver: (info: {
    tenantId: string;
    clave: string;
    cedulaEmisor: string;
    tipo: string;
    consecutivo: string;
    estado: string;
  }) => Promise<void> | void;
  log?: (mensaje: string) => void;
}

export interface ResultadoReconsulta {
  revisados: number;
  resueltos: number;
  omitidos: number;
}

/** Estados que ya no vale la pena reconsultar. */
const FINALES = new Set(["aceptado", "rechazado"]);

export class ReconsultaService {
  constructor(private readonly deps: DependenciasReconsulta) {}

  /**
   * Revisa hasta `limite` comprobantes pendientes creados en los últimos
   * `maxAntiguedadMs`. Nunca lanza: un fallo con un comprobante no debe frenar
   * el resto ni tumbar el poller.
   */
  async barrer(limite = 50, maxAntiguedadMs = 7 * 24 * 60 * 60_000): Promise<ResultadoReconsulta> {
    const pendientes = await this.deps.comprobantes.listarNoFinalizados(limite, maxAntiguedadMs);
    let resueltos = 0;
    let omitidos = 0;

    for (const comprobante of pendientes) {
      try {
        // Sin sesión del emisor no se puede preguntar: se reintenta en el
        // siguiente barrido, cuando alguien haya iniciado sesión.
        const token = await this.deps.tokens.getAccessToken(comprobante.cedulaEmisor);
        const estado = await this.deps.cliente.consultarEstado(token, comprobante.clave);

        if (!FINALES.has(estado.estado)) {
          omitidos++;
          continue;
        }

        await this.deps.comprobantes.actualizarEstado(
          comprobante.clave,
          estado.estado,
          estado.respuestaXml,
        );
        resueltos++;

        const emisor = await this.deps.emisores.buscar(comprobante.cedulaEmisor);
        if (emisor) {
          await this.deps.alResolver({
            tenantId: emisor.tenantId,
            clave: comprobante.clave,
            cedulaEmisor: comprobante.cedulaEmisor,
            tipo: comprobante.tipo,
            consecutivo: comprobante.consecutivo,
            estado: estado.estado,
          });
        }
        this.deps.log?.(`[reconsulta] ${comprobante.clave} → ${estado.estado}`);
      } catch (err) {
        omitidos++;
        this.deps.log?.(
          `[reconsulta] ${comprobante.clave} sin resolver: ${(err as Error).message}`,
        );
      }
    }

    return { revisados: pendientes.length, resueltos, omitidos };
  }
}
