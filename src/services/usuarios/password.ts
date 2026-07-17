/**
 * Hashing de contraseñas con scrypt (módulo nativo de Node, sin dependencias).
 *
 * Formato almacenado: `scrypt$<salt-base64>$<hash-base64>`.
 * La verificación usa comparación en tiempo constante.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const LARGO_SALT = 16;
const LARGO_HASH = 64;

/** Genera el hash de una contraseña. */
export function hashPassword(password: string): string {
  const salt = randomBytes(LARGO_SALT);
  const hash = scryptSync(password, salt, LARGO_HASH);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Verifica una contraseña contra su hash almacenado. */
export function verifyPassword(password: string, almacenado: string): boolean {
  const partes = almacenado.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const salt = Buffer.from(partes[1]!, "base64");
  const hashEsperado = Buffer.from(partes[2]!, "base64");
  const hashActual = scryptSync(password, salt, hashEsperado.length);
  return (
    hashActual.length === hashEsperado.length && timingSafeEqual(hashActual, hashEsperado)
  );
}
