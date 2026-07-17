/**
 * Estadísticas agregadas por organización (tenant).
 *
 * Los comprobantes se guardan por cédula de emisor, no por tenant, así que el
 * recorrido siempre parte de los emisores del tenant: eso mantiene el
 * aislamiento multi-tenant sin depender de un filtro que se pueda olvidar.
 *
 * Las cuentas se hacen en memoria sobre los repositorios existentes. Es
 * suficiente para el volumen actual; si un tenant llega a tener muchos
 * comprobantes, conviene mover los conteos a agregaciones en la base.
 */
import type {
  ComprobanteRecord,
  ComprobanteRepository,
  EmisorRecord,
  EmisorRepository,
  UsuarioRepository,
} from "../../infra/repos/types.js";

/** Filtro temporal opcional; los límites son inclusivos. */
export interface RangoFechas {
  desde?: Date;
  hasta?: Date;
}

export interface ConteoComprobantes {
  total: number;
  porEstado: Record<string, number>;
  porTipo: Record<string, number>;
  ultimaEmision: Date | null;
}

export interface ResumenTenant {
  usuarios: { total: number; porRol: Record<string, number> };
  emisores: { total: number; conCertificado: number };
  comprobantes: ConteoComprobantes;
}

export interface EstadisticasEmisor {
  cedula: string;
  nombre: string;
  tieneCertificado: boolean;
  comprobantes: ConteoComprobantes;
}

/** Un punto de la serie temporal (un día natural, en UTC). */
export interface PuntoSerie {
  /** Fecha en formato YYYY-MM-DD. */
  fecha: string;
  total: number;
}

function enRango(fecha: Date, rango: RangoFechas): boolean {
  if (rango.desde && fecha < rango.desde) return false;
  if (rango.hasta && fecha > rango.hasta) return false;
  return true;
}

/** Agrupa contando ocurrencias de una propiedad. */
function contarPor<T>(items: T[], clave: (item: T) => string): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const item of items) {
    const k = clave(item);
    conteo[k] = (conteo[k] ?? 0) + 1;
  }
  return conteo;
}

function contarComprobantes(comprobantes: ComprobanteRecord[]): ConteoComprobantes {
  const fechas = comprobantes.map((c) => c.createdAt.getTime());
  return {
    total: comprobantes.length,
    porEstado: contarPor(comprobantes, (c) => c.estado),
    porTipo: contarPor(comprobantes, (c) => c.tipo),
    ultimaEmision: fechas.length ? new Date(Math.max(...fechas)) : null,
  };
}

export class EstadisticasService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly emisores: EmisorRepository,
    private readonly comprobantes: ComprobanteRepository,
  ) {}

  /** Resumen global del tenant: usuarios, emisores y comprobantes. */
  async resumen(tenantId: string, rango: RangoFechas = {}): Promise<ResumenTenant> {
    const [usuarios, emisores] = await Promise.all([
      this.usuarios.listarPorTenant(tenantId),
      this.emisores.listarPorTenant(tenantId),
    ]);
    const comprobantes = await this.comprobantesDelTenant(emisores, rango);

    return {
      usuarios: {
        total: usuarios.length,
        porRol: contarPor(usuarios, (u) => u.rol),
      },
      emisores: {
        total: emisores.length,
        conCertificado: emisores.filter((e) => Boolean(e.certificado)).length,
      },
      comprobantes: contarComprobantes(comprobantes),
    };
  }

  /** Desglose por cada emisor del tenant. */
  async porEmisor(tenantId: string, rango: RangoFechas = {}): Promise<EstadisticasEmisor[]> {
    const emisores = await this.emisores.listarPorTenant(tenantId);
    return Promise.all(emisores.map((emisor) => this.deEmisor(emisor, rango)));
  }

  /** Estadísticas de un emisor concreto (ya validado como propio del tenant). */
  async deEmisor(emisor: EmisorRecord, rango: RangoFechas = {}): Promise<EstadisticasEmisor> {
    const comprobantes = (await this.comprobantes.listarPorEmisor(emisor.cedula)).filter((c) =>
      enRango(c.createdAt, rango),
    );
    return {
      cedula: emisor.cedula,
      nombre: emisor.nombre,
      tieneCertificado: Boolean(emisor.certificado),
      comprobantes: contarComprobantes(comprobantes),
    };
  }

  /** Comprobantes emitidos por día, ordenados de más antiguo a más reciente. */
  async serieDiaria(tenantId: string, rango: RangoFechas = {}): Promise<PuntoSerie[]> {
    const emisores = await this.emisores.listarPorTenant(tenantId);
    const comprobantes = await this.comprobantesDelTenant(emisores, rango);
    const porDia = contarPor(comprobantes, (c) => c.createdAt.toISOString().slice(0, 10));

    return Object.entries(porDia)
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /** Todos los comprobantes de los emisores dados, dentro del rango. */
  private async comprobantesDelTenant(
    emisores: EmisorRecord[],
    rango: RangoFechas,
  ): Promise<ComprobanteRecord[]> {
    const porEmisor = await Promise.all(
      emisores.map((e) => this.comprobantes.listarPorEmisor(e.cedula)),
    );
    return porEmisor.flat().filter((c) => enRango(c.createdAt, rango));
  }
}
