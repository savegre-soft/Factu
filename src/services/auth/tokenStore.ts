/**
 * Gestor de tokens en memoria.
 *
 * Guarda el TokenSet por clave (normalmente la identificación del emisor) y
 * entrega siempre un access token válido: si está por expirar, lo renueva con
 * el refresh token de forma transparente.
 *
 * Nota: es almacenamiento en memoria (se pierde al reiniciar). Para producción
 * conviene respaldarlo en la base de datos o en un caché compartido (Redis).
 */
import type { HaciendaAuthClient, TokenSet } from "./haciendaAuth.js";

/** Margen antes del vencimiento para renovar de forma anticipada (ms). */
const SKEW_MS = 30_000;

export class TokenStore {
  private readonly tokens = new Map<string, TokenSet>();
  /** Renovaciones en curso, para no disparar varias en paralelo por la misma clave. */
  private readonly inflight = new Map<string, Promise<TokenSet>>();

  constructor(
    private readonly auth: HaciendaAuthClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** Inicia sesión y guarda los tokens bajo `key`. */
  async login(key: string, username: string, password: string): Promise<TokenSet> {
    const tokens = await this.auth.login(username, password);
    this.tokens.set(key, tokens);
    return tokens;
  }

  /** Guarda un TokenSet ya obtenido (p. ej. rehidratado desde la base de datos). */
  set(key: string, tokens: TokenSet): void {
    this.tokens.set(key, tokens);
  }

  has(key: string): boolean {
    return this.tokens.has(key);
  }

  /**
   * Devuelve un access token válido para `key`, renovando si hace falta.
   * Lanza si no hay sesión o el refresh token ya venció (hay que volver a hacer login).
   */
  async getAccessToken(key: string): Promise<string> {
    const current = this.tokens.get(key);
    if (!current) {
      throw new Error(`No hay sesión para "${key}". Iniciá sesión primero.`);
    }

    if (this.now() < current.accessExpiresAt - SKEW_MS) {
      return current.accessToken;
    }

    if (this.now() >= current.refreshExpiresAt) {
      this.tokens.delete(key);
      throw new Error(`La sesión de "${key}" expiró. Iniciá sesión de nuevo.`);
    }

    const refreshed = await this.refreshOnce(key, current.refreshToken);
    return refreshed.accessToken;
  }

  /** Cierra sesión en el IDP y descarta los tokens locales. */
  async logout(key: string): Promise<void> {
    const current = this.tokens.get(key);
    this.tokens.delete(key);
    if (current) {
      await this.auth.logout(current.refreshToken);
    }
  }

  /** Coalesce de renovaciones concurrentes para la misma clave. */
  private refreshOnce(key: string, refreshToken: string): Promise<TokenSet> {
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this.auth
      .refresh(refreshToken)
      .then((tokens) => {
        this.tokens.set(key, tokens);
        return tokens;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }
}
