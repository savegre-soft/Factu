/**
 * Configuración del correo de salida (SMTP) de una organización.
 *
 * La contraseña se guarda cifrada (AES-256-GCM) con la llave maestra, igual que
 * los certificados y el buzón entrante. La vista pública nunca la incluye.
 */
import { sellar } from "../../infra/crypto/secretBox.js";
import { construirTransport, type NodemailerSender } from "./emailSender.js";
import type { SmtpSalienteRecord, SmtpSalienteRepository } from "../../infra/repos/types.js";

export interface DatosSmtp {
  host: string;
  port: number;
  secure: boolean;
  usuario?: string | null;
  /** Contraseña en claro (solo al guardar). Si se omite, se conserva la actual. */
  password?: string | null;
  remitente: string;
  activo: boolean;
}

/** Vista pública (sin la contraseña; solo si hay una guardada). */
export type SmtpPublico = Omit<SmtpSalienteRecord, "passwordSellado"> & { tienePassword: boolean };

function publico(r: SmtpSalienteRecord): SmtpPublico {
  const { passwordSellado, ...resto } = r;
  return { ...resto, tienePassword: passwordSellado !== null };
}

export class SmtpConfigService {
  constructor(
    private readonly repo: SmtpSalienteRepository,
    private readonly masterKey: string,
    private readonly sender: NodemailerSender,
  ) {}

  async obtener(tenantId: string): Promise<SmtpPublico | null> {
    const r = await this.repo.buscarPorTenant(tenantId);
    return r ? publico(r) : null;
  }

  /** Resuelve la config efectiva (tenant o global) para informar en la UI. */
  async efectiva(tenantId: string) {
    const r = await this.sender.resolver(tenantId);
    return r ? { origen: r.origen, remitente: r.from, host: r.host } : null;
  }

  async guardar(tenantId: string, d: DatosSmtp): Promise<SmtpPublico> {
    // Conserva la contraseña existente si no se reingresa.
    const existente = await this.repo.buscarPorTenant(tenantId);
    const passwordSellado =
      d.password != null && d.password !== ""
        ? sellar(d.password, this.masterKey)
        : (existente?.passwordSellado ?? null);

    const record = await this.repo.upsert({
      tenantId,
      host: d.host,
      port: d.port,
      secure: d.secure,
      usuario: d.usuario || null,
      passwordSellado,
      remitente: d.remitente,
      activo: d.activo,
    });
    return publico(record);
  }

  async eliminar(tenantId: string): Promise<void> {
    await this.repo.eliminar(tenantId);
  }

  /** Prueba la conexión SMTP con la config dada (verify), sin enviar. */
  async probar(config: {
    host: string;
    port: number;
    secure: boolean;
    usuario?: string | null;
    password?: string | null;
  }): Promise<void> {
    const transport = construirTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.usuario || undefined,
      pass: config.password || undefined,
    });
    await transport.verify();
  }
}
