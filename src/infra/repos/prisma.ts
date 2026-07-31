/**
 * Implementación Prisma/PostgreSQL de los repositorios (para producción).
 *
 * Se importa de forma perezosa (solo cuando PERSISTENCIA=prisma) para no exigir
 * un cliente generado ni una base de datos cuando se usa el backend en memoria.
 *
 * Requiere: `npm run prisma:generate` y una base con las migraciones aplicadas.
 */
import { PrismaClient } from "@prisma/client";
import type { Rol } from "../../domain/auth/roles.js";
import type { SecretoSellado } from "../crypto/secretBox.js";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
  BorradorRecord,
  BorradorRepository,
  BuzonRecord,
  BuzonRepository,
  CambiosBorrador,
  CambiosEnvio,
  CambiosUsuario,
  EnvioComprobanteRecord,
  EnvioComprobanteRepository,
  EstadoEnvio,
  MensajeRecord,
  MensajeRepository,
  NuevoBorrador,
  NuevoMensaje,
  WebhookRecord,
  WebhookRepository,
  NuevoWebhook,
  CambiosWebhook,
  WebhookEntregaRecord,
  WebhookEntregaRepository,
  NuevaWebhookEntrega,
  CambiosWebhookEntrega,
  EstadoWebhookEntrega,
  NuevoBuzon,
  NuevoEnvio,
  NuevoSmtpSaliente,
  SmtpSalienteRecord,
  SmtpSalienteRepository,
  CertificadoSellado,
  ComprobanteRecord,
  ComprobanteRepository,
  ConsecutivoRepository,
  DocumentoRecibidoRecord,
  DocumentoRecibidoRepository,
  EmisorRecord,
  EmisorRepository,
  MensajeReceptorGuardado,
  NuevaApiKey,
  NuevoComprobante,
  NuevoDocumentoRecibido,
  TenantRecord,
  TenantRepository,
  UsuarioRecord,
  UsuarioRepository,
  ActorTipo,
  AuditoriaRecord,
  AuditoriaRepository,
  NuevaAuditoria,
  FiltroAuditoria,
  NivelLog,
  LogRecord,
  LogRepository,
  NuevoLog,
  FiltroLog,
  NotificationChannelRecord,
  NotificationChannelRepository,
  NuevoNotificationChannel,
  CambiosNotificationChannel,
  EstadoNotificacion,
  NotificationMessageRecord,
  NotificationMessageRepository,
  NuevoNotificationMessage,
  CambiosNotificationMessage,
  FiltroNotificacion,
  NuevoEmisor,
  ClienteRecord,
  ClienteRepository,
  NuevoCliente,
  OAuthIdentityRecord,
  OAuthIdentityRepository,
  NuevaOAuthIdentity,
  PasswordResetRecord,
  PasswordResetRepository,
  NuevoPasswordReset,
} from "./types.js";

export const prisma = new PrismaClient();

export class OAuthIdentityRepositoryPrisma implements OAuthIdentityRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevaOAuthIdentity): Promise<OAuthIdentityRecord> {
    return this.db.oAuthIdentity.create({ data: input });
  }

  async buscarPorProviderSub(provider: string, providerSub: string): Promise<OAuthIdentityRecord | null> {
    return this.db.oAuthIdentity.findUnique({
      where: { provider_providerSub: { provider, providerSub } },
    });
  }

  async listarPorUsuario(userId: string): Promise<OAuthIdentityRecord[]> {
    return this.db.oAuthIdentity.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  async eliminar(id: string): Promise<void> {
    await this.db.oAuthIdentity.delete({ where: { id } });
  }
}

