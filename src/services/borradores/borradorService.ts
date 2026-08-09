/**
 * Borradores de factura: guardan el estado del formulario de emisión (JSON) para
 * retomarlo luego. Toda operación queda acotada al tenant que actúa.
 */
import { randomUUID } from "node:crypto";
import type { BorradorRecord, BorradorRepository } from "../../infra/repos/types.js";

export interface DatosBorrador {
  tipo: string;
  cedulaEmisor?: string | null;
  receptorNombre?: string | null;
  total?: number;
  /** Estado del formulario (objeto arbitrario). Se serializa a JSON. */
  datos?: unknown;
}

/** Vista del borrador con `datos` ya deserializado. */
export interface BorradorPublico {
  id: string;
  tipo: string;
  cedulaEmisor: string | null;
  receptorNombre: string | null;
  total: number;
  datos: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function publico(b: BorradorRecord): BorradorPublico {
  let datos: unknown = null;
  try {
    datos = JSON.parse(b.datos);
  } catch {
    datos = null;
  }
  return {
    id: b.id,
    tipo: b.tipo,
    cedulaEmisor: b.cedulaEmisor,
    receptorNombre: b.receptorNombre,
    total: b.total,
    datos,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export class BorradorService {
  constructor(private readonly repo: BorradorRepository) {}

  async crear(tenantId: string, d: DatosBorrador): Promise<BorradorPublico> {
    const rec = await this.repo.crear({
      id: randomUUID(),
      tenantId,
      tipo: d.tipo,
      cedulaEmisor: d.cedulaEmisor ?? null,
      receptorNombre: d.receptorNombre ?? null,
      total: d.total ?? 0,
      datos: JSON.stringify(d.datos ?? {}),
    });
    return publico(rec);
  }

  /** Actualiza un borrador del tenant. null si no existe o es de otro tenant. */
  async actualizar(tenantId: string, id: string, d: DatosBorrador): Promise<BorradorPublico | null> {
    const existente = await this.repo.buscarPorId(id);
    if (!existente || existente.tenantId !== tenantId) return null;
    const rec = await this.repo.actualizar(id, {
      tipo: d.tipo,
      cedulaEmisor: d.cedulaEmisor ?? null,
      receptorNombre: d.receptorNombre ?? null,
      total: d.total ?? 0,
      datos: JSON.stringify(d.datos ?? {}),
    });
    return publico(rec);
  }

  async listar(
    tenantId: string,
    pagina?: { limite: number; desplazamiento: number },
  ): Promise<{ items: BorradorPublico[]; total: number }> {
    const [lista, total] = await Promise.all([
      this.repo.listarPorTenant(tenantId, pagina),
      this.repo.contarPorTenant(tenantId),
    ]);
    return { items: lista.map(publico), total };
  }

  async obtener(tenantId: string, id: string): Promise<BorradorPublico | null> {
    const b = await this.repo.buscarPorId(id);
    return b && b.tenantId === tenantId ? publico(b) : null;
  }

  async eliminar(tenantId: string, id: string): Promise<boolean> {
    const b = await this.repo.buscarPorId(id);
    if (!b || b.tenantId !== tenantId) return false;
    await this.repo.eliminar(id);
    return true;
  }
}
