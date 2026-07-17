/**
 * Interfaces de los repositorios de persistencia.
 *
 * Se definen como abstracciones para tener dos implementaciones intercambiables:
 * en memoria (desarrollo/tests) y Prisma/PostgreSQL (producción).
 */
import type { SecretoSellado } from "../crypto/secretBox.js";

export interface CertificadoSellado {
  p12: SecretoSellado;
  password: SecretoSellado;
}

export interface EmisorRecord {
  cedula: string;
  nombre: string;
  /** Certificado .p12 cifrado en reposo (si ya se cargó). */
  certificado?: CertificadoSellado;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmisorRepository {
  upsert(input: { cedula: string; nombre: string }): Promise<EmisorRecord>;
  buscar(cedula: string): Promise<EmisorRecord | null>;
  guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void>;
}

export interface ComprobanteRecord {
  clave: string;
  cedulaEmisor: string;
  tipo: string;
  consecutivo: string;
  estado: string;
  xmlFirmado?: string;
  respuestaXml?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoComprobante {
  clave: string;
  cedulaEmisor: string;
  tipo: string;
  consecutivo: string;
  estado: string;
  xmlFirmado?: string;
  respuestaXml?: string;
}

export interface ComprobanteRepository {
  crear(rec: NuevoComprobante): Promise<ComprobanteRecord>;
  actualizarEstado(clave: string, estado: string, respuestaXml?: string): Promise<void>;
  buscar(clave: string): Promise<ComprobanteRecord | null>;
  listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]>;
}
