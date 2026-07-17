/**
 * Envío de correo saliente (SMTP), por organización, desacoplado del resto de la
 * entrega.
 *
 * La configuración se resuelve por tenant: primero la guardada desde la UI
 * (cifrada en reposo); si no hay, cae a la global por variables de entorno
 * (`SMTP_*`). Así el operador puede tener un remitente por defecto y cada
 * organización el suyo. La interfaz `EmailSender` permite inyectar un doble en
 * los tests.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { abrirTexto } from "../../infra/crypto/secretBox.js";
import type { SmtpSalienteRepository } from "../../infra/repos/types.js";

export interface Adjunto {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface MensajeCorreo {
  to: string;
  subject: string;
  html: string;
  attachments?: Adjunto[];
}

export interface EmailSender {
  /** ¿Hay configuración para enviar (del tenant o global)? */
  disponible(tenantId: string): Promise<boolean>;
  enviar(tenantId: string, mensaje: MensajeCorreo): Promise<void>;
}

export interface SmtpResuelto {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  origen: "organización" | "global";
}

export class NodemailerSender implements EmailSender {
  constructor(
    private readonly repo: SmtpSalienteRepository,
    private readonly masterKey: string,
  ) {}

  /** Resuelve la configuración efectiva del tenant, o null si no hay ninguna. */
  async resolver(tenantId: string): Promise<SmtpResuelto | null> {
    const cfg = await this.repo.buscarPorTenant(tenantId);
    if (cfg && cfg.activo && cfg.host && cfg.remitente) {
      return {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.usuario ?? undefined,
        pass: cfg.passwordSellado ? abrirTexto(cfg.passwordSellado, this.masterKey) : undefined,
        from: cfg.remitente,
        origen: "organización",
      };
    }
    if (env.SMTP_HOST && env.SMTP_FROM) {
      return {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM,
        origen: "global",
      };
    }
    return null;
  }

  async disponible(tenantId: string): Promise<boolean> {
    return (await this.resolver(tenantId)) !== null;
  }

  async enviar(tenantId: string, mensaje: MensajeCorreo): Promise<void> {
    const cfg = await this.resolver(tenantId);
    if (!cfg) throw new Error("El correo de salida no está configurado");
    await construirTransport(cfg).sendMail({
      from: cfg.from,
      to: mensaje.to,
      subject: mensaje.subject,
      html: mensaje.html,
      attachments: mensaje.attachments,
    });
  }
}

/** Crea un transporter de nodemailer para una configuración resuelta. */
export function construirTransport(cfg: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}
