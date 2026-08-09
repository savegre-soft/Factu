/**
 * Estadísticas agregadas por organización (tenant).
 *
 * Los comprobantes se guardan por cédula de emisor, no por tenant, así que el
 * recorrido siempre parte de los emisores del tenant: eso mantiene el
 * aislamiento multi-tenant sin depender de un filtro que se pueda olvidar.
 *
 * Los conteos y los importes los agrega la base (GROUP BY): aquí no se
 * materializa ni una fila de comprobante, así que el coste no crece con el
 * histórico del tenant.
 */
import type {
  AgregadoComprobantes,
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

/** Importes facturados en una moneda, con el desglose por mes. */
export interface MontosPorMoneda {
  moneda: string;
  /** Neto: las notas de crédito restan. */
  total: number;
  cantidad: number;
  /** "YYYY-MM" → neto del mes. */
  porMes: Record<string, number>;
}

/** Un punto de la serie temporal (un día natural, en UTC). */
export interface PuntoSerie {
  /** Fecha en formato YYYY-MM-DD. */
  fecha: string;
  total: number;
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

/**
 * Construye el conteo a partir de las filas agregadas que devuelve la base (una
 * por combinación emisor/estado/tipo), no de los comprobantes uno a uno.
 */
function contarDesdeAgregados(filas: AgregadoComprobantes[]): ConteoComprobantes {
  const porEstado: Record<string, number> = {};
  const porTipo: Record<string, number> = {};
  let total = 0;
  let ultima: Date | null = null;

  for (const f of filas) {
    total += f.total;
    porEstado[f.estado] = (porEstado[f.estado] ?? 0) + f.total;
    porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + f.total;
    if (!ultima || f.ultima > ultima) ultima = f.ultima;
  }

  return { total, porEstado, porTipo, ultimaEmision: ultima };
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
    const agregados = await this.comprobantes.agregarPorEmisor(
      emisores.map((e) => e.cedula),
      rango,
    );

    return {
      usuarios: {
        total: usuarios.length,
        porRol: contarPor(usuarios, (u) => u.rol),
      },
      emisores: {
        total: emisores.length,
        conCertificado: emisores.filter((e) => Boolean(e.certificado)).length,
      },
      comprobantes: contarDesdeAgregados(agregados),
    };
  }

  /** Desglose por cada emisor del tenant. */
  async porEmisor(tenantId: string, rango: RangoFechas = {}): Promise<EstadisticasEmisor[]> {
    const emisores = await this.emisores.listarPorTenant(tenantId);
    // Una sola consulta agregada para todos los emisores, en vez de una por
    // emisor que además traía todos sus comprobantes.
    const agregados = await this.comprobantes.agregarPorEmisor(
      emisores.map((e) => e.cedula),
      rango,
    );
    return emisores.map((emisor) => ({
      cedula: emisor.cedula,
      nombre: emisor.nombre,
      tieneCertificado: Boolean(emisor.certificado),
      comprobantes: contarDesdeAgregados(
        agregados.filter((a) => a.cedulaEmisor === emisor.cedula),
      ),
    }));
  }

  /** Estadísticas de un emisor concreto (ya validado como propio del tenant). */
  async deEmisor(emisor: EmisorRecord, rango: RangoFechas = {}): Promise<EstadisticasEmisor> {
    const agregados = await this.comprobantes.agregarPorEmisor([emisor.cedula], rango);
    return {
      cedula: emisor.cedula,
      nombre: emisor.nombre,
      tieneCertificado: Boolean(emisor.certificado),
      comprobantes: contarDesdeAgregados(agregados),
    };
  }

  /**
   * Importes netos facturados por moneda y mes. Los suma la base a partir del
   * total que se guarda al emitir; antes el navegador descargaba el XML de cada
   * comprobante y los calculaba uno por uno.
   */
  async montos(tenantId: string, rango: RangoFechas = {}): Promise<MontosPorMoneda[]> {
    const emisores = await this.emisores.listarPorTenant(tenantId);
    const filas = await this.comprobantes.montosPorMoneda(
      emisores.map((e) => e.cedula),
      rango,
    );

    const porMoneda = new Map<string, MontosPorMoneda>();
    for (const f of filas) {
      const m = porMoneda.get(f.moneda) ?? { moneda: f.moneda, total: 0, cantidad: 0, porMes: {} };
      m.total += f.total;
      m.cantidad += f.cantidad;
      m.porMes[f.mes] = (m.porMes[f.mes] ?? 0) + f.total;
      porMoneda.set(f.moneda, m);
    }
    return [...porMoneda.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }

  /** Comprobantes emitidos por día, ordenados de más antiguo a más reciente. */
  async serieDiaria(tenantId: string, rango: RangoFechas = {}): Promise<PuntoSerie[]> {
    const emisores = await this.emisores.listarPorTenant(tenantId);
    // El agrupado por día lo hace la base; aquí no se materializa ni una fila
    // de comprobante.
    return this.comprobantes.serieDiaria(
      emisores.map((e) => e.cedula),
      rango,
    );
  }
}