export class PasswordResetRepositoryPrisma implements PasswordResetRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoPasswordReset): Promise<PasswordResetRecord> {
    return this.db.passwordReset.create({ data: input });
  }

  async buscarVigentePorUsuario(userId: string): Promise<PasswordResetRecord | null> {
    return this.db.passwordReset.findFirst({
      where: { userId, usado: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  async marcarUsado(id: string): Promise<void> {
    await this.db.passwordReset.update({ where: { id }, data: { usado: true } });
  }

  async invalidarPorUsuario(userId: string): Promise<void> {
    await this.db.passwordReset.updateMany({ where: { userId, usado: false }, data: { usado: true } });
  }
}

export class ClienteRepositoryPrisma implements ClienteRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: NuevoCliente): Promise<ClienteRecord> {
    const datos = {
      tipo: input.tipo,
      nombre: input.nombre,
      correo: input.correo ?? null,
      datos: input.datos,
    };
    return this.db.cliente.upsert({
      where: { tenantId_numero: { tenantId: input.tenantId, numero: input.numero } },
      create: { id: input.id, tenantId: input.tenantId, numero: input.numero, ...datos },
      update: datos,
    });
  }

  async buscarPorNumero(tenantId: string, numero: string): Promise<ClienteRecord | null> {
    return this.db.cliente.findUnique({ where: { tenantId_numero: { tenantId, numero } } });
  }

  async listarPorTenant(tenantId: string): Promise<ClienteRecord[]> {
    return this.db.cliente.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
  }
}

export class TenantRepositoryPrisma implements TenantRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: { id: string; nombre: string }): Promise<TenantRecord> {
    return this.db.tenant.create({ data: input });
  }

  async buscar(id: string): Promise<TenantRecord | null> {
    return this.db.tenant.findUnique({ where: { id } });
  }
}

export class UsuarioRepositoryPrisma implements UsuarioRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: Omit<UsuarioRecord, "createdAt">): Promise<UsuarioRecord> {
    const row = await this.db.usuario.create({ data: input });
    return { ...row, rol: row.rol as Rol };
  }

  async buscarPorEmail(email: string): Promise<UsuarioRecord | null> {
    const row = await this.db.usuario.findUnique({ where: { email: email.toLowerCase() } });
    return row ? { ...row, rol: row.rol as Rol } : null;
  }

  async buscarPorId(id: string): Promise<UsuarioRecord | null> {
    const row = await this.db.usuario.findUnique({ where: { id } });
    return row ? { ...row, rol: row.rol as Rol } : null;
  }

  async listarPorTenant(tenantId: string): Promise<UsuarioRecord[]> {
    const rows = await this.db.usuario.findMany({ where: { tenantId } });
    return rows.map((r) => ({ ...r, rol: r.rol as Rol }));
  }

  async actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRecord> {
    const row = await this.db.usuario.update({ where: { id }, data: cambios });
    return { ...row, rol: row.rol as Rol };
  }

  async eliminar(id: string): Promise<void> {
    await this.db.usuario.delete({ where: { id } });
  }
}

