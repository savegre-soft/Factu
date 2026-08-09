/**
 * Implementación en memoria de los repositorios.
 *
 * Útil para desarrollo y tests (no requiere base de datos). Los datos se pierden
 * al reiniciar; para producción se usa la implementación Prisma.
 */
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
  NuevoBuzon,
  NuevoEnvio,
  NuevoSmtpSaliente,
  SmtpSalienteRecord,
  SmtpSalienteRepository,
  CertificadoSellado,
  ComprobanteRecord,
  ComprobanteRepository,
  DocumentoRecibidoRecord,
  DocumentoRecibidoRepository,
  EmisorRecord,
  EmisorRepository,
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
  MensajeReceptorGuardado,
  MensajeReceptorEnviado,
  NuevaApiKey,
  NuevoComprobante,
  NuevoDocumentoRecibido,
  TenantRecord,
  TenantRepository,
  UsuarioRecord,
  UsuarioRepository,
  AuditoriaRecord,
  AuditoriaRepository,
  NuevaAuditoria,
  FiltroAuditoria,
  LogRecord,
  LogRepository,
  NuevoLog,
  FiltroLog,
  NotificationChannelRecord,
  NotificationChannelRepository,
  NuevoNotificationChannel,
  CambiosNotificationChannel,
  NotificationMessageRecord,
  NotificationMessageRepository,
  NuevoNotificationMessage,
  CambiosNotificationMessage,
  FiltroNotificacion,
  SerieConsecutivo,
  SesionHaciendaRecord,
  SesionHaciendaRepository,
  ComprobanteResumen,
  FiltroComprobantes,
  PaginaComprobantes,
  AgregadoComprobantes,
  PuntoSerieDiaria,
  RangoConsulta,
  Pagina,
  MontoAgregado,
} from "./types.js";
import { ESTADOS_FINALES } from "./types.js";
import { prefijoConsecutivo as prefijoSerie } from "../../domain/clave/clave.js";

/** Aplica la ventana de paginación; sin ventana devuelve la lista entera. */
function recortar<T>(items: T[], pagina?: Pagina): T[] {
  if (!pagina) return items;
  return items.slice(pagina.desplazamiento, pagina.desplazamiento + pagina.limite);
}

export class SesionHaciendaRepositoryMemoria implements SesionHaciendaRepository {
  private readonly sesiones = new Map<string, SesionHaciendaRecord>();

  async guardar(rec: SesionHaciendaRecord): Promise<void> {
    this.sesiones.set(rec.cedulaEmisor, rec);
  }

  async buscar(cedulaEmisor: string): Promise<SesionHaciendaRecord | null> {
    return this.sesiones.get(cedulaEmisor) ?? null;
  }

  async eliminar(cedulaEmisor: string): Promise<void> {
    this.sesiones.delete(cedulaEmisor);
  }

  async purgarVencidas(ahora: Date): Promise<number> {
    let borradas = 0;
    for (const [clave, sesion] of this.sesiones) {
      if (sesion.refreshExpiresAt <= ahora) {
        this.sesiones.delete(clave);
        borradas++;
      }
    }
    return borradas;
  }
}

export class TenantRepositoryMemoria implements TenantRepository {
  private readonly tenants = new Map<string, TenantRecord>();

  async crear(input: { id: string; nombre: string }): Promise<TenantRecord> {
    const record: TenantRecord = { ...input, createdAt: new Date() };
    this.tenants.set(input.id, record);
    return record;
  }

  async buscar(id: string): Promise<TenantRecord | null> {
    return this.tenants.get(id) ?? null;
  }
}

export class UsuarioRepositoryMemoria implements UsuarioRepository {
  private readonly usuarios = new Map<string, UsuarioRecord>();

  async crear(input: Omit<UsuarioRecord, "createdAt">): Promise<UsuarioRecord> {
    if (await this.buscarPorEmail(input.email)) {
      throw new Error(`Ya existe un usuario con el correo "${input.email}"`);
    }
    const record: UsuarioRecord = { ...input, createdAt: new Date() };
    this.usuarios.set(input.id, record);
    return record;
  }

