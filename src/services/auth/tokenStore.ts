/**
 * Gestor de tokens del IDP de Hacienda.
 *
 * Guarda el TokenSet por clave (normalmente la identificación del emisor) y
 * entrega siempre un access token válido: si está por expirar, lo renueva con
 * el refresh token de forma transparente.
 *
 * El Map es solo un caché: el respaldo real es el `AlmacenSesiones` que se le
 * inyecta (tokens cifrados en la base), así que las sesiones sobreviven a un
 * reinicio. Sin almacén se comporta como antes, únicamente en memoria.
 */
import type { HaciendaAuthClient, TokenSet } from "./haciendaAuth.js";
import type { AlmacenSesiones } from "./almacenSesiones.js";

/** Margen antes del vencimiento para renovar de forma anticipada (ms). */
const SKEW_MS = 30_000;

/**
 * No hay sesión con el IDP para ese emisor (nunca la hubo o venció el refresh).
 * Es una clase aparte para que las rutas puedan responder 401 —«iniciá sesión»—
 * en vez de confundirlo con un fallo de la integración.
 */
export class SinSesionHaciendaError extends Error {
  constructor(readonly emisor: string, mensaje: string) {
    super(mensaje);
    this.name = "SinSesionHaciendaError";
  }
}

export class TokenStore {
  private readonly tokens = new Map<string, TokenSet>();
  /** Renovaciones en curso, para no disparar varias en paralelo por la misma clave. */
  private readonly inflight = new Map<string, Promise<TokenSet>>();

  constructor(
    private readonly auth: HaciendaAuthClient,
    private readonly now: () => number = Date.now,
    /**
     * Respaldo persistente. Sin él, el Map es la única copia y un reinicio
     * obliga a todos los emisores a autenticarse otra vez.
     */
    private readonly almacen?: AlmacenSesiones,
  ) {}

  /** Escribe en el respaldo sin romper la operación si la base falla. */
  private async respaldar(key: string, tokens: TokenSet): Promise<void> {
    if (!this.almacen) return;
    try {
      await this.almacen.guardar(key, tokens);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[hacienda] No se pudo persistir la sesión de "${key}":`, err);
    }
  }

  /** Inicia sesión y guarda los tokens bajo `key`. */
  async login(key: string, username: string, password: string): Promise<TokenSet> {
    const tokens = await this.auth.login(username, password);
    this.tokens.set(key, tokens);
    await this.respaldar(key, tokens);
    return tokens;
  }

  /**
   * Busca en memoria y, si no está, rehidrata desde el respaldo. Es lo que hace
   * que la sesión sobreviva a un reinicio de la API.
   */
  private async cargar(key: string): Promise<TokenSet | null> {
    const enMemoria = this.tokens.get(key);
    if (enMemoria) return enMemoria;
    if (!this.almacen) return null;

    const persistido = await this.almacen.leer(key).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[hacienda] No se pudo leer la sesión de "${key}":`, err);
      return null;
    });
    if (persistido) this.tokens.set(key, persistido);
    return persistido;
  }

  /** Guarda un TokenSet ya obtenido (p. ej. rehidratado desde la base de datos). */
  set(key: string, tokens: TokenSet): void {
    this.tokens.set(key, tokens);
  }

  async has(key: string): Promise<boolean> {
    return (await this.cargar(key)) !== null;
  }

  /**
   * Devuelve un access token válido para `key`, renovando si hace falta.
   * Lanza si no hay sesión o el refresh token ya venció (hay que volver a hacer login).
   */
  async getAccessToken(key: string): Promise<string> {
    const current = await this.cargar(key);
    if (!current) {
      throw new SinSesionHaciendaError(key, `No hay sesión con Hacienda para "${key}". Iniciá sesión primero.`);
    }

    if (this.now() < current.accessExpiresAt - SKEW_MS) {
      return current.accessToken;
    }

    if (this.now() >= current.refreshExpiresAt) {
      this.tokens.delete(key);
      await this.almacen?.borrar(key).catch(() => {});
      throw new SinSesionHaciendaError(key, `La sesión con Hacienda de "${key}" expiró. Iniciá sesión de nuevo.`);
    }

    const refreshed = await this.refreshOnce(key, current.refreshToken);
    return refreshed.accessToken;
  }

  /** Cierra sesión en el IDP y descarta los tokens, en memoria y en el respaldo. */
  async logout(key: string): Promise<void> {
    const current = await this.cargar(key);
    this.tokens.delete(key);
    await this.almacen?.borrar(key).catch(() => {});
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
      .then(async (tokens) => {
        this.tokens.set(key, tokens);
        // El refresh rota ambos tokens: sin respaldar, un reinicio dejaría en la
        // base un refresh token ya consumido.
        await this.respaldar(key, tokens);
        return tokens;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }
}
