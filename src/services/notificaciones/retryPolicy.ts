/**
 * Reintentos con backoff exponencial + jitter.
 *
 * Espera ≈ base · 2^(intento-1), con tope y jitter (50%–100%) para evitar
 * "tormentas" de reintentos sincronizados. Devuelve null cuando se agotaron.
 */
const BASE_MS = 60_000; // 1 minuto
const CAP_MS = 60 * 60_000; // 1 hora

/**
 * @param intento  número del intento recién fallado (1-based)
 * @param maxIntentos  máximo de intentos permitido
 * @returns milisegundos hasta el próximo reintento, o null si se agotó
 */
export function siguienteEspera(intento: number, maxIntentos: number): number | null {
  if (intento >= maxIntentos) return null;
  const exp = Math.min(BASE_MS * 2 ** (intento - 1), CAP_MS);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.round(exp * jitter);
}
