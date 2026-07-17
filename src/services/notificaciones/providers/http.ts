/** POST con timeout, compartido por los proveedores. */
export async function postConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, method: "POST", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Un fallo de red/aborto se considera reintentable. */
export function errorRed(err: unknown) {
  return { ok: false as const, error: (err as Error).message, reintentable: true };
}

/** Los 5xx se reintentan; los 4xx (config/destino inválido) no. */
export function esReintentable(status: number): boolean {
  return status >= 500;
}
