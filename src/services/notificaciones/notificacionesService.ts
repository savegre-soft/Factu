/**
 * Servicio de Notificaciones: canales de comunicación (SMS, WhatsApp, Slack,
 * Teams) que reaccionan a los eventos del sistema.
 *
 * - CRUD de canales, con la configuración (credenciales + destino) cifrada.
 * - `emitir` reacciona a un evento: encola una notificación por cada canal
 *   suscrito y la intenta en segundo plano.
 * - `intentar` resuelve el proveedor (Strategy) y entrega; registra estado,
 *   respuesta y errores. Reintenta con backoff exponencial hasta agotar.
 *
 * No lanza hacia el negocio: un evento nunca falla porque su notificación falle.
 */
import { randomUUID } from "node:crypto";
import { sellar, abrirTexto } from "../../infra/crypto/secretBox.js";
import { registrarLog } from "../logs/index.js";
import type {
  NotificationChannelRecord,
  NotificationChannelRepository,
  NotificationMessageRecord,
  NotificationMessageRepository,
  FiltroNotificacion,
} from "../../infra/repos/types.js";
import type { ProviderRegistry } from "./registry.js";
import type { ChannelType, ProviderKey } from "./tipos.js";
import { renderizar } from "./eventos.js";
import { siguienteEspera } from "./retryPolicy.js";

export interface NotificacionesConfig {
  habilitado: boolean;
  maxIntentos: number;
}

export type CanalPublico = Omit<NotificationChannelRecord, "configSellado">;

export interface DatosCanal {
  tipo: ChannelType;
  proveedor: ProviderKey;
  nombre: string;
  /** Config en claro (credenciales + destino). Al editar, vacío = conservar. */
  config?: Record<string, unknown> | null;
  eventos: string[];
  activo: boolean;
}

function publico(c: NotificationChannelRecord): CanalPublico {
  const { configSellado: _omitido, ...resto } = c;
  return resto;
}

export class NotificacionesService {
  constructor(
    private readonly canales: NotificationChannelRepository,
    private readonly mensajes: NotificationMessageRepository,
    private readonly registry: ProviderRegistry,
    private readonly masterKey: string,
    private readonly config: NotificacionesConfig,
  ) {}

  // ---- CRUD de canales ----

  async listar(tenantId: string): Promise<CanalPublico[]> {
    const canales = await this.canales.listarPorTenant(tenantId);
    return canales.map(publico);
  }

  async crear(tenantId: string, d: DatosCanal): Promise<CanalPublico> {
    const provider = this.registry.resolver(d.proveedor);
    if (provider.canal !== d.tipo) {
      throw new Error(`El proveedor "${d.proveedor}" no pertenece al canal "${d.tipo}"`);
    }
    const config = d.config ?? {};
    this.validarConfig(d.proveedor, config);
    const record = await this.canales.crear({
      id: randomUUID(),
      tenantId,
      tipo: d.tipo,
      proveedor: d.proveedor,
      nombre: d.nombre,
      configSellado: JSON.stringify(sellar(JSON.stringify(config), this.masterKey)),
      eventos: d.eventos,
      activo: d.activo,
    });
    return publico(record);
  }

  async actualizar(tenantId: string, id: string, d: DatosCanal): Promise<CanalPublico | null> {
    const existente = await this.canales.buscarPorId(id);
    if (!existente || existente.tenantId !== tenantId) return null;
    const cambios: Parameters<NotificationChannelRepository["actualizar"]>[1] = {
      nombre: d.nombre,
      eventos: d.eventos,
      activo: d.activo,
    };
    if (d.config && Object.keys(d.config).length > 0) {
      this.validarConfig(existente.proveedor as ProviderKey, d.config);
      cambios.configSellado = JSON.stringify(sellar(JSON.stringify(d.config), this.masterKey));
    }
    const record = await this.canales.actualizar(id, cambios);
    return publico(record);
  }

  async eliminar(tenantId: string, id: string): Promise<boolean> {
    const c = await this.canales.buscarPorId(id);
    if (!c || c.tenantId !== tenantId) return false;
    await this.canales.eliminar(id);
    return true;
  }

  private validarConfig(proveedor: ProviderKey, config: Record<string, unknown>): void {
    const provider = this.registry.resolver(proveedor);
    const faltantes = provider.campos
      .filter((campo) => campo.requerido && !config[campo.clave])
      .map((campo) => campo.etiqueta);
    if (faltantes.length > 0) {
      throw new Error(`Faltan campos de configuración: ${faltantes.join(", ")}`);
    }
  }

  // ---- Emisión / entrega ----

