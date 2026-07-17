/**
 * Implementación en memoria de los repositorios.
 *
 * Útil para desarrollo y tests (no requiere base de datos). Los datos se pierden
 * al reiniciar; para producción se usa la implementación Prisma.
 */
import type {
  CertificadoSellado,
  ComprobanteRecord,
  ComprobanteRepository,
  EmisorRecord,
  EmisorRepository,
  NuevoComprobante,
} from "./types.js";

export class EmisorRepositoryMemoria implements EmisorRepository {
  private readonly emisores = new Map<string, EmisorRecord>();

  async upsert(input: { cedula: string; nombre: string }): Promise<EmisorRecord> {
    const ahora = new Date();
    const existente = this.emisores.get(input.cedula);
    const record: EmisorRecord = existente
      ? { ...existente, nombre: input.nombre, updatedAt: ahora }
      : { cedula: input.cedula, nombre: input.nombre, createdAt: ahora, updatedAt: ahora };
    this.emisores.set(input.cedula, record);
    return record;
  }

  async buscar(cedula: string): Promise<EmisorRecord | null> {
    return this.emisores.get(cedula) ?? null;
  }

  async guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void> {
    const existente = this.emisores.get(cedula);
    if (!existente) throw new Error(`Emisor "${cedula}" no registrado`);
    this.emisores.set(cedula, { ...existente, certificado: cert, updatedAt: new Date() });
  }
}

export class ComprobanteRepositoryMemoria implements ComprobanteRepository {
  private readonly comprobantes = new Map<string, ComprobanteRecord>();

  async crear(rec: NuevoComprobante): Promise<ComprobanteRecord> {
    const ahora = new Date();
    const record: ComprobanteRecord = { ...rec, createdAt: ahora, updatedAt: ahora };
    this.comprobantes.set(rec.clave, record);
    return record;
  }

  async actualizarEstado(clave: string, estado: string, respuestaXml?: string): Promise<void> {
    const existente = this.comprobantes.get(clave);
    if (!existente) throw new Error(`Comprobante "${clave}" no encontrado`);
    this.comprobantes.set(clave, {
      ...existente,
      estado,
      respuestaXml: respuestaXml ?? existente.respuestaXml,
      updatedAt: new Date(),
    });
  }

  async buscar(clave: string): Promise<ComprobanteRecord | null> {
    return this.comprobantes.get(clave) ?? null;
  }

  async listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]> {
    return [...this.comprobantes.values()].filter((c) => c.cedulaEmisor === cedula);
  }
}
