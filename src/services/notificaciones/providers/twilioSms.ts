/** Proveedor de SMS: Twilio (Messages API). */
import type { CampoConfig, MensajeSaliente, NotificationProvider, ProviderResult } from "../tipos.js";
import { postConTimeout, errorRed, esReintentable } from "./http.js";

export class TwilioSmsProvider implements NotificationProvider {
  readonly clave = "twilio" as const;
  readonly canal = "sms" as const;
  readonly nombre = "Twilio SMS";
  readonly campos: CampoConfig[] = [
    { clave: "accountSid", etiqueta: "Account SID", tipo: "text", requerido: true },
    { clave: "authToken", etiqueta: "Auth Token", tipo: "password", requerido: true, secreto: true },
    { clave: "from", etiqueta: "Número remitente", tipo: "tel", requerido: true, ayuda: "En formato E.164, ej. +15005550006" },
    { clave: "to", etiqueta: "Número destino", tipo: "tel", requerido: true, ayuda: "A quién se avisa, ej. +50688888888" },
  ];

  async enviar(mensaje: MensajeSaliente, config: Record<string, unknown>): Promise<ProviderResult> {
    const sid = String(config.accountSid ?? "");
    const token = String(config.authToken ?? "");
    const from = String(config.from ?? "");
    const to = String(config.to ?? "");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ To: to, From: from, Body: mensaje.contenido });

    try {
      const res = await postConTimeout(url, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (res.ok) {
        return { ok: true, proveedorMensajeId: json.sid ?? null, respuesta: json, destino: to };
      }
      return {
        ok: false,
        error: json.message ?? `HTTP ${res.status}`,
        respuesta: json,
        reintentable: esReintentable(res.status),
        destino: to,
      };
    } catch (err) {
      return { ...errorRed(err), destino: to };
    }
  }
}
