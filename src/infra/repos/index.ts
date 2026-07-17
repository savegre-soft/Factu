/**
 * Punto de composición de la persistencia. Selecciona la implementación según
 * la variable PERSISTENCIA ("memoria" por defecto, "prisma" en producción).
 */
import { env } from "../../config/env.js";
import { EmisorRepositoryMemoria, ComprobanteRepositoryMemoria } from "./memory.js";
import type { EmisorRepository, ComprobanteRepository } from "./types.js";

let emisorRepo: EmisorRepository;
let comprobanteRepo: ComprobanteRepository;

if (env.PERSISTENCIA === "prisma") {
  // Import perezoso para no exigir el cliente de Prisma cuando se usa memoria.
  const { EmisorRepositoryPrisma, ComprobanteRepositoryPrisma, prisma } = await import(
    "./prisma.js"
  );
  emisorRepo = new EmisorRepositoryPrisma(prisma);
  comprobanteRepo = new ComprobanteRepositoryPrisma(prisma);
} else {
  emisorRepo = new EmisorRepositoryMemoria();
  comprobanteRepo = new ComprobanteRepositoryMemoria();
}

export const emisorRepository = emisorRepo;
export const comprobanteRepository = comprobanteRepo;

/** Llave maestra efectiva (con aviso si no se configuró en desarrollo). */
export function masterKey(): string {
  if (env.FACTU_MASTER_KEY) return env.FACTU_MASTER_KEY;
  if (env.NODE_ENV === "production") {
    throw new Error("FACTU_MASTER_KEY es obligatoria en producción");
  }
  // eslint-disable-next-line no-console
  console.warn("[persistencia] FACTU_MASTER_KEY no configurada; usando llave de desarrollo.");
  return "dev-master-key-inseguro-solo-desarrollo";
}
