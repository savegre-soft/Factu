/** Proveedor de Microsoft Teams: Incoming Webhook (conector del canal). */
import type { CampoConfig, MensajeSaliente, NotificationProvider, ProviderResult } from "../tipos.js";
import { postConTimeout, errorRed, esReintentable } from "./http.js";

export class TeamsProvider implements NotificationProvider {
  readonly clave = "teams" as const;
  readonly canal = "teams" as const;
  readonly nombre = "Microsoft Teams";
  readonly campos: CampoConfig[] = [
    {
      clave: "webhookUrl",
      etiqueta: "Incoming Webhook URL",
      tipo: "url",
      requerido: true,
      secreto: true,
      ayuda: "URL del conector entrante del canal de Teams",
    },
  ];

  async enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult> {
    const webhookUrl = String(config.webhookUrl ?? "");
    // Tarjeta simple compatible con los conectores entrantes de Teams.
    const card = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      summary: "Notificación de Factu",
      text: mensaje.contenido.replace(/\n/g, "  \n"),
    };
    try {
      const res = await postConTimeout(webhookUrl, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });
      const texto = await res.text().catch(() => "");
      if (res.ok) return { ok: true, respuesta: texto, destino: "Teams" };
      return {
        ok: false,
        error: `HTTP ${res.status}: ${texto}`,
        respuesta: texto,
        reintentable: esReintentable(res.status),
        destino: "Teams",
      };
    } catch (err) {
      return { ...errorRed(err), destino: "Teams" };
    }
  }
}
