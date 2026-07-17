/**
 * Interfaces de los repositorios de persistencia.
 *
 * Se definen como abstracciones para tener dos implementaciones intercambiables:
 * en memoria (desarrollo/tests) y Prisma/PostgreSQL (producción).
 */
import type { SecretoSellado } from "../crypto/secretBox.js";
import type { Rol } from "../../domain/auth/roles.js";

export interface CertificadoSellado {
  p12: SecretoSellado;
  password: SecretoSellado;
}

// ---- Buzón de correo (IMAP) por organización ----

export interface BuzonRecord {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string;
  /** Contraseña cifrada en reposo. */
  passwordSellado: SecretoSellado;
  carpeta: string;
  activo: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoBuzon {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string;
  passwordSellado: SecretoSellado;
  carpeta: string;
  activo: boolean;
}

export interface BuzonRepository {
  upsert(input: NuevoBuzon): Promise<BuzonRecord>;
  buscarPorTenant(tenantId: string): Promise<BuzonRecord | null>;
  listarActivos(): Promise<BuzonRecord[]>;
  actualizarEstado(tenantId: string, estado: { lastSyncAt?: Date; lastError?: string | null }): Promise<void>;
  eliminar(tenantId: string): Promise<void>;
}

// ---- Tenants y usuarios (control de acceso) ----

export interface TenantRecord {
  id: string;
  nombre: string;
  createdAt: Date;
}

export interface UsuarioRecord {
  id: string;
  tenantId: string;
  email: string;
  nombre: string;
  passwordHash: string;
  rol: Rol;
  createdAt: Date;
}

export interface TenantRepository {
  crear(input: { id: string; nombre: string }): Promise<TenantRecord>;
  buscar(id: string): Promise<TenantRecord | null>;
}

/** Campos de un usuario que se pueden modificar tras crearlo. */
export type CambiosUsuario = Partial<Pick<UsuarioRecord, "nombre" | "rol" | "passwordHash">>;

export interface UsuarioRepository {
  crear(input: Omit<UsuarioRecord, "createdAt">): Promise<UsuarioRecord>;
  buscarPorEmail(email: string): Promise<UsuarioRecord | null>;
  buscarPorId(id: string): Promise<UsuarioRecord | null>;
  listarPorTenant(tenantId: string): Promise<UsuarioRecord[]>;
  actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRecord>;
  eliminar(id: string): Promise<void>;
}

// ---- API keys (cuentas de servicio para apps externas) ----

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  label: string;
  /** Prefijo público e indexado (permite el lookup sin escanear todo). */
  keyId: string;
  /** Hash del secreto (nunca el secreto en claro). */
  secretHash: string;
  rol: Rol;
  /** Cédulas de emisor permitidas; vacío = todos los del tenant. */
  emisoresPermitidos: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface NuevaApiKey {
  id: string;
  tenantId: string;
  label: string;
  keyId: string;
  secretHash: string;
  rol: Rol;
  emisoresPermitidos: string[];
  expiresAt: Date | null;
}

export interface ApiKeyRepository {
  crear(input: NuevaApiKey): Promise<ApiKeyRecord>;
  buscarPorId(id: string): Promise<ApiKeyRecord | null>;
  buscarPorKeyId(keyId: string): Promise<ApiKeyRecord | null>;
  listarPorTenant(tenantId: string): Promise<ApiKeyRecord[]>;
  marcarUso(id: string): Promise<void>;
  revocar(id: string): Promise<void>;
}

// ---- Borradores de factura ----

export interface BorradorRecord {
  id: string;
  tenantId: string;
  tipo: string;
  cedulaEmisor: string | null;
  receptorNombre: string | null;
  total: number;
  /** Estado del formulario de emisión, serializado a JSON. */
  datos: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoBorrador {
  id: string;
  tenantId: string;
  tipo: string;
  cedulaEmisor: string | null;
  receptorNombre: string | null;
  total: number;
  datos: string;
}

export type CambiosBorrador = Pick<
  BorradorRecord,
  "tipo" | "cedulaEmisor" | "receptorNombre" | "total" | "datos"
>;

export interface BorradorRepository {
  crear(rec: NuevoBorrador): Promise<BorradorRecord>;
  actualizar(id: string, cambios: CambiosBorrador): Promise<BorradorRecord>;
  buscarPorId(id: string): Promise<BorradorRecord | null>;
  listarPorTenant(tenantId: string): Promise<BorradorRecord[]>;
  eliminar(id: string): Promise<void>;
}

// ---- Emisores ----

export interface EmisorRecord {
  cedula: string;
  /** Tenant dueño del emisor (aislamiento multi-tenant). */
  tenantId: string;
  nombre: string;
  /** Certificado .p12 cifrado en reposo (si ya se cargó). */
  certificado?: CertificadoSellado;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmisorRepository {
  upsert(input: { cedula: string; tenantId: string; nombre: string }): Promise<EmisorRecord>;
  buscar(cedula: string): Promise<EmisorRecord | null>;
  listarPorTenant(tenantId: string): Promise<EmisorRecord[]>;
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

// ---- Documentos recibidos (facturas que nos emiten → mensaje receptor) ----

export interface DocumentoRecibidoRecord {
  id: string;
  tenantId: string;
  clave: string;
  tipo: string;
  numeroConsecutivo: string;
  fechaEmision: Date;
  emisorNombre: string;
  emisorCedula: string;
  receptorCedula: string;
  receptorNombre: string | null;
  moneda: string;
  totalComprobante: number;
  totalImpuesto: number;
  xml: string;
  /** manual | interno | correo */
  origen: string;
  mrRespuesta: string | null;
  mrConsecutivo: string | null;
  mrXml: string | null;
  mrGeneradoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NuevoDocumentoRecibido = Omit<
  DocumentoRecibidoRecord,
  "id" | "mrRespuesta" | "mrConsecutivo" | "mrXml" | "mrGeneradoAt" | "createdAt" | "updatedAt"
> & { id: string };

export interface MensajeReceptorGuardado {
  respuesta: string;
  consecutivo: string;
  xml: string;
}

export interface DocumentoRecibidoRepository {
  crear(rec: NuevoDocumentoRecibido): Promise<DocumentoRecibidoRecord>;
  buscarPorId(id: string): Promise<DocumentoRecibidoRecord | null>;
  buscarPorClave(tenantId: string, clave: string): Promise<DocumentoRecibidoRecord | null>;
  listarPorTenant(tenantId: string): Promise<DocumentoRecibidoRecord[]>;
  guardarMensajeReceptor(id: string, mr: MensajeReceptorGuardado): Promise<void>;
  eliminar(id: string): Promise<void>;
}
