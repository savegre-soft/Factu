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
  /** Todos los tenants (panel interno de Savegre, ver `plataforma`). */
  listarTodos(): Promise<TenantRecord[]>;
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

export type ActorTipo = "usuario" | "apikey" | "sistema" | "plataforma";

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

// ---- Notificaciones (canales de comunicación) ----

export interface NotificationChannelRecord {
  id: string;
  tenantId: string;
  tipo: string;
  proveedor: string;
  nombre: string;
  configSellado: string;
  eventos: string[];
  activo: boolean;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoNotificationChannel {
  id: string;
  tenantId: string;
  tipo: string;
  proveedor: string;
  nombre: string;
  configSellado: string;
  eventos: string[];
  activo: boolean;
}

export interface CambiosNotificationChannel {
  nombre?: string;
  configSellado?: string;
  eventos?: string[];
  activo?: boolean;
  lastStatus?: string | null;
  lastError?: string | null;
}

export interface NotificationChannelRepository {
  crear(input: NuevoNotificationChannel): Promise<NotificationChannelRecord>;
  actualizar(id: string, cambios: CambiosNotificationChannel): Promise<NotificationChannelRecord>;
  buscarPorId(id: string): Promise<NotificationChannelRecord | null>;
  listarPorTenant(tenantId: string): Promise<NotificationChannelRecord[]>;
  listarActivosPorEvento(tenantId: string, evento: string): Promise<NotificationChannelRecord[]>;
  eliminar(id: string): Promise<void>;
}

export type EstadoNotificacion = "pendiente" | "enviado" | "fallido" | "reintentando";

export interface NotificationMessageRecord {
  id: string;
  tenantId: string;
  canalId: string;
  proveedor: string;
  evento: string;
  destino: string | null;
  contenido: string;
  estado: EstadoNotificacion;
  intentos: number;
  maxIntentos: number;
  proximoIntentoAt: Date | null;
  proveedorMensajeId: string | null;
  respuesta: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoNotificationMessage {
  id: string;
  tenantId: string;
  canalId: string;
  proveedor: string;
  evento: string;
  destino?: string | null;
  contenido: string;
  estado: EstadoNotificacion;
  maxIntentos: number;
}

export interface CambiosNotificationMessage {
  estado?: EstadoNotificacion;
  intentos?: number;
  proximoIntentoAt?: Date | null;
  proveedorMensajeId?: string | null;
  respuesta?: string | null;
  error?: string | null;
  destino?: string | null;
}

export interface FiltroNotificacion {
  estado?: EstadoNotificacion;
  canalId?: string;
  limite?: number;
}

export interface NotificationMessageRepository {
  crear(input: NuevoNotificationMessage): Promise<NotificationMessageRecord>;
  actualizar(id: string, cambios: CambiosNotificationMessage): Promise<NotificationMessageRecord>;
  buscarPorId(id: string): Promise<NotificationMessageRecord | null>;
  listarPorTenant(tenantId: string, filtro?: FiltroNotificacion): Promise<NotificationMessageRecord[]>;
  /** Mensajes vencidos para reintentar (pendiente/reintentando, proximoIntentoAt <= ahora). */
  listarReintentables(limite: number): Promise<NotificationMessageRecord[]>;
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

/** Datos fiscales de un emisor (los que exige Hacienda al emitir). */
export interface DatosFiscalesEmisor {
  tipoIdentificacion?: string;
  nombreComercial?: string;
  correoElectronico?: string;
  telefono?: { codigoPais: string; numTelefono: string };
  ubicacion?: { provincia: string; canton: string; distrito: string; otrasSenas?: string };
  codigoActividad?: string;
}

export interface EmisorRecord {
  cedula: string;
  /** Tenant dueño del emisor (aislamiento multi-tenant). */
  tenantId: string;
  nombre: string;
  /** Datos fiscales guardados (tipo id, actividad, ubicación, etc.). */
  datosFiscales?: DatosFiscalesEmisor;
  /** Certificado .p12 cifrado en reposo (si ya se cargó). */
  certificado?: CertificadoSellado;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoEmisor {
  cedula: string;
  tenantId: string;
  nombre: string;
  datosFiscales?: DatosFiscalesEmisor;
}

export interface EmisorRepository {
  upsert(input: NuevoEmisor): Promise<EmisorRecord>;
  buscar(cedula: string): Promise<EmisorRecord | null>;
  listarPorTenant(tenantId: string): Promise<EmisorRecord[]>;
  guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void>;
}

// ---- Clientes (receptores de facturas pasadas) ----

export interface ClienteRecord {
  id: string;
  tenantId: string;
  numero: string;
  tipo: string;
  nombre: string;
  correo: string | null;
  /** JSON del receptor completo (DatosReceptor) para autocompletar. */
  datos: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NuevoCliente {
  id: string;
  tenantId: string;
  numero: string;
  tipo: string;
  nombre: string;
  correo?: string | null;
  datos: string;
}

export interface ClienteRepository {
  /** Inserta o actualiza el cliente (clave: tenant + número). */
  upsert(input: NuevoCliente): Promise<ClienteRecord>;
  buscarPorNumero(tenantId: string, numero: string): Promise<ClienteRecord | null>;
  listarPorTenant(tenantId: string): Promise<ClienteRecord[]>;
}

// ---- Identidades OAuth (Google / Microsoft) ----

export interface OAuthIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  providerSub: string;
  email: string;
  createdAt: Date;
}

export interface NuevaOAuthIdentity {
  id: string;
  userId: string;
  provider: string;
  providerSub: string;
  email: string;
}

export interface OAuthIdentityRepository {
  crear(input: NuevaOAuthIdentity): Promise<OAuthIdentityRecord>;
  buscarPorProviderSub(provider: string, providerSub: string): Promise<OAuthIdentityRecord | null>;
  listarPorUsuario(userId: string): Promise<OAuthIdentityRecord[]>;
  eliminar(id: string): Promise<void>;
}

// ---- Reseteo de contraseña ----

export interface PasswordResetRecord {
  id: string;
  userId: string;
  codigoHash: string;
  expiresAt: Date;
  usado: boolean;
  createdAt: Date;
}

export interface NuevoPasswordReset {
  id: string;
  userId: string;
  codigoHash: string;
  expiresAt: Date;
}

export interface PasswordResetRepository {
  crear(input: NuevoPasswordReset): Promise<PasswordResetRecord>;
  /** El reseteo vigente más reciente del usuario (no usado y no vencido). */
  buscarVigentePorUsuario(userId: string): Promise<PasswordResetRecord | null>;
  marcarUsado(id: string): Promise<void>;
  /** Invalida los reseteos previos del usuario (al pedir uno nuevo). */
  invalidarPorUsuario(userId: string): Promise<void>;
}

export interface ComprobanteRecord {
  clave: string;
  cedulaEmisor: string;
  tipo: string;
  consecutivo: string;
  estado: string;
  xmlFirmado?: string;
  respuestaXml?: string;
  referenciaExterna?: string;
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
  referenciaExterna?: string;
}

export interface ComprobanteRepository {
  crear(rec: NuevoComprobante): Promise<ComprobanteRecord>;
  actualizarEstado(clave: string, estado: string, respuestaXml?: string): Promise<void>;
  buscar(clave: string): Promise<ComprobanteRecord | null>;
  /** Idempotencia: comprobante ya emitido para este emisor+referencia externa, si existe. */
  buscarPorReferencia(cedulaEmisor: string, referenciaExterna: string): Promise<ComprobanteRecord | null>;
  listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]>;
}

// ---- Contador atómico de consecutivo (D9) ----

export interface ConsecutivoRepository {
  /** Devuelve el siguiente valor (atómico) para esta combinación. */
  siguiente(
    cedulaEmisor: string,
    sucursal: number,
    terminal: number,
    tipo: string,
  ): Promise<number>;
  /**
   * Registra que `valor` ya fue usado (el cliente lo mandó explícito), para
   * que el contador nunca vuelva a asignar algo ≤ `valor`. No retrocede el
   * contador si ya iba más adelante.
   */
  registrarSiUsado(
    cedulaEmisor: string,
    sucursal: number,
    terminal: number,
    tipo: string,
    valor: number,
  ): Promise<void>;
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

// ---- Plataforma: panel interno de Savegre (Savegre Center) ----
//
// Todo lo de esta sección es cross-tenant y se autentica con una
// `CredencialPlataforma` (nunca con el JWT de un usuario ni con una `ApiKey`
// de tenant) — ver `services/plataforma`, `plugins/auth.ts`
// (`requierePlataforma`) y `routes/plataforma.ts`.

export type EstadoSuscripcion = "activa" | "suspendida" | "cancelada";
export type CicloCobro = "mensual" | "anual";
export type TipoDescuento = "porcentaje" | "monto";

export interface SuscripcionRecord {
  id: string;
  /** Tenant al que pertenece (relación 1:1). */
  tenantId: string;
  plan: string;
  estado: EstadoSuscripcion;
  /** Ej. "CRC", "USD". */
  moneda: string;
  ciclo: CicloCobro;
  descuentoTipo: TipoDescuento | null;
  descuentoValor: number | null;
  descuentoRazon: string | null;
  iniciaEn: Date;
  renuevaEn: Date | null;
  notas: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatosSuscripcion {
  plan: string;
  estado: EstadoSuscripcion;
  moneda: string;
  ciclo: CicloCobro;
  descuentoTipo?: TipoDescuento | null;
  descuentoValor?: number | null;
  descuentoRazon?: string | null;
  iniciaEn: Date;
  renuevaEn?: Date | null;
  notas?: string | null;
}

export interface SuscripcionRepository {
  /** Crea o reemplaza la suscripción del tenant (1:1). */
  upsert(tenantId: string, datos: DatosSuscripcion): Promise<SuscripcionRecord>;
  buscarPorTenant(tenantId: string): Promise<SuscripcionRecord | null>;
  /** Todas las suscripciones existentes (para la lista de tenants). */
  listarTodas(): Promise<SuscripcionRecord[]>;
}

export interface PagoSuscripcionRecord {
  id: string;
  suscripcionId: string;
  monto: number;
  moneda: string;
  /** Texto libre, ej. "transferencia", "tarjeta". */
  metodo: string;
  referencia: string | null;
  notas: string | null;
  pagadoEn: Date;
  /** Quién lo registró: texto libre (staff de Savegre vía Center), no un Usuario de Factu. */
  registradoPor: string | null;
}

export interface NuevoPagoSuscripcion {
  id: string;
  suscripcionId: string;
  monto: number;
  moneda: string;
  metodo: string;
  referencia?: string | null;
  notas?: string | null;
  registradoPor?: string | null;
}

export interface PagoSuscripcionRepository {
  crear(input: NuevoPagoSuscripcion): Promise<PagoSuscripcionRecord>;
  listarPorSuscripcion(suscripcionId: string): Promise<PagoSuscripcionRecord[]>;
}

export interface CredencialPlataformaRecord {
  id: string;
  label: string;
  /** Prefijo público e indexado (permite el lookup sin escanear todo). */
  keyId: string;
  /** Hash del secreto (nunca el secreto en claro). */
  secretHash: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface NuevaCredencialPlataforma {
  id: string;
  label: string;
  keyId: string;
  secretHash: string;
  expiresAt: Date | null;
}

export interface CredencialPlataformaRepository {
  crear(input: NuevaCredencialPlataforma): Promise<CredencialPlataformaRecord>;
  buscarPorId(id: string): Promise<CredencialPlataformaRecord | null>;
  buscarPorKeyId(keyId: string): Promise<CredencialPlataformaRecord | null>;
  listar(): Promise<CredencialPlataformaRecord[]>;
  marcarUso(id: string): Promise<void>;
  revocar(id: string): Promise<void>;
}
