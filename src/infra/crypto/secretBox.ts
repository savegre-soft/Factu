/**
 * Cifrado autenticado de secretos en reposo (AES-256-GCM).
 *
 * Se usa para guardar el certificado .p12 del emisor y su clave sin dejarlos en
 * texto plano en la base de datos. La llave maestra viene de la configuración
 * (variable de entorno FACTU_MASTER_KEY) y de ella se deriva una clave por
 * secreto con scrypt + salt aleatorio.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITMO = "aes-256-gcm";
const LARGO_SALT = 16;
const LARGO_IV = 12;
const LARGO_CLAVE = 32;

/** Secreto cifrado, con todos los componentes en base64. Serializable a JSON. */
export interface SecretoSellado {
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

function derivarClave(masterKey: string, salt: Buffer): Buffer {
  if (!masterKey) throw new Error("Falta la llave maestra (FACTU_MASTER_KEY)");
  return scryptSync(masterKey, salt, LARGO_CLAVE);
}

/** Cifra un secreto (texto o binario) con la llave maestra. */
export function sellar(secreto: Buffer | string, masterKey: string): SecretoSellado {
  const salt = randomBytes(LARGO_SALT);
  const iv = randomBytes(LARGO_IV);
  const clave = derivarClave(masterKey, salt);
  const cipher = createCipheriv(ALGORITMO, clave, iv);

  const datos = typeof secreto === "string" ? Buffer.from(secreto, "utf8") : secreto;
  const ciphertext = Buffer.concat([cipher.update(datos), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** Descifra un secreto y devuelve el binario original. Lanza si la llave o el dato no calzan. */
export function abrir(sellado: SecretoSellado, masterKey: string): Buffer {
  const salt = Buffer.from(sellado.salt, "base64");
  const clave = derivarClave(masterKey, salt);
  const decipher = createDecipheriv(ALGORITMO, clave, Buffer.from(sellado.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sellado.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sellado.ciphertext, "base64")),
    decipher.final(),
  ]);
}

/** Descifra un secreto y lo devuelve como string UTF-8. */
export function abrirTexto(sellado: SecretoSellado, masterKey: string): string {
  return abrir(sellado, masterKey).toString("utf8");
}
