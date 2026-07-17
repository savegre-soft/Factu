/**
 * Registro del sistema (logs técnicos): pollers, entregas, webhooks y errores.
 * Alimenta la pestaña "Registros" en Configuración.
 *
 * Persiste eventos notables además de emitirlos al logger de Fastify. Es
 * best-effort: nunca lanza ni bloquea al que lo llama.
 */
import { randomUUID } from "node:crypto";
import { logRepository } from "../../infra/repos/index.js";
import type { FiltroLog, LogRecord, NivelLog } from "../../infra/repos/types.js";

export interface EntradaLog {
  nivel: NivelLog;
  origen: string;
  mensaje: string;
  /** Tenant asociado; null/omitido = evento global de la plataforma. */
  tenantId?: string | null;
  detalle?: string | null;
}

export function registrarLog(entrada: EntradaLog): void {
  void logRepository
    .crear({
      id: randomUUID(),
      tenantId: entrada.tenantId ?? null,
      nivel: entrada.nivel,
      origen: entrada.origen,
      mensaje: entrada.mensaje,
      detalle: entrada.detalle ?? null,
    })
    .catch(() => {});
}

export function listarLogs(tenantId: string, filtro?: FiltroLog): Promise<LogRecord[]> {
  return logRepository.listarPorTenant(tenantId, filtro);
}