type ApiKeyRow = {
  id: string;
  tenantId: string;
  label: string;
  keyId: string;
  secretHash: string;
  rol: string;
  emisoresPermitidos: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function aApiKeyRecord(row: ApiKeyRow): ApiKeyRecord {
  return { ...row, rol: row.rol as Rol };
}

export class ApiKeyRepositoryPrisma implements ApiKeyRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevaApiKey): Promise<ApiKeyRecord> {
    const row = await this.db.apiKey.create({ data: input });
    return aApiKeyRecord(row);
  }

  async buscarPorId(id: string): Promise<ApiKeyRecord | null> {
    const row = await this.db.apiKey.findUnique({ where: { id } });
    return row ? aApiKeyRecord(row) : null;
  }

  async buscarPorKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    const row = await this.db.apiKey.findUnique({ where: { keyId } });
    return row ? aApiKeyRecord(row) : null;
  }

  async listarPorTenant(tenantId: string): Promise<ApiKeyRecord[]> {
    const rows = await this.db.apiKey.findMany({ where: { tenantId } });
    return rows.map(aApiKeyRecord);
  }

  async marcarUso(id: string): Promise<void> {
    await this.db.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async revocar(id: string): Promise<void> {
    await this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}

type BuzonRow = {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string;
  passwordSellado: string;
  carpeta: string;
  activo: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aBuzonRecord(row: BuzonRow): BuzonRecord {
  return { ...row, passwordSellado: JSON.parse(row.passwordSellado) as SecretoSellado };
}

function aEnvioRecord(row: {
  id: string;
  tenantId: string;
  clave: string;
  cedulaEmisor: string;
  destinatario: string;
  asunto: string;
  estado: string;
  error: string | null;
  intentos: number;
  createdAt: Date;
  updatedAt: Date;
}): EnvioComprobanteRecord {
  return { ...row, estado: row.estado as EstadoEnvio };
}

export class EnvioComprobanteRepositoryPrisma implements EnvioComprobanteRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(rec: NuevoEnvio): Promise<EnvioComprobanteRecord> {
    const row = await this.db.envioComprobante.create({ data: rec });
    return aEnvioRecord(row);
  }

  async actualizar(id: string, cambios: CambiosEnvio): Promise<EnvioComprobanteRecord> {
    const row = await this.db.envioComprobante.update({ where: { id }, data: cambios });
    return aEnvioRecord(row);
  }

  async buscarPorId(id: string): Promise<EnvioComprobanteRecord | null> {
    const row = await this.db.envioComprobante.findUnique({ where: { id } });
    return row ? aEnvioRecord(row) : null;
  }

  async listarPorClave(tenantId: string, clave: string): Promise<EnvioComprobanteRecord[]> {
    const rows = await this.db.envioComprobante.findMany({
      where: { tenantId, clave },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(aEnvioRecord);
  }

  async listarReintentables(maxIntentos: number): Promise<EnvioComprobanteRecord[]> {
    const rows = await this.db.envioComprobante.findMany({
      where: { estado: { not: "enviado" }, intentos: { lt: maxIntentos } },
    });
    return rows.map(aEnvioRecord);
  }
}

type WebhookRow = {
  id: string;
  tenantId: string;
  url: string;
  secretSellado: string | null;
  eventos: string[];
  activo: boolean;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aWebhookRecord(row: WebhookRow): WebhookRecord {
  return {
    ...row,
    secretSellado: row.secretSellado ? (JSON.parse(row.secretSellado) as SecretoSellado) : null,
  };
}

function datosWebhook(cambios: CambiosWebhook) {
  const data: Record<string, unknown> = { ...cambios };
  if ("secretSellado" in cambios) {
    data.secretSellado = cambios.secretSellado ? JSON.stringify(cambios.secretSellado) : null;
  }
  return data;
}

export class WebhookRepositoryPrisma implements WebhookRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoWebhook): Promise<WebhookRecord> {
    const row = await this.db.webhook.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        url: input.url,
        secretSellado: input.secretSellado ? JSON.stringify(input.secretSellado) : null,
        eventos: input.eventos,
        activo: input.activo,
      },
    });
    return aWebhookRecord(row);
  }

  async actualizar(id: string, cambios: CambiosWebhook): Promise<WebhookRecord> {
    const row = await this.db.webhook.update({ where: { id }, data: datosWebhook(cambios) });
    return aWebhookRecord(row);
  }

  async buscarPorId(id: string): Promise<WebhookRecord | null> {
    const row = await this.db.webhook.findUnique({ where: { id } });
    return row ? aWebhookRecord(row) : null;
  }

  async listarPorTenant(tenantId: string): Promise<WebhookRecord[]> {
    const rows = await this.db.webhook.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    return rows.map(aWebhookRecord);
  }

  async listarActivosPorEvento(tenantId: string, evento: string): Promise<WebhookRecord[]> {
    const rows = await this.db.webhook.findMany({
      where: { tenantId, activo: true, eventos: { has: evento } },
    });
    return rows.map(aWebhookRecord);
  }

  async eliminar(id: string): Promise<void> {
    await this.db.webhook.delete({ where: { id } });
  }
}

function aWebhookEntregaRecord(row: {
  id: string;
  tenantId: string;
  webhookId: string;
  evento: string;
  payload: string;
  estado: string;
  statusCode: number | null;
  error: string | null;
  intentos: number;
  createdAt: Date;
  updatedAt: Date;
}): WebhookEntregaRecord {
  return { ...row, estado: row.estado as EstadoWebhookEntrega };
}

