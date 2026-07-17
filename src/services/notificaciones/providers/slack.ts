/** Proveedor de Slack: Incoming Webhook (publica en el canal configurado). */
import type { CampoConfig, MensajeSaliente, NotificationProvider, ProviderResult } from "../tipos.js";
import { postConTimeout, errorRed, esReintentable } from "./http.js";

export class SlackProvider implements NotificationProvider {
  readonly clave = "slack" as const;
  readonly canal = "slack" as const;
  readonly nombre = "Slack";
  readonly campos: CampoConfig[] = [
    {
      clave: "webhookUrl",
      etiqueta: "Incoming Webhook URL",
      tipo: "url",
      requerido: true,
      secreto: true,
      ayuda: "https://hooks.slack.com/services/…",
    },
  ];

  async enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult> {
    const webhookUrl = String(config.webhookUrl ?? "");
    try {
      const res = await postConTimeout(webhookUrl, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: mensaje.contenido }),
      });
      const texto = await res.text().catch(() => "");
      if (res.ok) return { ok: true, respuesta: texto, destino: "Slack" };
      return {
        ok: false,
        error: `HTTP ${res.status}: ${texto}`,
        respuesta: texto,
        reintentable: esReintentable(res.status),
        destino: "Slack",
      };
    } catch (err) {
      return { ...errorRed(err), destino: "Slack" };
    }
  }
}
