/**
 * Rotación de FACTU_MASTER_KEY.
 *
 * Vuelve a cifrar TODOS los secretos en reposo (certificados .p12 y sus claves,
 * contraseñas de buzones y SMTP, secretos de webhooks y configuraciones de
 * canales) pasándolos de la llave vieja a la nueva. Sin esto, cambiar la llave
 * deja los datos ilegibles para siempre.
 *
 * Uso (dentro del contenedor, que ya tiene el cliente Prisma generado):
 *
 *   LLAVE_VIEJA="..." LLAVE_NUEVA="..." node scripts/rotar-llave-maestra.mjs
 *
 * Añade --dry-run para ver qué tocaría sin escribir nada. La app debe estar
 * detenida o, al menos, no escribir secretos mientras corre.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ALGORITMO = "aes-256-gcm";
const LARGO_SALT = 16;
const LARGO_IV = 12;
const LARGO_CLAVE = 32;

const derivar = (llave, salt) => scryptSync(llave, salt, LARGO_CLAVE);

function abrir(sellado, llave) {
  const salt = Buffer.from(sellado.salt, "base64");
  const decipher = createDecipheriv(ALGORITMO, derivar(llave, salt), Buffer.from(sellado.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sellado.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sellado.ciphertext, "base64")), decipher.final()]);
}

function sellar(datos, llave) {
  const salt = randomBytes(LARGO_SALT);
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, derivar(llave, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(datos), cipher.final()]);
  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

/** Columnas cifradas: tabla del cliente Prisma, campo id y columnas selladas. */
const OBJETIVOS = [
  { modelo: "emisor", id: "cedula", columnas: ["certP12", "certPassword"] },
  { modelo: "buzon", id: "id", columnas: ["passwordSellado"] },
  { modelo: "smtpSaliente", id: "id", columnas: ["passwordSellado"] },
  { modelo: "webhook", id: "id", columnas: ["secretSellado"] },
  { modelo: "notificationChannel", id: "id", columnas: ["configSellado"] },
];

const vieja = process.env.LLAVE_VIEJA;
const nueva = process.env.LLAVE_NUEVA;
const simulacion = process.argv.includes("--dry-run");

if (!vieja || !nueva) {
  console.error("Faltan LLAVE_VIEJA y/o LLAVE_NUEVA en el entorno.");
  process.exit(1);
}
if (vieja === nueva) {
  console.error("Las llaves son iguales: no hay nada que rotar.");
  process.exit(1);
}

const prisma = new PrismaClient();
let rotados = 0;
let fallidos = 0;

for (const { modelo, id, columnas } of OBJETIVOS) {
  const tabla = prisma[modelo];
  if (!tabla) {
    console.warn(`· ${modelo}: no existe en el cliente Prisma, se omite.`);
    continue;
  }
  const filas = await tabla.findMany();
  for (const fila of filas) {
    const cambios = {};
    for (const col of columnas) {
      const crudo = fila[col];
      if (!crudo) continue;
      try {
        cambios[col] = JSON.stringify(sellar(abrir(JSON.parse(crudo), vieja), nueva));
      } catch (err) {
        fallidos++;
        console.error(
          `✗ ${modelo}.${col} de "${fila[id]}": no se pudo descifrar con la llave vieja (${err.message}).`,
        );
      }
    }
    if (Object.keys(cambios).length === 0) continue;
    if (simulacion) {
      console.log(`· [simulación] ${modelo} "${fila[id]}" → ${Object.keys(cambios).join(", ")}`);
    } else {
      await tabla.update({ where: { [id]: fila[id] }, data: cambios });
      console.log(`✓ ${modelo} "${fila[id]}" → ${Object.keys(cambios).join(", ")}`);
    }
    rotados++;
  }
}

await prisma.$disconnect();

console.log(`\n${simulacion ? "Simulación" : "Rotación"}: ${rotados} registro(s), ${fallidos} fallo(s).`);
if (fallidos > 0) {
  console.error("Hubo fallos: NO cambies la llave todavía o esos secretos quedarán ilegibles.");
  process.exit(1);
}