export class WebhookEntregaRepositoryPrisma implements WebhookEntregaRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevaWebhookEntrega): Promise<WebhookEntregaRecord> {
    const row = await this.db.webhookEntrega.create({ data: input });
    return aWebhookEntregaRecord(row);
  }

  async actualizar(id: string, cambios: CambiosWebhookEntrega): Promise<WebhookEntregaRecord> {
    const row = await this.db.webhookEntrega.update({ where: { id }, data: cambios });
    return aWebhookEntregaRecord(row);
  }

  async buscarPorId(id: string): Promise<WebhookEntregaRecord | null> {
    const row = await this.db.webhookEntrega.findUnique({ where: { id } });
    return row ? aWebhookEntregaRecord(row) : null;
  }

  async listarPorWebhook(tenantId: string, webhookId: string, limite: number): Promise<WebhookEntregaRecord[]> {
    const rows = await this.db.webhookEntrega.findMany({
      where: { tenantId, webhookId },
      orderBy: { createdAt: "desc" },
      take: limite,
    });
    return rows.map(aWebhookEntregaRecord);
  }

  async listarReintentables(maxIntentos: number): Promise<WebhookEntregaRecord[]> {
    const rows = await this.db.webhookEntrega.findMany({
      where: { estado: { not: "enviado" }, intentos: { lt: maxIntentos } },
    });
    return rows.map(aWebhookEntregaRecord);
  }
}

function aAuditoriaRecord(row: {
  id: string;
  tenantId: string;
  actorId: string | null;
  actorNombre: string;
  actorTipo: string;
  accion: string;
  recurso: string;
  recursoId: string | null;
  detalle: string | null;
  ip: string | null;
  createdAt: Date;
}): AuditoriaRecord {
  return { ...row, actorTipo: row.actorTipo as ActorTipo };
}

export class AuditoriaRepositoryPrisma implements AuditoriaRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevaAuditoria): Promise<AuditoriaRecord> {
    const row = await this.db.registroAuditoria.create({ data: input });
    return aAuditoriaRecord(row);
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroAuditoria): Promise<AuditoriaRecord[]> {
    const rows = await this.db.registroAuditoria.findMany({
      where: { tenantId, ...(filtro?.accion ? { accion: filtro.accion } : {}) },
      orderBy: { createdAt: "desc" },
      take: filtro?.limite ?? 200,
    });
    return rows.map(aAuditoriaRecord);
  }
}

function aLogRecord(row: {
  id: string;
  tenantId: string | null;
  nivel: string;
  origen: string;
  mensaje: string;
  detalle: string | null;
  createdAt: Date;
}): LogRecord {
  return { ...row, nivel: row.nivel as NivelLog };
}

export class LogRepositoryPrisma implements LogRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoLog): Promise<LogRecord> {
    const row = await this.db.registroLog.create({ data: input });
    return aLogRecord(row);
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroLog): Promise<LogRecord[]> {
    const rows = await this.db.registroLog.findMany({
      where: {
        tenantId,
        ...(filtro?.nivel ? { nivel: filtro.nivel } : {}),
        ...(filtro?.origen ? { origen: filtro.origen } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filtro?.limite ?? 200,
    });
    return rows.map(aLogRecord);
  }
}

export class NotificationChannelRepositoryPrisma implements NotificationChannelRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoNotificationChannel): Promise<NotificationChannelRecord> {
    return this.db.notificationChannel.create({ data: input });
  }

  async actualizar(id: string, cambios: CambiosNotificationChannel): Promise<NotificationChannelRecord> {
    return this.db.notificationChannel.update({ where: { id }, data: cambios });
  }

  async buscarPorId(id: string): Promise<NotificationChannelRecord | null> {
    return this.db.notificationChannel.findUnique({ where: { id } });
  }

  async listarPorTenant(tenantId: string): Promise<NotificationChannelRecord[]> {
    return this.db.notificationChannel.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listarActivosPorEvento(tenantId: string, evento: string): Promise<NotificationChannelRecord[]> {
    return this.db.notificationChannel.findMany({
      where: { tenantId, activo: true, eventos: { has: evento } },
    });
  }

  async eliminar(id: string): Promise<void> {
    await this.db.notificationChannel.delete({ where: { id } });
  }
}

