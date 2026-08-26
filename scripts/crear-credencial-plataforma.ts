/**
 * Genera una credencial de plataforma (`platform_...`) para que Savegre
 * Center consuma `/plataforma/*`. No hay endpoint HTTP para esto (no habría
 * con qué autenticarse la primera vez) — se corre a mano, una vez por
 * credencial que se necesite, y el secreto se imprime UNA sola vez.
 *
 * Uso:
 *   npm run crear-credencial-plataforma -- "Savegre Center (prod)"
 *
 * Respeta PERSISTENCIA=memoria|prisma igual que el resto de la app — para
 * crear una credencial real, correr con PERSISTENCIA=prisma y DATABASE_URL
 * apuntando a la base real.
 */
import { credencialPlataformaService } from "../src/services/plataforma/index.js";

async function main() {
  const label = process.argv[2];
  if (!label) {
    console.error('Uso: npm run crear-credencial-plataforma -- "<label>"');
    process.exit(1);
  }

  const { credencial, secreto } = await credencialPlataformaService.crear({ label });

  console.log("Credencial de plataforma creada:");
  console.log(`  id:    ${credencial.id}`);
  console.log(`  label: ${credencial.label}`);
  console.log();
  console.log("Secreto (se muestra UNA sola vez — guárdalo ya en la config del backend de Center):");
  console.log(`  ${secreto}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
