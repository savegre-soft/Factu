/**
 * Proveedor Bitrix24: notifica a un usuario del portal vía un webhook entrante
 * (método REST `im.notify.system.add`). El webhook debe tener permiso `im`.
 */
import type { CampoConfig, MensajeSaliente, NotificationProvider, ProviderResult } from "../tipos.js";
import { postConTimeout, errorRed, esReintentable } from "./http.js";

export class Bitrix24Provider implements NotificationProvider {
  readonly clave = "bitrix24" as const;
  readonly canal = "bitrix24" as const;
  readonly nombre = "Bitrix24";
  readonly campos: CampoConfig[] = [
    {
      clave: "webhookUrl",
      etiqueta: "Webhook entrante",
      tipo: "url",
      requerido: true,
      secreto: true,
      ayuda: "https://tu-portal.bitrix24.com/rest/1/XXXXXXXX/ (con permiso im)",
    },
    {
      clave: "userId",
      etiqueta: "ID de usuario destino",
      tipo: "text",
      requerido: true,
      ayuda: "ID numérico del usuario de Bitrix24 que recibirá la notificación",
    },
  ];

  async enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult> {
    const base = String(config.webhookUrl ?? "").replace(/\/+$/, "");
    const userId = String(config.userId ?? "");
    const url = `${base}/im.notify.system.add.json`;
    const body = new URLSearchParams({ USER_ID: userId, MESSAGE: mensaje.contenido });
    const destino = `Bitrix24 #${userId}`;

    try {
      const res = await postConTimeout(url, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as {
        result?: unknown;
        error?: string;
        error_description?: string;
      };
      if (res.ok && json.result != null && !json.error) {
        return { ok: true, proveedorMensajeId: String(json.result), respuesta: json, destino };
      }
      return {
        ok: false,
        error: json.error_description ?? json.error ?? `HTTP ${res.status}`,
        respuesta: json,
        reintentable: esReintentable(res.status),
        destino,
      };
    } catch (err) {
      return { ...errorRed(err), destino };
    }
  }
}