function aNotificationMessageRecord(row: {
  id: string;
  tenantId: string;
  canalId: string;
  proveedor: string;
  evento: string;
  destino: string | null;
  contenido: string;
  estado: string;
  intentos: number;
  maxIntentos: number;
  proximoIntentoAt: Date | null;
  proveedorMensajeId: string | null;
  respuesta: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationMessageRecord {
  return { ...row, estado: row.estado as EstadoNotificacion };
}

export class NotificationMessageRepositoryPrisma implements NotificationMessageRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoNotificationMessage): Promise<NotificationMessageRecord> {
    const row = await this.db.notificationMessage.create({ data: input });
    return aNotificationMessageRecord(row);
  }

  async actualizar(id: string, cambios: CambiosNotificationMessage): Promise<NotificationMessageRecord> {
    const row = await this.db.notificationMessage.update({ where: { id }, data: cambios });
    return aNotificationMessageRecord(row);
  }

  async buscarPorId(id: string): Promise<NotificationMessageRecord | null> {
    const row = await this.db.notificationMessage.findUnique({ where: { id } });
    return row ? aNotificationMessageRecord(row) : null;
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroNotificacion): Promise<NotificationMessageRecord[]> {
    const rows = await this.db.notificationMessage.findMany({
      where: {
        tenantId,
        ...(filtro?.estado ? { estado: filtro.estado } : {}),
        ...(filtro?.canalId ? { canalId: filtro.canalId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filtro?.limite ?? 200,
    });
    return rows.map(aNotificationMessageRecord);
  }

  async listarReintentables(limite: number): Promise<NotificationMessageRecord[]> {
    const rows = await this.db.notificationMessage.findMany({
      where: {
        estado: { in: ["pendiente", "reintentando"] },
        OR: [{ proximoIntentoAt: null }, { proximoIntentoAt: { lte: new Date() } }],
      },
      take: limite,
    });
    // El tope por intentos depende de cada fila (maxIntentos): se filtra aquí.
    return rows.map(aNotificationMessageRecord).filter((m) => m.intentos < m.maxIntentos);
  }
}

export class MensajeRepositoryPrisma implements MensajeRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(input: NuevoMensaje): Promise<MensajeRecord> {
    return this.db.mensaje.create({ data: input });
  }

  async listarConversacion(tenantId: string, a: string, b: string): Promise<MensajeRecord[]> {
    return this.db.mensaje.findMany({
      where: {
        tenantId,
        OR: [
          { deId: a, paraId: b },
          { deId: b, paraId: a },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async listarDeUsuario(tenantId: string, usuarioId: string): Promise<MensajeRecord[]> {
    return this.db.mensaje.findMany({
      where: { tenantId, OR: [{ deId: usuarioId }, { paraId: usuarioId }] },
    });
  }

  async marcarLeidos(tenantId: string, deId: string, paraId: string): Promise<void> {
    await this.db.mensaje.updateMany({
      where: { tenantId, deId, paraId, leido: false },
      data: { leido: true },
    });
  }
}

export class BorradorRepositoryPrisma implements BorradorRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(rec: NuevoBorrador): Promise<BorradorRecord> {
    return this.db.borrador.create({ data: rec });
  }

  async actualizar(id: string, cambios: CambiosBorrador): Promise<BorradorRecord> {
    return this.db.borrador.update({ where: { id }, data: cambios });
  }

  async buscarPorId(id: string): Promise<BorradorRecord | null> {
    return this.db.borrador.findUnique({ where: { id } });
  }

  async listarPorTenant(tenantId: string): Promise<BorradorRecord[]> {
    return this.db.borrador.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
  }

  async eliminar(id: string): Promise<void> {
    await this.db.borrador.delete({ where: { id } });
  }
}

export class BuzonRepositoryPrisma implements BuzonRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: NuevoBuzon): Promise<BuzonRecord> {
    const data = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      usuario: input.usuario,
      passwordSellado: JSON.stringify(input.passwordSellado),
      carpeta: input.carpeta,
      activo: input.activo,
    };
    const row = await this.db.buzon.upsert({
      where: { tenantId: input.tenantId },
      create: { tenantId: input.tenantId, ...data },
      update: data,
    });
    return aBuzonRecord(row);
  }

  async buscarPorTenant(tenantId: string): Promise<BuzonRecord | null> {
    const row = await this.db.buzon.findUnique({ where: { tenantId } });
    return row ? aBuzonRecord(row) : null;
  }

  async listarActivos(): Promise<BuzonRecord[]> {
    const rows = await this.db.buzon.findMany({ where: { activo: true } });
    return rows.map(aBuzonRecord);
  }

  async actualizarEstado(
    tenantId: string,
    estado: { lastSyncAt?: Date; lastError?: string | null },
  ): Promise<void> {
    await this.db.buzon.update({ where: { tenantId }, data: estado });
  }

  async eliminar(tenantId: string): Promise<void> {
    await this.db.buzon.delete({ where: { tenantId } });
  }
}

type SmtpRow = {
  tenantId: string;
  host: string;
  port: number;
  secure: boolean;
  usuario: string | null;
  passwordSellado: string | null;
  remitente: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function aSmtpRecord(row: SmtpRow): SmtpSalienteRecord {
  return {
    ...row,
    passwordSellado: row.passwordSellado
      ? (JSON.parse(row.passwordSellado) as SecretoSellado)
      : null,
  };
}

export class SmtpSalienteRepositoryPrisma implements SmtpSalienteRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: NuevoSmtpSaliente): Promise<SmtpSalienteRecord> {
    const data = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      usuario: input.usuario,
      passwordSellado: input.passwordSellado ? JSON.stringify(input.passwordSellado) : null,
      remitente: input.remitente,
      activo: input.activo,
    };
    const row = await this.db.smtpSaliente.upsert({
      where: { tenantId: input.tenantId },
      create: { tenantId: input.tenantId, ...data },
      update: data,
    });
    return aSmtpRecord(row);
  }

  async buscarPorTenant(tenantId: string): Promise<SmtpSalienteRecord | null> {
    const row = await this.db.smtpSaliente.findUnique({ where: { tenantId } });
    return row ? aSmtpRecord(row) : null;
  }

  async eliminar(tenantId: string): Promise<void> {
    await this.db.smtpSaliente.delete({ where: { tenantId } });
  }
}

export class DocumentoRecibidoRepositoryPrisma implements DocumentoRecibidoRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(rec: NuevoDocumentoRecibido): Promise<DocumentoRecibidoRecord> {
    return this.db.documentoRecibido.create({ data: rec });
  }

  async buscarPorId(id: string): Promise<DocumentoRecibidoRecord | null> {
    return this.db.documentoRecibido.findUnique({ where: { id } });
  }

  async buscarPorClave(tenantId: string, clave: string): Promise<DocumentoRecibidoRecord | null> {
    return this.db.documentoRecibido.findUnique({ where: { tenantId_clave: { tenantId, clave } } });
  }

  async listarPorTenant(tenantId: string): Promise<DocumentoRecibidoRecord[]> {
    return this.db.documentoRecibido.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async guardarMensajeReceptor(id: string, mr: MensajeReceptorGuardado): Promise<void> {
    await this.db.documentoRecibido.update({
      where: { id },
      data: {
        mrRespuesta: mr.respuesta,
        mrConsecutivo: mr.consecutivo,
        mrXml: mr.xml,
        mrGeneradoAt: new Date(),
      },
    });
  }

  async eliminar(id: string): Promise<void> {
    await this.db.documentoRecibido.delete({ where: { id } });
  }
}

type EmisorRow = {
  cedula: string;
  tenantId: string;
  nombre: string;
  datosFiscales: string | null;
  certP12: string | null;
  certPassword: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aEmisorRecord(row: EmisorRow): EmisorRecord {
  const record: EmisorRecord = {
    cedula: row.cedula,
    tenantId: row.tenantId,
    nombre: row.nombre,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.datosFiscales) {
    record.datosFiscales = JSON.parse(row.datosFiscales) as EmisorRecord["datosFiscales"];
  }
  if (row.certP12 && row.certPassword) {
    record.certificado = {
      p12: JSON.parse(row.certP12) as CertificadoSellado["p12"],
      password: JSON.parse(row.certPassword) as CertificadoSellado["password"],
    };
  }
  return record;
}

export class EmisorRepositoryPrisma implements EmisorRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: NuevoEmisor): Promise<EmisorRecord> {
    const datosFiscales = input.datosFiscales ? JSON.stringify(input.datosFiscales) : undefined;
    const row = await this.db.emisor.upsert({
      where: { cedula: input.cedula },
      create: {
        cedula: input.cedula,
        tenantId: input.tenantId,
        nombre: input.nombre,
        datosFiscales,
      },
      // Solo pisa los datos fiscales si vienen en la petición.
      update: { nombre: input.nombre, ...(datosFiscales ? { datosFiscales } : {}) },
    });
    return aEmisorRecord(row);
  }

  async buscar(cedula: string): Promise<EmisorRecord | null> {
    const row = await this.db.emisor.findUnique({ where: { cedula } });
    return row ? aEmisorRecord(row) : null;
  }

  async listarPorTenant(tenantId: string): Promise<EmisorRecord[]> {
    const rows = await this.db.emisor.findMany({ where: { tenantId } });
    return rows.map(aEmisorRecord);
  }

  async guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void> {
    await this.db.emisor.update({
      where: { cedula },
      data: { certP12: JSON.stringify(cert.p12), certPassword: JSON.stringify(cert.password) },
    });
  }
}

