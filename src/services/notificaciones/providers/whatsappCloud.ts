/** Proveedor de WhatsApp: Meta WhatsApp Cloud API (Graph). */
import type { CampoConfig, MensajeSaliente, NotificationProvider, ProviderResult } from "../tipos.js";
import { postConTimeout, errorRed, esReintentable } from "./http.js";

const GRAPH_VERSION = "v21.0";

export class WhatsappCloudProvider implements NotificationProvider {
  readonly clave = "whatsapp_cloud" as const;
  readonly canal = "whatsapp" as const;
  readonly nombre = "WhatsApp Cloud API";
  readonly campos: CampoConfig[] = [
    { clave: "phoneNumberId", etiqueta: "Phone Number ID", tipo: "text", requerido: true },
    { clave: "accessToken", etiqueta: "Access Token", tipo: "password", requerido: true, secreto: true },
    { clave: "to", etiqueta: "Número destino", tipo: "tel", requerido: true, ayuda: "Con código de país, ej. 50688888888" },
  ];

  async enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult> {
    const phoneNumberId = String(config.phoneNumberId ?? "");
    const token = String(config.accessToken ?? "");
    const to = String(config.to ?? "");
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: mensaje.contenido },
    };

    try {
      const res = await postConTimeout(url, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string };
      };
      if (res.ok) {
        return { ok: true, proveedorMensajeId: json.messages?.[0]?.id ?? null, respuesta: json, destino: to };
      }
      return {
        ok: false,
        error: json.error?.message ?? `HTTP ${res.status}`,
        respuesta: json,
        reintentable: esReintentable(res.status),
        destino: to,
      };
    } catch (err) {
      return { ...errorRed(err), destino: to };
    }
  }
}
