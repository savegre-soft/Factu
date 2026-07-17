/**
 * Cliente de autenticación contra el IDP del Ministerio de Hacienda de Costa Rica.
 *
 * El IDP es un Keycloak. El flujo usado por la API de comprobantes electrónicos es:
 *   - login:   grant_type=password (usuario y clave que da Hacienda al registrar la API)
 *   - refresh: grant_type=refresh_token
 *   - logout:  se invalida el refresh_token
 *
 * client_id según ambiente: "api-stag" (pruebas) o "api-prod" (producción).
 * Históricamente el cliente es público (sin client_secret).
 */

/** Respuesta cruda del endpoint de token de Keycloak. */
interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  scope?: string;
}

/** Conjunto de tokens ya normalizado para uso interno. */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch en ms en que expira el access token. */
  accessExpiresAt: number;
  /** Epoch en ms en que expira el refresh token. */
  refreshExpiresAt: number;
}

export interface HaciendaAuthConfig {
  /** URL completa del endpoint de token del IDP (…/protocol/openid-connect/token). */
  idpTokenUrl: string;
  clientId: string;
  /** Casi siempre vacío para el cliente público de Hacienda. */
  clientSecret?: string;
  /**
   * Implementación de fetch a usar. Por defecto el fetch global (Node ≥18).
   * Inyectable para tests.
   */
  fetchFn?: typeof fetch;
  /** Reloj inyectable para tests. Por defecto Date.now. */
  now?: () => number;
}

export class HaciendaAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "HaciendaAuthError";
  }
}

export class HaciendaAuthClient {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly config: HaciendaAuthConfig) {
    this.fetchFn = config.fetchFn ?? fetch;
    this.now = config.now ?? Date.now;
  }

  /** Autentica con usuario y clave y devuelve el conjunto de tokens. */
  async login(username: string, password: string): Promise<TokenSet> {
    return this.requestToken({
      grant_type: "password",
      username,
      password,
    });
  }

  /** Renueva los tokens usando un refresh token vigente. */
  async refresh(refreshToken: string): Promise<TokenSet> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  /** Invalida el refresh token en el IDP (logout). No falla si el token ya expiró. */
  async logout(refreshToken: string): Promise<void> {
    const url = this.logoutUrl();
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);

    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    // Keycloak responde 204 en logout exitoso.
    if (!res.ok && res.status !== 204) {
      const text = await safeText(res);
      throw new HaciendaAuthError(`Logout falló (${res.status})`, res.status, text);
    }
  }

  private async requestToken(fields: Record<string, string>): Promise<TokenSet> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      ...fields,
    });
    if (this.config.clientSecret) body.set("client_secret", this.config.clientSecret);

    const res = await this.fetchFn(this.config.idpTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const errBody = await safeJson(res);
      throw new HaciendaAuthError(
        `Autenticación falló (${res.status})`,
        res.status,
        errBody,
      );
    }

    const data = (await res.json()) as KeycloakTokenResponse;
    const issuedAt = this.now();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessExpiresAt: issuedAt + data.expires_in * 1000,
      refreshExpiresAt: issuedAt + data.refresh_expires_in * 1000,
    };
  }

  /** Deriva el endpoint de logout a partir del de token. */
  private logoutUrl(): string {
    return this.config.idpTokenUrl.replace(/\/token(\?|$)/, "/logout$1");
  }
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await safeText(res);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
