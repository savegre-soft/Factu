/**
 * Punto de composición de la persistencia. Selecciona la implementación según
 * la variable PERSISTENCIA ("memoria" por defecto, "prisma" en producción).
 */
import { env } from "../../config/env.js";
import {
  ApiKeyRepositoryMemoria,
  BorradorRepositoryMemoria,
  BuzonRepositoryMemoria,
  DocumentoRecibidoRepositoryMemoria,
  EmisorRepositoryMemoria,
  EnvioComprobanteRepositoryMemoria,
  ComprobanteRepositoryMemoria,
  MensajeRepositoryMemoria,
  SmtpSalienteRepositoryMemoria,
  WebhookRepositoryMemoria,
  WebhookEntregaRepositoryMemoria,
  AuditoriaRepositoryMemoria,
  LogRepositoryMemoria,
  TenantRepositoryMemoria,
  UsuarioRepositoryMemoria,
} from "./memory.js";
import type {
  ApiKeyRepository,
  BorradorRepository,
  BuzonRepository,
  DocumentoRecibidoRepository,
  EmisorRepository,
  EnvioComprobanteRepository,
  ComprobanteRepository,
  MensajeRepository,
  SmtpSalienteRepository,
  WebhookRepository,
  WebhookEntregaRepository,
  AuditoriaRepository,
  LogRepository,
  TenantRepository,
  UsuarioRepository,
} from "./types.js";

let emisorRepo: EmisorRepository;
let comprobanteRepo: ComprobanteRepository;
let tenantRepo: TenantRepository;
let usuarioRepo: UsuarioRepository;
let apiKeyRepo: ApiKeyRepository;
let recibidoRepo: DocumentoRecibidoRepository;
let buzonRepo: BuzonRepository;
let borradorRepo: BorradorRepository;
let envioRepo: EnvioComprobanteRepository;
let smtpRepo: SmtpSalienteRepository;
let mensajeRepo: MensajeRepository;
let webhookRepo: WebhookRepository;
let webhookEntregaRepo: WebhookEntregaRepository;
let auditoriaRepo: AuditoriaRepository;
let logRepo: LogRepository;

if (env.PERSISTENCIA === "prisma") {
  // Import perezoso para no exigir el cliente de Prisma cuando se usa memoria.
  const {
    ApiKeyRepositoryPrisma,
    BorradorRepositoryPrisma,
    BuzonRepositoryPrisma,
    DocumentoRecibidoRepositoryPrisma,
    EmisorRepositoryPrisma,
    EnvioComprobanteRepositoryPrisma,
    ComprobanteRepositoryPrisma,
    MensajeRepositoryPrisma,
    SmtpSalienteRepositoryPrisma,
    WebhookRepositoryPrisma,
    WebhookEntregaRepositoryPrisma,
    AuditoriaRepositoryPrisma,
    LogRepositoryPrisma,
    TenantRepositoryPrisma,
    UsuarioRepositoryPrisma,
    prisma,
  } = await import("./prisma.js");
  emisorRepo = new EmisorRepositoryPrisma(prisma);
  comprobanteRepo = new ComprobanteRepositoryPrisma(prisma);
  tenantRepo = new TenantRepositoryPrisma(prisma);
  usuarioRepo = new UsuarioRepositoryPrisma(prisma);
  apiKeyRepo = new ApiKeyRepositoryPrisma(prisma);
  recibidoRepo = new DocumentoRecibidoRepositoryPrisma(prisma);
  buzonRepo = new BuzonRepositoryPrisma(prisma);
  borradorRepo = new BorradorRepositoryPrisma(prisma);
  envioRepo = new EnvioComprobanteRepositoryPrisma(prisma);
  smtpRepo = new SmtpSalienteRepositoryPrisma(prisma);
  mensajeRepo = new MensajeRepositoryPrisma(prisma);
  webhookRepo = new WebhookRepositoryPrisma(prisma);
  webhookEntregaRepo = new WebhookEntregaRepositoryPrisma(prisma);
  auditoriaRepo = new AuditoriaRepositoryPrisma(prisma);
  logRepo = new LogRepositoryPrisma(prisma);
} else {
  emisorRepo = new EmisorRepositoryMemoria();
  comprobanteRepo = new ComprobanteRepositoryMemoria();
  tenantRepo = new TenantRepositoryMemoria();
  usuarioRepo = new UsuarioRepositoryMemoria();
  apiKeyRepo = new ApiKeyRepositoryMemoria();
  recibidoRepo = new DocumentoRecibidoRepositoryMemoria();
  buzonRepo = new BuzonRepositoryMemoria();
  borradorRepo = new BorradorRepositoryMemoria();
  envioRepo = new EnvioComprobanteRepositoryMemoria();
  smtpRepo = new SmtpSalienteRepositoryMemoria();
  mensajeRepo = new MensajeRepositoryMemoria();
  webhookRepo = new WebhookRepositoryMemoria();
  webhookEntregaRepo = new WebhookEntregaRepositoryMemoria();
  auditoriaRepo = new AuditoriaRepositoryMemoria();
  logRepo = new LogRepositoryMemoria();
}

export const emisorRepository = emisorRepo;
export const comprobanteRepository = comprobanteRepo;
export const tenantRepository = tenantRepo;
export const usuarioRepository = usuarioRepo;
export const apiKeyRepository = apiKeyRepo;
export const documentoRecibidoRepository = recibidoRepo;
export const buzonRepository = buzonRepo;
export const borradorRepository = borradorRepo;
export const envioComprobanteRepository = envioRepo;
export const smtpSalienteRepository = smtpRepo;
export const mensajeRepository = mensajeRepo;
export const webhookRepository = webhookRepo;
export const webhookEntregaRepository = webhookEntregaRepo;
export const auditoriaRepository = auditoriaRepo;
export const logRepository = logRepo;

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
