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

// ---- SMTP saliente (entrega de comprobantes al cliente) por organización ----

export interface SmtpSalienteRecord {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string | null;
  /** Contraseña cifrada; null si el SMTP no requiere auth. */
  passwordSellado: SecretoSellado | null;
  remitente: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoSmtpSaliente {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string | null;
  passwordSellado: SecretoSellado | null;
  remitente: string;
  activo: boolean;
}

export interface SmtpSalienteRepository {
  upsert(input: NuevoSmtpSaliente): Promise<SmtpSalienteRecord>;
  buscarPorTenant(tenantId: string): Promise<SmtpSalienteRecord | null>;
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

// ---- Webhooks salientes (integraciones con sistemas externos) ----

export interface WebhookRecord {
  id: string;
  tenantId: string;
  url: string;
  secretSellado: SecretoSellado | null;
  eventos: string[];
  activo: boolean;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoWebhook {
  id: string;
  tenantId: string;
  url: string;
  secretSellado: SecretoSellado | null;
  eventos: string[];
  activo: boolean;
}

export interface CambiosWebhook {
  url?: string;
  secretSellado?: SecretoSellado | null;
  eventos?: string[];
  activo?: boolean;
  lastStatus?: number | null;
  lastError?: string | null;
}

export interface WebhookRepository {
  crear(input: NuevoWebhook): Promise<WebhookRecord>;
  actualizar(id: string, cambios: CambiosWebhook): Promise<WebhookRecord>;
  buscarPorId(id: string): Promise<WebhookRecord | null>;
  listarPorTenant(tenantId: string): Promise<WebhookRecord[]>;
  /** Webhooks activos suscritos a un evento (para el disparo). */
  listarActivosPorEvento(tenantId: string, evento: string): Promise<WebhookRecord[]>;
  eliminar(id: string): Promise<void>;
}

export type EstadoWebhookEntrega = "pendiente" | "enviado" | "fallido";

export interface WebhookEntregaRecord {
  id: string;
  tenantId: string;
  webhookId: string;
  evento: string;
  payload: string;
  estado: EstadoWebhookEntrega;
  statusCode: number | null;
  error: string | null;
  intentos: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevaWebhookEntrega {
  id: string;
  tenantId: string;
  webhookId: string;
  evento: string;
  payload: string;
  estado: EstadoWebhookEntrega;
}

export interface CambiosWebhookEntrega {
  estado?: EstadoWebhookEntrega;
  statusCode?: number | null;
  error?: string | null;
  intentos?: number;
}

export interface WebhookEntregaRepository {
  crear(input: NuevaWebhookEntrega): Promise<WebhookEntregaRecord>;
  actualizar(id: string, cambios: CambiosWebhookEntrega): Promise<WebhookEntregaRecord>;
  buscarPorId(id: string): Promise<WebhookEntregaRecord | null>;
  listarPorWebhook(tenantId: string, webhookId: string, limite: number): Promise<WebhookEntregaRecord[]>;
  listarReintentables(maxIntentos: number): Promise<WebhookEntregaRecord[]>;
}

// ---- Auditoría (acciones de negocio) ----

export type ActorTipo = "usuario" | "apikey" | "sistema";

export interface AuditoriaRecord {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorNombre: string;
  actorTipo: ActorTipo;
  accion: string;
  recurso: string;
  recursoId: string | null;
  detalle: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface NuevaAuditoria {
  id: string;
  tenantId: string;
  actorId?: string | null;
  actorNombre: string;
  actorTipo: ActorTipo;
  accion: string;
  recurso: string;
  recursoId?: string | null;
  detalle?: string | null;
  ip?: string | null;
}

export interface FiltroAuditoria {
  accion?: string;
  limite?: number;
}

export interface AuditoriaRepository {
  crear(input: NuevaAuditoria): Promise<AuditoriaRecord>;
  listarPorTenant(tenantId: string, filtro?: FiltroAuditoria): Promise<AuditoriaRecord[]>;
}

// ---- Registro del sistema (logs técnicos) ----

export type NivelLog = "info" | "warn" | "error";

export interface LogRecord {
  id: string;
  tenantId: string | null;
  nivel: NivelLog;
  origen: string;
  mensaje: string;
  detalle: string | null;
  createdAt: Date;
}

export interface NuevoLog {
  id: string;
  tenantId?: string | null;
  nivel: NivelLog;
  origen: string;
  mensaje: string;
  detalle?: string | null;
}

export interface FiltroLog {
  nivel?: NivelLog;
  origen?: string;
  limite?: number;
}

export interface LogRepository {
  crear(input: NuevoLog): Promise<LogRecord>;
  listarPorTenant(tenantId: string, filtro?: FiltroLog): Promise<LogRecord[]>;
}

// ---- Chat entre usuarios del tenant ----

export interface MensajeRecord {
  id: string;
  tenantId: string;
  deId: string;
  paraId: string;
  texto: string;
  leido: boolean;
  createdAt: Date;
}

export interface NuevoMensaje {
  id: string;
  tenantId: string;
  deId: string;
  paraId: string;
  texto: string;
}

export interface MensajeRepository {
  crear(input: NuevoMensaje): Promise<MensajeRecord>;
  /** Conversación entre dos usuarios (ambos sentidos), ascendente por fecha. */
  listarConversacion(tenantId: string, a: string, b: string): Promise<MensajeRecord[]>;
  /** Todos los mensajes en los que participa el usuario (enviados o recibidos). */
  listarDeUsuario(tenantId: string, usuarioId: string): Promise<MensajeRecord[]>;
  /** Marca como leídos los mensajes que `paraId` recibió de `deId`. */
  marcarLeidos(tenantId: string, deId: string, paraId: string): Promise<void>;
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

// ---- Envíos del comprobante al cliente (auditoría de correo saliente) ----

export type EstadoEnvio = "pendiente" | "enviado" | "fallido";

export interface EnvioComprobanteRecord {
  id: string;
  tenantId: string;
  clave: string;
  cedulaEmisor: string;
  destinatario: string;
  asunto: string;
  estado: EstadoEnvio;
  error: string | null;
  intentos: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoEnvio {
  id: string;
  tenantId: string;
  clave: string;
  cedulaEmisor: string;
  destinatario: string;
  asunto: string;
  estado: EstadoEnvio;
}

export interface CambiosEnvio {
  estado?: EstadoEnvio;
  error?: string | null;
  intentos?: number;
}

export interface EnvioComprobanteRepository {
  crear(rec: NuevoEnvio): Promise<EnvioComprobanteRecord>;
  actualizar(id: string, cambios: CambiosEnvio): Promise<EnvioComprobanteRecord>;
  buscarPorId(id: string): Promise<EnvioComprobanteRecord | null>;
  listarPorClave(tenantId: string, clave: string): Promise<EnvioComprobanteRecord[]>;
  /** Envíos reintentables (pendiente/fallido con intentos < max), para el poller. */
  listarReintentables(maxIntentos: number): Promise<EnvioComprobanteRecord[]>;
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
