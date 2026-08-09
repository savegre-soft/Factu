/**
 * Backfill de `total` y `moneda` en los comprobantes ya emitidos.
 *
 * Esas columnas se empezaron a guardar al emitir; los comprobantes anteriores
 * las tienen en NULL y quedarían fuera de los importes del panel. Aquí se leen
 * del XML firmado que ya está en la base, una sola vez.
 *
 * Uso (dentro del contenedor):
 *   docker compose exec app node scripts/rellenar-totales.mjs [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const simulacion = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

/** Extrae el texto de la primera etiqueta con ese nombre local. */
function etiqueta(xml, nombre) {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`));
  return m ? m[1].trim() : null;
}

const pendientes = await prisma.comprobante.findMany({
  where: { total: null, xmlFirmado: { not: null } },
  select: { clave: true, xmlFirmado: true },
});

console.log(`${pendientes.length} comprobante(s) sin importe.`);

let rellenados = 0;
let sinDato = 0;

for (const c of pendientes) {
  const total = etiqueta(c.xmlFirmado, "TotalComprobante");
  const moneda = etiqueta(c.xmlFirmado, "CodigoMoneda") ?? "CRC";
  if (total === null || Number.isNaN(Number(total))) {
    sinDato++;
    console.warn(`· ${c.clave}: el XML no trae TotalComprobante legible.`);
    continue;
  }
  if (!simulacion) {
    await prisma.comprobante.update({
      where: { clave: c.clave },
      data: { total: Number(total), moneda },
    });
  }
  rellenados++;
  console.log(`${simulacion ? "· [simulación]" : "✓"} ${c.clave} → ${total} ${moneda}`);
}

await prisma.$disconnect();
console.log(`\n${simulacion ? "Simulación" : "Backfill"}: ${rellenados} rellenado(s), ${sinDato} sin dato.`);
