/**
 * Suscripción de Savegre a un tenant (lo que Savegre le cobra por usar
 * Factu) — panel interno de plataforma (Savegre Center). Sin fila propia,
 * un tenant se trata como "activa" (no bloqueado), mismo criterio que ya usa
 * el panel equivalente de RestroCloud.
 */
import { randomUUID } from "node:crypto";
import type {
  DatosSuscripcion,
  NuevoPagoSuscripcion,
  PagoSuscripcionRecord,
  PagoSuscripcionRepository,
  SuscripcionRecord,
  SuscripcionRepository,
} from "../../infra/repos/types.js";

/** Suscripción por defecto para un tenant sin fila propia (no bloqueado). */
function porDefecto(tenantId: string): SuscripcionRecord {
  const ahora = new Date();
  return {
    id: `default-${tenantId}`,
    tenantId,
    plan: "sin definir",
    estado: "activa",
    moneda: "CRC",
    ciclo: "mensual",
    descuentoTipo: null,
    descuentoValor: null,
    descuentoRazon: null,
    iniciaEn: ahora,
    renuevaEn: null,
    notas: null,
    createdAt: ahora,
    updatedAt: ahora,
  };
}

export interface DatosNuevoPago {
  monto: number;
  moneda: string;
  metodo: string;
  referencia?: string | null;
  notas?: string | null;
  registradoPor?: string | null;
}

export class SuscripcionService {
  constructor(
    private readonly suscripciones: SuscripcionRepository,
    private readonly pagos: PagoSuscripcionRepository,
  ) {}

  async obtener(tenantId: string): Promise<SuscripcionRecord> {
    return (await this.suscripciones.buscarPorTenant(tenantId)) ?? porDefecto(tenantId);
  }

  async actualizar(tenantId: string, datos: DatosSuscripcion): Promise<SuscripcionRecord> {
    return this.suscripciones.upsert(tenantId, datos);
  }

  /** Mapa tenantId → suscripción, solo para los tenants que ya tienen fila. */
  async mapaPorTenant(): Promise<Map<string, SuscripcionRecord>> {
    const todas = await this.suscripciones.listarTodas();
    return new Map(todas.map((s) => [s.tenantId, s]));
  }

  /** Registra un cobro. Si el tenant no tenía suscripción, crea una por defecto primero. */
  async registrarPago(tenantId: string, datos: DatosNuevoPago): Promise<PagoSuscripcionRecord> {
    let suscripcion = await this.suscripciones.buscarPorTenant(tenantId);
    if (!suscripcion) {
      const base = porDefecto(tenantId);
      suscripcion = await this.suscripciones.upsert(tenantId, {
        plan: base.plan,
        estado: base.estado,
        moneda: base.moneda,
        ciclo: base.ciclo,
        iniciaEn: base.iniciaEn,
      });
    }

    const nuevo: NuevoPagoSuscripcion = {
      id: randomUUID(),
      suscripcionId: suscripcion.id,
      monto: datos.monto,
      moneda: datos.moneda,
      metodo: datos.metodo,
      referencia: datos.referencia ?? null,
      notas: datos.notas ?? null,
      registradoPor: datos.registradoPor ?? null,
    };
    return this.pagos.crear(nuevo);
  }

  async listarPagos(tenantId: string): Promise<PagoSuscripcionRecord[]> {
    const suscripcion = await this.suscripciones.buscarPorTenant(tenantId);
    if (!suscripcion) return [];
    return this.pagos.listarPorSuscripcion(suscripcion.id);
  }
}