export class ComprobanteRepositoryPrisma implements ComprobanteRepository {
  constructor(private readonly db: PrismaClient) {}

  async crear(rec: NuevoComprobante): Promise<ComprobanteRecord> {
    const row = await this.db.comprobante.create({
      data: {
        clave: rec.clave,
        cedulaEmisor: rec.cedulaEmisor,
        tipo: rec.tipo,
        consecutivo: rec.consecutivo,
        estado: rec.estado,
        xmlFirmado: rec.xmlFirmado ?? null,
        respuestaXml: rec.respuestaXml ?? null,
      },
    });
    return aComprobanteRecord(row);
  }

  async actualizarEstado(clave: string, estado: string, respuestaXml?: string): Promise<void> {
    await this.db.comprobante.update({
      where: { clave },
      data: { estado, ...(respuestaXml !== undefined ? { respuestaXml } : {}) },
    });
  }

  async buscar(clave: string): Promise<ComprobanteRecord | null> {
    const row = await this.db.comprobante.findUnique({ where: { clave } });
    return row ? aComprobanteRecord(row) : null;
  }

  async listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]> {
    const rows = await this.db.comprobante.findMany({ where: { cedulaEmisor: cedula } });
    return rows.map(aComprobanteRecord);
  }
}

export class ConsecutivoRepositoryPrisma implements ConsecutivoRepository {
  constructor(private readonly db: PrismaClient) {}

