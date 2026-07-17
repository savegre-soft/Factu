/**
 * Auditoría: registro de las acciones de negocio relevantes, atribuidas a un
 * usuario o integración. Alimenta la pestaña "Auditoría" en Configuración.
 *
 * `registrar` es best-effort: nunca lanza ni bloquea al que la llama (una acción
 * de negocio no debe fallar porque su auditoría falle).
 */
import { randomUUID } from "node:crypto";
import { auditoriaRepository } from "../../infra/repos/index.js";
import type {
  ActorTipo,
  AuditoriaRecord,
  FiltroAuditoria,
} from "../../infra/repos/types.js";

export interface Actor {
  id: string | null;
  nombre: string;
  tipo: ActorTipo;
  ip?: string | null;
}

export interface EntradaAuditoria {
  tenantId: string;
  actor: Actor;
  accion: string;
  recurso: string;
  recursoId?: string | null;
  detalle?: string | null;
}

export function registrarAuditoria(entrada: EntradaAuditoria): void {
  void auditoriaRepository
    .crear({
      id: randomUUID(),
      tenantId: entrada.tenantId,
      actorId: entrada.actor.id,
      actorNombre: entrada.actor.nombre,
      actorTipo: entrada.actor.tipo,
      accion: entrada.accion,
      recurso: entrada.recurso,
      recursoId: entrada.recursoId ?? null,
      detalle: entrada.detalle ?? null,
      ip: entrada.actor.ip ?? null,
    })
    .catch(() => {});
}

export function listarAuditoria(
  tenantId: string,
  filtro?: FiltroAuditoria,
): Promise<AuditoriaRecord[]> {
  return auditoriaRepository.listarPorTenant(tenantId, filtro);
}

/** Construye el actor a partir del principal autenticado (JWT o API key). */
export function actorDesde(
  user: { sub: string; email?: string; kind?: "user" | "service"; label?: string },
  ip?: string | null,
): Actor {
  const esServicio = user.kind === "service";
  return {
    id: user.sub,
    nombre: esServicio ? user.label ?? "Integración" : user.email ?? "Usuario",
    tipo: esServicio ? "apikey" : "usuario",
    ip: ip ?? null,
  };
}
