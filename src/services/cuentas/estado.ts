/**
 * `state` del flujo OAuth: un token corto firmado (HMAC) que viaja hasta el
 * proveedor y vuelve en el callback. Protege contra CSRF y transporta la
 * intención (login / vincular) y, al vincular, el usuario actual. Sin estado en
 * servidor: la firma + el vencimiento bastan.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export interface EstadoOAuth {
  intent: "login" | "link";
  /** Usuario que vincula (solo intent="link"). */
  userId?: string;
  /** Vencimiento (epoch ms). */
  exp: number;
}

/**
 * Mismo secreto que firma los JWT. En producción es obligatorio: firmar el
 * `state` del OAuth con un valor conocido permitiría falsificar callbacks.
 */
function secreto(): string {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET es obligatorio en producción");
  }
  return "dev-jwt-secret-inseguro-solo-desarrollo";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function firmarEstado(datos: Omit<EstadoOAuth, "exp">, ttlMs = 10 * 60_000): string {
  const payload: EstadoOAuth = { ...datos, exp: Date.now() + ttlMs };
  const cuerpo = b64url(Buffer.from(JSON.stringify(payload)));
  const firma = b64url(createHmac("sha256", secreto()).update(cuerpo).digest());
  return `${cuerpo}.${firma}`;
}

export function verificarEstado(state: string): EstadoOAuth | null {
  const [cuerpo, firma] = state.split(".");
  if (!cuerpo || !firma) return null;
  const esperada = b64url(createHmac("sha256", secreto()).update(cuerpo).digest());
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as EstadoOAuth;
    if (typeof datos.exp !== "number" || datos.exp < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}