  async siguiente(
    cedulaEmisor: string,
    sucursal: number,
    terminal: number,
    tipo: string,
  ): Promise<number> {
    // Upsert con increment: atómico a nivel de fila bajo concurrencia real
    // (ON CONFLICT DO UPDATE de Postgres, sin condición de carrera).
    const row = await this.db.consecutivoContador.upsert({
      where: { cedulaEmisor_sucursal_terminal_tipo: { cedulaEmisor, sucursal, terminal, tipo } },
      create: { cedulaEmisor, sucursal, terminal, tipo, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return row.valor;
  }

  async registrarSiUsado(
    cedulaEmisor: string,
    sucursal: number,
    terminal: number,
    tipo: string,
    valor: number,
  ): Promise<void> {
    const where = { cedulaEmisor_sucursal_terminal_tipo: { cedulaEmisor, sucursal, terminal, tipo } };
    const actual = await this.db.consecutivoContador.findUnique({ where });
    if (actual && actual.valor >= valor) return;
    await this.db.consecutivoContador.upsert({
      where,
      create: { cedulaEmisor, sucursal, terminal, tipo, valor },
      update: { valor },
    });
  }
}

type ComprobanteRow = {
  clave: string;
  cedulaEmisor: string;
  tipo: string;
  consecutivo: string;
  estado: string;
  xmlFirmado: string | null;
  respuestaXml: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function aComprobanteRecord(row: ComprobanteRow): ComprobanteRecord {
  const record: ComprobanteRecord = {
    clave: row.clave,
    cedulaEmisor: row.cedulaEmisor,
    tipo: row.tipo,
    consecutivo: row.consecutivo,
    estado: row.estado,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.xmlFirmado) record.xmlFirmado = row.xmlFirmado;
  if (row.respuestaXml) record.respuestaXml = row.respuestaXml;
  return record;
}
