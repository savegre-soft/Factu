/**
 * Webhooks salientes: notifican a sistemas externos (por HTTP) cuando ocurren
 * eventos en Factu. Cada organización configura sus endpoints y a qué eventos se
 * suscribe. Los envíos se firman con HMAC-SHA256, se auditan y se reintentan.
 *
 * Reutiliza el patrón de "entrega": una tabla de intentos + un poller de
 * reintentos. El secreto de firma se guarda cifrado en reposo.
 */
import { randomUUID, createHmac } from "node:crypto";
import { sellar, abrirTexto } from "../../infra/crypto/secretBox.js";
import { registrarLog } from "../logs/index.js";
import type {
  WebhookRecord,
  WebhookRepository,
  WebhookEntregaRecord,
  WebhookEntregaRepository,
} from "../../infra/repos/types.js";

/** Catálogo de eventos que pueden disparar un webhook. */
export const EVENTOS = {
  "comprobante.aceptado": "Comprobante aceptado por Hacienda",
  "comprobante.rechazado": "Comprobante rechazado por Hacienda",
  "documento.recibido": "Documento recibido (factura que te emiten)",
  "entrega.cliente": "Entrega del comprobante al cliente (correo)",
} as const;

export type EventoKey = keyof typeof EVENTOS;

export interface EntregaConfig {
  habilitado: boolean;
  maxIntentos: number;
}

export type WebhookPublico = Omit<WebhookRecord, "secretSellado"> & { tieneSecret: boolean };

export interface DatosWebhook {
  url: string;
  /** Secreto de firma en claro (solo al guardar). Si se omite, se conserva. */
  secret?: string | null;
  eventos: string[];
  activo: boolean;
}

function publico(w: WebhookRecord): WebhookPublico {
  const { secretSellado, ...resto } = w;
  return { ...resto, tieneSecret: secretSellado !== null };
}

function firmar(payload: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

export class WebhookService {
  constructor(
    private readonly webhooks: WebhookRepository,
    private readonly entregas: WebhookEntregaRepository,
    private readonly masterKey: string,
    private readonly config: EntregaConfig,
  ) {}

  async listar(tenantId: string): Promise<WebhookPublico[]> {
    const hooks = await this.webhooks.listarPorTenant(tenantId);
    return hooks.map(publico);
  }

  async crear(tenantId: string, d: DatosWebhook): Promise<WebhookPublico> {
    const record = await this.webhooks.crear({
      id: randomUUID(),
      tenantId,
      url: d.url,
      secretSellado: d.secret ? sellar(d.secret, this.masterKey) : null,
      eventos: d.eventos,
      activo: d.activo,
    });
    return publico(record);
  }

  async actualizar(tenantId: string, id: string, d: DatosWebhook): Promise<WebhookPublico | null> {
    const existente = await this.webhooks.buscarPorId(id);
    if (!existente || existente.tenantId !== tenantId) return null;
    const secretSellado =
      d.secret != null && d.secret !== ""
        ? sellar(d.secret, this.masterKey)
        : existente.secretSellado;
    const record = await this.webhooks.actualizar(id, {
      url: d.url,
      secretSellado,
      eventos: d.eventos,
      activo: d.activo,
    });
    return publico(record);
  }

  async eliminar(tenantId: string, id: string): Promise<boolean> {
    const w = await this.webhooks.buscarPorId(id);
    if (!w || w.tenantId !== tenantId) return false;
    await this.webhooks.eliminar(id);
    return true;
  }

  async historial(tenantId: string, webhookId: string, limite = 20): Promise<WebhookEntregaRecord[]> {
    return this.entregas.listarPorWebhook(tenantId, webhookId, limite);
  }

  /**
   * Dispara un evento: encola y entrega a cada webhook suscrito. No lanza; los
   * fallos quedan en la auditoría. Best-effort y en segundo plano.
   */
  async emitir(tenantId: string, evento: string, datos: unknown): Promise<void> {
    if (!this.config.habilitado) return;
    const hooks = await this.webhooks.listarActivosPorEvento(tenantId, evento);
    for (const hook of hooks) {
      const payload = JSON.stringify({
        evento,
        tenantId,
        timestamp: new Date().toISOString(),
        datos,
      });
      const entrega = await this.entregas.crear({
        id: randomUUID(),
        tenantId,
        webhookId: hook.id,
        evento,
        payload,
        estado: "pendiente",
      });
      void this.intentar(entrega.id).catch(() => {});
    }
  }

  /** Envía a un webhook un evento de prueba y devuelve el resultado del intento. */
  async probar(tenantId: string, id: string): Promise<WebhookEntregaRecord | null> {
    const hook = await this.webhooks.buscarPorId(id);
    if (!hook || hook.tenantId !== tenantId) return null;
    const payload = JSON.stringify({
      evento: "webhook.prueba",
      tenantId,
      timestamp: new Date().toISOString(),
      datos: { mensaje: "Prueba de webhook de Factu" },
    });
    const entrega = await this.entregas.crear({
      id: randomUUID(),
      tenantId,
      webhookId: hook.id,
      evento: "webhook.prueba",
      payload,
      estado: "pendiente",
    });
    return this.intentar(entrega.id);
  }

  /** Reintenta los envíos pendientes/fallidos (usado por el poller). */
  async reintentarPendientes(): Promise<void> {
    const pendientes = await this.entregas.listarReintentables(this.config.maxIntentos);
    for (const e of pendientes) {
      await this.intentar(e.id).catch(() => {});
    }
  }

  /** Ejecuta un intento de POST firmado y registra el resultado. */
  async intentar(id: string): Promise<WebhookEntregaRecord | null> {
    const entrega = await this.entregas.buscarPorId(id);
    if (!entrega || entrega.estado === "enviado") return entrega;

    const hook = await this.webhooks.buscarPorId(entrega.webhookId);
    const intentos = entrega.intentos + 1;
    if (!hook) {
      return this.entregas.actualizar(id, { estado: "fallido", error: "Webhook eliminado", intentos });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Factu-Event": entrega.evento,
      "X-Factu-Delivery": id,
    };
    if (hook.secretSellado) {
      headers["X-Factu-Signature"] = firmar(entrega.payload, abrirTexto(hook.secretSellado, this.masterKey));
    }

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body: entrega.payload,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      const ok = res.status >= 200 && res.status < 300;
      await this.webhooks.actualizar(hook.id, {
        lastStatus: res.status,
        lastError: ok ? null : `HTTP ${res.status}`,
      });
      if (!ok) {
        registrarLog({
          nivel: "warn",
          origen: "webhooks",
          tenantId: entrega.tenantId,
          mensaje: `Webhook "${entrega.evento}" respondió HTTP ${res.status}`,
          detalle: hook.url,
        });
      }
      return this.entregas.actualizar(id, {
        estado: ok ? "enviado" : "fallido",
        statusCode: res.status,
        error: ok ? null : `HTTP ${res.status}`,
        intentos,
      });
    } catch (err) {
      const mensaje = (err as Error).message;
      await this.webhooks.actualizar(hook.id, { lastError: mensaje });
      registrarLog({
        nivel: "warn",
        origen: "webhooks",
        tenantId: entrega.tenantId,
        mensaje: `No se pudo entregar el webhook "${entrega.evento}"`,
        detalle: `${hook.url}: ${mensaje}`,
      });
      return this.entregas.actualizar(id, { estado: "fallido", error: mensaje, intentos });
    }
  }
}