  /**
   * Reacciona a un evento: encola y entrega por cada canal suscrito. No lanza.
   * Los canales se atienden en paralelo. El emisor real (`notificarEvento`) ya
   * ejecuta esto en segundo plano, así que aquí sí esperamos el primer intento.
   */
  async emitir(tenantId: string, evento: string, datos: Record<string, unknown>): Promise<void> {
    if (!this.config.habilitado) return;
    const canales = await this.canales.listarActivosPorEvento(tenantId, evento);
    await Promise.all(
      canales.map(async (canal) => {
        const mensaje = await this.mensajes.crear({
          id: randomUUID(),
          tenantId,
          canalId: canal.id,
          proveedor: canal.proveedor,
          evento,
          contenido: renderizar(evento, datos),
          estado: "pendiente",
          maxIntentos: this.config.maxIntentos,
        });
        await this.intentar(mensaje.id).catch(() => {});
      }),
    );
  }

  /** Envía a un canal un mensaje de prueba y devuelve el resultado. */
  async probar(tenantId: string, canalId: string): Promise<NotificationMessageRecord | null> {
    const canal = await this.canales.buscarPorId(canalId);
    if (!canal || canal.tenantId !== tenantId) return null;
    const mensaje = await this.mensajes.crear({
      id: randomUUID(),
      tenantId,
      canalId: canal.id,
      proveedor: canal.proveedor,
      evento: "notificacion.prueba",
      contenido: renderizar("notificacion.prueba", {}),
      estado: "pendiente",
      maxIntentos: 1,
    });
    return this.intentar(mensaje.id);
  }

  /** Reintenta las notificaciones vencidas (usado por el poller). */
  async reintentarPendientes(): Promise<void> {
    const pendientes = await this.mensajes.listarReintentables(50);
    for (const m of pendientes) {
      await this.intentar(m.id).catch(() => {});
    }
  }

  /** Ejecuta un intento de entrega y registra el resultado. */
  async intentar(id: string): Promise<NotificationMessageRecord | null> {
    const mensaje = await this.mensajes.buscarPorId(id);
    if (!mensaje || mensaje.estado === "enviado") return mensaje;

    const canal = await this.canales.buscarPorId(mensaje.canalId);
    const intentos = mensaje.intentos + 1;
    if (!canal) {
      return this.mensajes.actualizar(id, {
        estado: "fallido",
        error: "Canal eliminado",
        intentos,
        proximoIntentoAt: null,
      });
    }

    const provider = this.registry.resolver(canal.proveedor as ProviderKey);
    const config = JSON.parse(
      abrirTexto(JSON.parse(canal.configSellado), this.masterKey),
    ) as Record<string, unknown>;

    let resultado;
    try {
      resultado = await provider.enviar(
        { evento: mensaje.evento, contenido: mensaje.contenido, datos: {} },
        config,
      );
    } catch (err) {
      resultado = { ok: false, error: (err as Error).message, reintentable: true };
    }

    await this.canales.actualizar(canal.id, {
      lastStatus: resultado.ok ? "enviado" : "fallido",
      lastError: resultado.ok ? null : resultado.error ?? null,
    });

    if (resultado.ok) {
      return this.mensajes.actualizar(id, {
        estado: "enviado",
        intentos,
        proveedorMensajeId: resultado.proveedorMensajeId ?? null,
        respuesta: JSON.stringify(resultado.respuesta ?? null),
        error: null,
        destino: resultado.destino ?? mensaje.destino,
        proximoIntentoAt: null,
      });
    }

    // Falla: reintentar (con backoff) salvo error definitivo o intentos agotados.
    const reintentable = resultado.reintentable !== false;
    const esperaMs = reintentable ? siguienteEspera(intentos, mensaje.maxIntentos) : null;
    const estado = esperaMs != null ? "reintentando" : "fallido";

    registrarLog({
      nivel: "warn",
      origen: "notificaciones",
      tenantId: mensaje.tenantId,
      mensaje: `Fallo al notificar "${mensaje.evento}" por ${canal.proveedor}`,
      detalle: resultado.error ?? null,
    });

    return this.mensajes.actualizar(id, {
      estado,
      intentos,
      respuesta: JSON.stringify(resultado.respuesta ?? null),
      error: resultado.error ?? null,
      destino: resultado.destino ?? mensaje.destino,
      proximoIntentoAt: esperaMs != null ? new Date(Date.now() + esperaMs) : null,
    });
  }

  // ---- Historial ----

  historial(tenantId: string, filtro?: FiltroNotificacion): Promise<NotificationMessageRecord[]> {
    return this.mensajes.listarPorTenant(tenantId, filtro);
  }
}
