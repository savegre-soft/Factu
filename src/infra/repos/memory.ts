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
  MensajeReceptorGuardado,
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
} from "./types.js";

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

  async upsert(input: { cedula: string; tenantId: string; nombre: string }): Promise<EmisorRecord> {
    const ahora = new Date();
    const existente = this.emisores.get(input.cedula);
    const record: EmisorRecord = existente
      ? { ...existente, nombre: input.nombre, updatedAt: ahora }
      : {
          cedula: input.cedula,
          tenantId: input.tenantId,
          nombre: input.nombre,
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

  async listarPorTenant(tenantId: string): Promise<BorradorRecord[]> {
    return [...this.borradores.values()]
      .filter((b) => b.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
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

  async listarPorTenant(tenantId: string): Promise<DocumentoRecibidoRecord[]> {
    return [...this.docs.values()].filter((d) => d.tenantId === tenantId);
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

  async listarPorEmisor(cedula: string): Promise<ComprobanteRecord[]> {
    return [...this.comprobantes.values()].filter((c) => c.cedulaEmisor === cedula);
  }
}
