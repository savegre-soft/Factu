/**
 * Proveedores OAuth (patrón Strategy): Google y Microsoft. Cada uno sabe armar
 * la URL de consentimiento y canjear el `code` por el perfil del usuario.
 * Agregar otro proveedor es implementar `ProveedorOAuth` y registrarlo.
 */
import { env } from "../../config/env.js";

export type ProviderKey = "google" | "microsoft";

export interface PerfilOAuth {
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string;
}

export interface ProveedorOAuth {
  readonly clave: ProviderKey;
  readonly nombre: string;
  configurado(): boolean;
  urlAutorizacion(state: string, redirectUri: string): string;
  intercambiar(code: string, redirectUri: string): Promise<PerfilOAuth>;
}

async function postForm(url: string, datos: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(datos),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`El proveedor rechazó el intercambio (${res.status}): ${JSON.stringify(json)}`);
  }
  return json;
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`No se pudo leer el perfil del proveedor (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

export class GoogleProvider implements ProveedorOAuth {
  readonly clave = "google" as const;
  readonly nombre = "Google";

  configurado(): boolean {
    return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
  }

  urlAutorizacion(state: string, redirectUri: string): string {
    const p = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  async intercambiar(code: string, redirectUri: string): Promise<PerfilOAuth> {
    const tok = await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const info = await getJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      String(tok.access_token),
    );
    const email = String(info.email ?? "");
    if (!email) throw new Error("Google no devolvió un correo");
    return {
      sub: String(info.sub),
      email,
      emailVerificado: info.email_verified === true || info.email_verified === "true",
      nombre: String(info.name ?? email),
    };
  }
}

export class MicrosoftProvider implements ProveedorOAuth {
  readonly clave = "microsoft" as const;
  readonly nombre = "Microsoft";

  private authority(): string {
    return `https://login.microsoftonline.com/${env.MICROSOFT_OAUTH_TENANT}`;
  }

  configurado(): boolean {
    return Boolean(env.MICROSOFT_OAUTH_CLIENT_ID && env.MICROSOFT_OAUTH_CLIENT_SECRET);
  }

  urlAutorizacion(state: string, redirectUri: string): string {
    const p = new URLSearchParams({
      client_id: env.MICROSOFT_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      response_mode: "query",
    });
    return `${this.authority()}/oauth2/v2.0/authorize?${p}`;
  }

  async intercambiar(code: string, redirectUri: string): Promise<PerfilOAuth> {
    const tok = await postForm(`${this.authority()}/oauth2/v2.0/token`, {
      code,
      client_id: env.MICROSOFT_OAUTH_CLIENT_ID!,
      client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: "openid email profile",
    });
    const info = await getJson("https://graph.microsoft.com/oidc/userinfo", String(tok.access_token));
    const email = String(info.email ?? info.preferred_username ?? "");
    if (!email) throw new Error("Microsoft no devolvió un correo");
    return {
      sub: String(info.sub),
      email,
      // Las cuentas de trabajo/escuela y personales de Microsoft están verificadas.
      emailVerificado: true,
      nombre: String(info.name ?? email),
    };
  }
}