  async buscarPorEmail(email: string): Promise<UsuarioRecord | null> {
    const buscado = email.toLowerCase();
    return [...this.usuarios.values()].find((u) => u.email.toLowerCase() === buscado) ?? null;
  }

  async buscarPorId(id: string): Promise<UsuarioRecord | null> {
    return this.usuarios.get(id) ?? null;
  }

  async listarPorTenant(tenantId: string): Promise<UsuarioRecord[]> {
    return [...this.usuarios.values()].filter((u) => u.tenantId === tenantId);
  }

  async actualizar(id: string, cambios: CambiosUsuario): Promise<UsuarioRecord> {
    const existente = this.usuarios.get(id);
    if (!existente) throw new Error(`Usuario "${id}" no encontrado`);
    const record: UsuarioRecord = { ...existente, ...cambios };
    this.usuarios.set(id, record);
    return record;
  }

  async eliminar(id: string): Promise<void> {
    if (!this.usuarios.delete(id)) throw new Error(`Usuario "${id}" no encontrado`);
  }
}

export class ApiKeyRepositoryMemoria implements ApiKeyRepository {
  private readonly keys = new Map<string, ApiKeyRecord>();

  async crear(input: NuevaApiKey): Promise<ApiKeyRecord> {
    const record: ApiKeyRecord = {
      ...input,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.keys.set(input.id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<ApiKeyRecord | null> {
    return this.keys.get(id) ?? null;
  }

  async buscarPorKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    return [...this.keys.values()].find((k) => k.keyId === keyId) ?? null;
  }

  async listarPorTenant(tenantId: string): Promise<ApiKeyRecord[]> {
    return [...this.keys.values()].filter((k) => k.tenantId === tenantId);
  }

  async marcarUso(id: string): Promise<void> {
    const existente = this.keys.get(id);
    if (existente) this.keys.set(id, { ...existente, lastUsedAt: new Date() });
  }

  async revocar(id: string): Promise<void> {
    const existente = this.keys.get(id);
    if (existente && !existente.revokedAt) {
      this.keys.set(id, { ...existente, revokedAt: new Date() });
    }
  }
}

export class EmisorRepositoryMemoria implements EmisorRepository {
  private readonly emisores = new Map<string, EmisorRecord>();

  async upsert(input: NuevoEmisor): Promise<EmisorRecord> {
    const ahora = new Date();
    const existente = this.emisores.get(input.cedula);
    const record: EmisorRecord = existente
      ? {
          ...existente,
          nombre: input.nombre,
          datosFiscales: input.datosFiscales ?? existente.datosFiscales,
          updatedAt: ahora,
        }
      : {
          cedula: input.cedula,
          tenantId: input.tenantId,
          nombre: input.nombre,
          datosFiscales: input.datosFiscales,
          createdAt: ahora,
          updatedAt: ahora,
        };
    this.emisores.set(input.cedula, record);
    return record;
  }

  async buscar(cedula: string): Promise<EmisorRecord | null> {
    return this.emisores.get(cedula) ?? null;
  }

  async listarPorTenant(tenantId: string): Promise<EmisorRecord[]> {
    return [...this.emisores.values()].filter((e) => e.tenantId === tenantId);
  }

  async guardarCertificado(cedula: string, cert: CertificadoSellado): Promise<void> {
    const existente = this.emisores.get(cedula);
    if (!existente) throw new Error(`Emisor "${cedula}" no registrado`);
    this.emisores.set(cedula, { ...existente, certificado: cert, updatedAt: new Date() });
  }
}

export class WebhookRepositoryMemoria implements WebhookRepository {
  private readonly hooks = new Map<string, WebhookRecord>();

  async crear(input: NuevoWebhook): Promise<WebhookRecord> {
    const ahora = new Date();
    const record: WebhookRecord = {
      ...input,
      lastStatus: null,
      lastError: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.hooks.set(input.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosWebhook): Promise<WebhookRecord> {
    const existente = this.hooks.get(id);
    if (!existente) throw new Error(`Webhook "${id}" no encontrado`);
    const record: WebhookRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.hooks.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<WebhookRecord | null> {
    return this.hooks.get(id) ?? null;
  }

  async listarPorTenant(tenantId: string): Promise<WebhookRecord[]> {
    return [...this.hooks.values()].filter((h) => h.tenantId === tenantId);
  }

  async listarActivosPorEvento(tenantId: string, evento: string): Promise<WebhookRecord[]> {
    return [...this.hooks.values()].filter(
      (h) => h.tenantId === tenantId && h.activo && h.eventos.includes(evento),
    );
  }

  async eliminar(id: string): Promise<void> {
    this.hooks.delete(id);
  }
}

export class WebhookEntregaRepositoryMemoria implements WebhookEntregaRepository {
  private readonly entregas = new Map<string, WebhookEntregaRecord>();

  async crear(input: NuevaWebhookEntrega): Promise<WebhookEntregaRecord> {
    const ahora = new Date();
    const record: WebhookEntregaRecord = {
      ...input,
      statusCode: null,
      error: null,
      intentos: 0,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.entregas.set(input.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosWebhookEntrega): Promise<WebhookEntregaRecord> {
    const existente = this.entregas.get(id);
    if (!existente) throw new Error(`Entrega de webhook "${id}" no encontrada`);
    const record: WebhookEntregaRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.entregas.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<WebhookEntregaRecord | null> {
    return this.entregas.get(id) ?? null;
  }

  async listarPorWebhook(tenantId: string, webhookId: string, limite: number): Promise<WebhookEntregaRecord[]> {
    return [...this.entregas.values()]
      .filter((e) => e.tenantId === tenantId && e.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limite);
  }

  async listarReintentables(maxIntentos: number): Promise<WebhookEntregaRecord[]> {
    return [...this.entregas.values()].filter(
      (e) => e.estado !== "enviado" && e.intentos < maxIntentos,
    );
  }
}

export class AuditoriaRepositoryMemoria implements AuditoriaRepository {
  private readonly registros = new Map<string, AuditoriaRecord>();

  async crear(input: NuevaAuditoria): Promise<AuditoriaRecord> {
    const record: AuditoriaRecord = {
      ...input,
      actorId: input.actorId ?? null,
      recursoId: input.recursoId ?? null,
      detalle: input.detalle ?? null,
      ip: input.ip ?? null,
      createdAt: new Date(),
    };
    this.registros.set(input.id, record);
    return record;
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroAuditoria): Promise<AuditoriaRecord[]> {
    return [...this.registros.values()]
      .filter((r) => r.tenantId === tenantId && (!filtro?.accion || r.accion === filtro.accion))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filtro?.limite ?? 200);
  }
}

export class LogRepositoryMemoria implements LogRepository {
  private readonly registros = new Map<string, LogRecord>();

  async crear(input: NuevoLog): Promise<LogRecord> {
    const record: LogRecord = {
      ...input,
      tenantId: input.tenantId ?? null,
      detalle: input.detalle ?? null,
      createdAt: new Date(),
    };
    this.registros.set(input.id, record);
    return record;
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroLog): Promise<LogRecord[]> {
    return [...this.registros.values()]
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          (!filtro?.nivel || r.nivel === filtro.nivel) &&
          (!filtro?.origen || r.origen === filtro.origen),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filtro?.limite ?? 200);
  }
}

export class ClienteRepositoryMemoria implements ClienteRepository {
  private readonly clientes = new Map<string, ClienteRecord>();

  private clave(tenantId: string, numero: string) {
    return `${tenantId}:${numero}`;
  }

  async upsert(input: NuevoCliente): Promise<ClienteRecord> {
    const ahora = new Date();
    const k = this.clave(input.tenantId, input.numero);
    const existente = this.clientes.get(k);
    const record: ClienteRecord = existente
      ? { ...existente, ...input, correo: input.correo ?? null, updatedAt: ahora }
      : { ...input, correo: input.correo ?? null, createdAt: ahora, updatedAt: ahora };
    this.clientes.set(k, record);
    return record;
  }

  async buscarPorNumero(tenantId: string, numero: string): Promise<ClienteRecord | null> {
    return this.clientes.get(this.clave(tenantId, numero)) ?? null;
  }

  async listarPorTenant(tenantId: string, pagina?: Pagina): Promise<ClienteRecord[]> {
    const todos = [...this.clientes.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return recortar(todos, pagina);
  }

  async contarPorTenant(tenantId: string): Promise<number> {
    return [...this.clientes.values()].filter((c) => c.tenantId === tenantId).length;
  }
}

export class OAuthIdentityRepositoryMemoria implements OAuthIdentityRepository {
  private readonly identidades = new Map<string, OAuthIdentityRecord>();

  async crear(input: NuevaOAuthIdentity): Promise<OAuthIdentityRecord> {
    const record: OAuthIdentityRecord = { ...input, createdAt: new Date() };
    this.identidades.set(input.id, record);
    return record;
  }

  async buscarPorProviderSub(provider: string, providerSub: string): Promise<OAuthIdentityRecord | null> {
    return (
      [...this.identidades.values()].find(
        (i) => i.provider === provider && i.providerSub === providerSub,
      ) ?? null
    );
  }

  async listarPorUsuario(userId: string): Promise<OAuthIdentityRecord[]> {
    return [...this.identidades.values()].filter((i) => i.userId === userId);
  }

  async eliminar(id: string): Promise<void> {
    this.identidades.delete(id);
  }
}

export class PasswordResetRepositoryMemoria implements PasswordResetRepository {
  private readonly resets = new Map<string, PasswordResetRecord>();

  async crear(input: NuevoPasswordReset): Promise<PasswordResetRecord> {
    const record: PasswordResetRecord = { ...input, usado: false, createdAt: new Date() };
    this.resets.set(input.id, record);
    return record;
  }

  async buscarVigentePorUsuario(userId: string): Promise<PasswordResetRecord | null> {
    const ahora = Date.now();
    return (
      [...this.resets.values()]
        .filter((r) => r.userId === userId && !r.usado && r.expiresAt.getTime() > ahora)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    );
  }

  async marcarUsado(id: string): Promise<void> {
    const r = this.resets.get(id);
    if (r) this.resets.set(id, { ...r, usado: true });
  }

  async invalidarPorUsuario(userId: string): Promise<void> {
    for (const [id, r] of this.resets) {
      if (r.userId === userId && !r.usado) this.resets.set(id, { ...r, usado: true });
    }
  }
}

export class NotificationChannelRepositoryMemoria implements NotificationChannelRepository {
  private readonly canales = new Map<string, NotificationChannelRecord>();

  async crear(input: NuevoNotificationChannel): Promise<NotificationChannelRecord> {
    const ahora = new Date();
    const record: NotificationChannelRecord = {
      ...input,
      lastStatus: null,
      lastError: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.canales.set(input.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosNotificationChannel): Promise<NotificationChannelRecord> {
    const existente = this.canales.get(id);
    if (!existente) throw new Error(`Canal "${id}" no encontrado`);
    const record: NotificationChannelRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.canales.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<NotificationChannelRecord | null> {
    return this.canales.get(id) ?? null;
  }

  async listarPorTenant(tenantId: string): Promise<NotificationChannelRecord[]> {
    return [...this.canales.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listarActivosPorEvento(tenantId: string, evento: string): Promise<NotificationChannelRecord[]> {
    return [...this.canales.values()].filter(
      (c) => c.tenantId === tenantId && c.activo && c.eventos.includes(evento),
    );
  }

  async eliminar(id: string): Promise<void> {
    this.canales.delete(id);
  }
}

export class NotificationMessageRepositoryMemoria implements NotificationMessageRepository {
  private readonly mensajes = new Map<string, NotificationMessageRecord>();

  async crear(input: NuevoNotificationMessage): Promise<NotificationMessageRecord> {
    const ahora = new Date();
    const record: NotificationMessageRecord = {
      ...input,
      destino: input.destino ?? null,
      intentos: 0,
      proximoIntentoAt: null,
      proveedorMensajeId: null,
      respuesta: null,
      error: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.mensajes.set(input.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosNotificationMessage): Promise<NotificationMessageRecord> {
    const existente = this.mensajes.get(id);
    if (!existente) throw new Error(`Notificación "${id}" no encontrada`);
    const record: NotificationMessageRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.mensajes.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<NotificationMessageRecord | null> {
    return this.mensajes.get(id) ?? null;
  }

  async listarPorTenant(tenantId: string, filtro?: FiltroNotificacion): Promise<NotificationMessageRecord[]> {
    return [...this.mensajes.values()]
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          (!filtro?.estado || m.estado === filtro.estado) &&
          (!filtro?.canalId || m.canalId === filtro.canalId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, filtro?.limite ?? 200);
  }

  async listarReintentables(limite: number): Promise<NotificationMessageRecord[]> {
    const ahora = Date.now();
    return [...this.mensajes.values()]
      .filter(
        (m) =>
          (m.estado === "pendiente" || m.estado === "reintentando") &&
          m.intentos < m.maxIntentos &&
          (m.proximoIntentoAt === null || m.proximoIntentoAt.getTime() <= ahora),
      )
      .slice(0, limite);
  }
}

export class MensajeRepositoryMemoria implements MensajeRepository {
  private readonly mensajes = new Map<string, MensajeRecord>();

  async crear(input: NuevoMensaje): Promise<MensajeRecord> {
    const record: MensajeRecord = { ...input, leido: false, createdAt: new Date() };
    this.mensajes.set(input.id, record);
    return record;
  }

  async listarConversacion(tenantId: string, a: string, b: string): Promise<MensajeRecord[]> {
    return [...this.mensajes.values()]
      .filter(
        (m) =>
          m.tenantId === tenantId &&
          ((m.deId === a && m.paraId === b) || (m.deId === b && m.paraId === a)),
      )
      .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime());
  }

  async listarDeUsuario(tenantId: string, usuarioId: string): Promise<MensajeRecord[]> {
    return [...this.mensajes.values()].filter(
      (m) => m.tenantId === tenantId && (m.deId === usuarioId || m.paraId === usuarioId),
    );
  }

  async marcarLeidos(tenantId: string, deId: string, paraId: string): Promise<void> {
    for (const m of this.mensajes.values()) {
      if (m.tenantId === tenantId && m.deId === deId && m.paraId === paraId && !m.leido) {
        this.mensajes.set(m.id, { ...m, leido: true });
      }
    }
  }
}

export class EnvioComprobanteRepositoryMemoria implements EnvioComprobanteRepository {
  private readonly envios = new Map<string, EnvioComprobanteRecord>();

  async crear(rec: NuevoEnvio): Promise<EnvioComprobanteRecord> {
    const ahora = new Date();
    const record: EnvioComprobanteRecord = {
      ...rec,
      error: null,
      intentos: 0,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.envios.set(rec.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosEnvio): Promise<EnvioComprobanteRecord> {
    const existente = this.envios.get(id);
    if (!existente) throw new Error(`Envío "${id}" no encontrado`);
    const record: EnvioComprobanteRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.envios.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<EnvioComprobanteRecord | null> {
    return this.envios.get(id) ?? null;
  }

  async listarPorClave(tenantId: string, clave: string): Promise<EnvioComprobanteRecord[]> {
    return [...this.envios.values()]
      .filter((e) => e.tenantId === tenantId && e.clave === clave)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listarReintentables(maxIntentos: number): Promise<EnvioComprobanteRecord[]> {
    return [...this.envios.values()].filter(
      (e) => e.estado !== "enviado" && e.intentos < maxIntentos,
    );
  }
}

export class BorradorRepositoryMemoria implements BorradorRepository {
  private readonly borradores = new Map<string, BorradorRecord>();

  async crear(rec: NuevoBorrador): Promise<BorradorRecord> {
    const ahora = new Date();
    const record: BorradorRecord = { ...rec, createdAt: ahora, updatedAt: ahora };
    this.borradores.set(rec.id, record);
    return record;
  }

  async actualizar(id: string, cambios: CambiosBorrador): Promise<BorradorRecord> {
    const existente = this.borradores.get(id);
    if (!existente) throw new Error(`Borrador "${id}" no encontrado`);
    const record: BorradorRecord = { ...existente, ...cambios, updatedAt: new Date() };
    this.borradores.set(id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<BorradorRecord | null> {
    return this.borradores.get(id) ?? null;
  }

  async listarPorTenant(tenantId: string, pagina?: Pagina): Promise<BorradorRecord[]> {
    const todos = [...this.borradores.values()]
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return recortar(todos, pagina);
  }

  async contarPorTenant(tenantId: string): Promise<number> {
    return [...this.borradores.values()].filter((b) => b.tenantId === tenantId).length;
  }

  async eliminar(id: string): Promise<void> {
    this.borradores.delete(id);
  }
}

export class BuzonRepositoryMemoria implements BuzonRepository {
  private readonly buzones = new Map<string, BuzonRecord>();

  async upsert(input: NuevoBuzon): Promise<BuzonRecord> {
    const ahora = new Date();
    const existente = this.buzones.get(input.tenantId);
    const record: BuzonRecord = existente
      ? { ...existente, ...input, updatedAt: ahora }
      : { ...input, lastSyncAt: null, lastError: null, createdAt: ahora, updatedAt: ahora };
    this.buzones.set(input.tenantId, record);
    return record;
  }

  async buscarPorTenant(tenantId: string): Promise<BuzonRecord | null> {
    return this.buzones.get(tenantId) ?? null;
  }

  async listarActivos(): Promise<BuzonRecord[]> {
    return [...this.buzones.values()].filter((b) => b.activo);
  }

  async actualizarEstado(
    tenantId: string,
    estado: { lastSyncAt?: Date; lastError?: string | null },
  ): Promise<void> {
    const existente = this.buzones.get(tenantId);
    if (!existente) return;
    this.buzones.set(tenantId, {
      ...existente,
      lastSyncAt: estado.lastSyncAt ?? existente.lastSyncAt,
      lastError: estado.lastError !== undefined ? estado.lastError : existente.lastError,
      updatedAt: new Date(),
    });
  }

  async eliminar(tenantId: string): Promise<void> {
    this.buzones.delete(tenantId);
  }
}

export class SmtpSalienteRepositoryMemoria implements SmtpSalienteRepository {
  private readonly configs = new Map<string, SmtpSalienteRecord>();

  async upsert(input: NuevoSmtpSaliente): Promise<SmtpSalienteRecord> {
    const ahora = new Date();
    const existente = this.configs.get(input.tenantId);
    const record: SmtpSalienteRecord = existente
      ? { ...existente, ...input, updatedAt: ahora }
      : { ...input, createdAt: ahora, updatedAt: ahora };
    this.configs.set(input.tenantId, record);
    return record;
  }

  async buscarPorTenant(tenantId: string): Promise<SmtpSalienteRecord | null> {
    return this.configs.get(tenantId) ?? null;
  }

  async eliminar(tenantId: string): Promise<void> {
    this.configs.delete(tenantId);
  }
}

export class DocumentoRecibidoRepositoryMemoria implements DocumentoRecibidoRepository {
  private readonly docs = new Map<string, DocumentoRecibidoRecord>();

  async crear(rec: NuevoDocumentoRecibido): Promise<DocumentoRecibidoRecord> {
    const ahora = new Date();
    const record: DocumentoRecibidoRecord = {
      ...rec,
      mrRespuesta: null,
      mrConsecutivo: null,
      mrXml: null,
      mrGeneradoAt: null,
      mrEstado: null,
      mrXmlFirmado: null,
      mrRespuestaXml: null,
      mrEnviadoAt: null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.docs.set(rec.id, record);
    return record;
  }

  async buscarPorId(id: string): Promise<DocumentoRecibidoRecord | null> {
    return this.docs.get(id) ?? null;
  }

  async buscarPorClave(tenantId: string, clave: string): Promise<DocumentoRecibidoRecord | null> {
    return (
      [...this.docs.values()].find((d) => d.tenantId === tenantId && d.clave === clave) ?? null
    );
  }

  async listarPorTenant(tenantId: string, pagina?: Pagina): Promise<DocumentoRecibidoRecord[]> {
    return recortar(
      [...this.docs.values()].filter((d) => d.tenantId === tenantId),
      pagina,
    );
  }

  async contarPorTenant(tenantId: string): Promise<number> {
    return [...this.docs.values()].filter((d) => d.tenantId === tenantId).length;
  }

  async guardarMensajeReceptor(id: string, mr: MensajeReceptorGuardado): Promise<void> {
    const existente = this.docs.get(id);
    if (!existente) throw new Error(`Documento recibido "${id}" no encontrado`);
    this.docs.set(id, {
      ...existente,
      mrRespuesta: mr.respuesta,
      mrConsecutivo: mr.consecutivo,
      mrXml: mr.xml,
      mrGeneradoAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async guardarEnvioMensajeReceptor(id: string, envio: MensajeReceptorEnviado): Promise<void> {
    const existente = this.docs.get(id);
    if (!existente) throw new Error(`Documento recibido "${id}" no encontrado`);
    this.docs.set(id, {
      ...existente,
      mrEstado: envio.estado,
      mrXmlFirmado: envio.xmlFirmado,
      mrRespuestaXml: envio.respuestaXml ?? null,
      mrEnviadoAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async eliminar(id: string): Promise<void> {
    this.docs.delete(id);
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

  /** Quita los XML de una fila para no exponerlos en los listados. */
  private static resumen(c: ComprobanteRecord): ComprobanteResumen {
    const { xmlFirmado: _x, respuestaXml: _r, ...resto } = c;
    return resto;
  }

  private enRango(c: ComprobanteRecord, rango?: RangoConsulta): boolean {
    if (rango?.desde && c.createdAt < rango.desde) return false;
    if (rango?.hasta && c.createdAt > rango.hasta) return false;
    return true;
  }

  async listarResumen(filtro: FiltroComprobantes): Promise<PaginaComprobantes> {
    const cedulas = new Set(filtro.cedulasEmisor);
    const todos = [...this.comprobantes.values()]
      .filter((c) => cedulas.has(c.cedulaEmisor) && this.enRango(c, filtro))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const desde = filtro.desplazamiento ?? 0;
    const items = todos
      .slice(desde, desde + (filtro.limite ?? todos.length))
      .map(ComprobanteRepositoryMemoria.resumen);
    return { items, total: todos.length };
  }

  async listarNoFinalizados(limite: number, maxAntiguedadMs: number): Promise<ComprobanteResumen[]> {
    const corte = Date.now() - maxAntiguedadMs;
    return [...this.comprobantes.values()]
      .filter(
        (c) => !ESTADOS_FINALES.includes(c.estado.toLowerCase()) && c.createdAt.getTime() >= corte,
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limite)
      .map(ComprobanteRepositoryMemoria.resumen);
  }

  async agregarPorEmisor(
    cedulasEmisor: string[],
    rango?: RangoConsulta,
  ): Promise<AgregadoComprobantes[]> {
    const cedulas = new Set(cedulasEmisor);
    const grupos = new Map<string, AgregadoComprobantes>();
    for (const c of this.comprobantes.values()) {
      if (!cedulas.has(c.cedulaEmisor) || !this.enRango(c, rango)) continue;
      const clave = `${c.cedulaEmisor}|${c.estado}|${c.tipo}`;
      const previo = grupos.get(clave);
      if (previo) {
        previo.total++;
        if (c.createdAt > previo.ultima) previo.ultima = c.createdAt;
      } else {
        grupos.set(clave, {
          cedulaEmisor: c.cedulaEmisor,
          estado: c.estado,
          tipo: c.tipo,
          total: 1,
          ultima: c.createdAt,
        });
      }
    }
    return [...grupos.values()];
  }

  async serieDiaria(
    cedulasEmisor: string[],
    rango?: RangoConsulta,
  ): Promise<PuntoSerieDiaria[]> {
    const cedulas = new Set(cedulasEmisor);
    const porDia = new Map<string, number>();
    for (const c of this.comprobantes.values()) {
      if (!cedulas.has(c.cedulaEmisor) || !this.enRango(c, rango)) continue;
      const dia = c.createdAt.toISOString().slice(0, 10);
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    return [...porDia.entries()]
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async montosPorMoneda(
    cedulasEmisor: string[],
    rango?: RangoConsulta,
  ): Promise<MontoAgregado[]> {
    const cedulas = new Set(cedulasEmisor);
    const grupos = new Map<string, MontoAgregado>();
    for (const c of this.comprobantes.values()) {
      if (!cedulas.has(c.cedulaEmisor) || !this.enRango(c, rango)) continue;
      if (c.estado !== "aceptado" || c.total == null) continue;
      const moneda = c.moneda ?? "CRC";
      const mes = c.createdAt.toISOString().slice(0, 7);
      const clave = `${moneda}|${mes}`;
      // Las notas de crédito restan: el neto es lo que se facturó de verdad.
      const aporte = (c.tipo === "NC" ? -1 : 1) * c.total;
      const previo = grupos.get(clave);
      if (previo) {
        previo.total += aporte;
        previo.cantidad++;
      } else {
        grupos.set(clave, { moneda, mes, total: aporte, cantidad: 1 });
      }
    }
    return [...grupos.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  /** Contadores por serie. En memoria no hay concurrencia real: JS es de un hilo. */
  private readonly series = new Map<string, number>();

  private static claveSerie(s: SerieConsecutivo): string {
    return `${s.cedulaEmisor}|${s.sucursal}|${s.terminal}|${s.tipo}`;
  }

  /** Arranca la serie desde el mayor consecutivo ya emitido (migración suave). */
  private ultimoUsado(serie: SerieConsecutivo): number {
    const guardado = this.series.get(ComprobanteRepositoryMemoria.claveSerie(serie));
    if (guardado !== undefined) return guardado;
    const prefijo = prefijoSerie(serie);
    let max = 0;
    for (const c of this.comprobantes.values()) {
      if (c.cedulaEmisor !== serie.cedulaEmisor || !c.consecutivo.startsWith(prefijo)) continue;
      max = Math.max(max, Number(c.consecutivo.slice(-10)) || 0);
    }
    return max;
  }

  async reservarConsecutivo(serie: SerieConsecutivo): Promise<number> {
    const siguiente = this.ultimoUsado(serie) + 1;
    this.series.set(ComprobanteRepositoryMemoria.claveSerie(serie), siguiente);
    return siguiente;
  }

  async proximoConsecutivo(serie: SerieConsecutivo): Promise<number> {
    return this.ultimoUsado(serie) + 1;
  }

  async liberarConsecutivo(serie: SerieConsecutivo, numero: number): Promise<boolean> {
    const clave = ComprobanteRepositoryMemoria.claveSerie(serie);
    if (this.series.get(clave) !== numero) return false;
    this.series.set(clave, numero - 1);
    return true;
  }
}
