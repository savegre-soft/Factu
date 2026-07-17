/**
 * Punto de composición de la persistencia. Selecciona la implementación según
 * la variable PERSISTENCIA ("memoria" por defecto, "prisma" en producción).
 */
import { env } from "../../config/env.js";
import {
  EmisorRepositoryMemoria,
  ComprobanteRepositoryMemoria,
  TenantRepositoryMemoria,
  UsuarioRepositoryMemoria,
} from "./memory.js";
import type {
  EmisorRepository,
  ComprobanteRepository,
  TenantRepository,
  UsuarioRepository,
} from "./types.js";

let emisorRepo: EmisorRepository;
let comprobanteRepo: ComprobanteRepository;
let tenantRepo: TenantRepository;
let usuarioRepo: UsuarioRepository;

if (env.PERSISTENCIA === "prisma") {
  // Import perezoso para no exigir el cliente de Prisma cuando se usa memoria.
  const {
    EmisorRepositoryPrisma,
    ComprobanteRepositoryPrisma,
    TenantRepositoryPrisma,
    UsuarioRepositoryPrisma,
    prisma,
  } = await import("./prisma.js");
  emisorRepo = new EmisorRepositoryPrisma(prisma);
  comprobanteRepo = new ComprobanteRepositoryPrisma(prisma);
  tenantRepo = new TenantRepositoryPrisma(prisma);
  usuarioRepo = new UsuarioRepositoryPrisma(prisma);
} else {
  emisorRepo = new EmisorRepositoryMemoria();
  comprobanteRepo = new ComprobanteRepositoryMemoria();
  tenantRepo = new TenantRepositoryMemoria();
  usuarioRepo = new UsuarioRepositoryMemoria();
}

export const emisorRepository = emisorRepo;
export const comprobanteRepository = comprobanteRepo;
export const tenantRepository = tenantRepo;
export const usuarioRepository = usuarioRepo;

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
