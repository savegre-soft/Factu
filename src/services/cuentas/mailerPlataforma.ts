/**
 * Correo de la PLATAFORMA hacia sus propios usuarios (p. ej. el código para
 * restablecer la contraseña). Usa el SMTP `PLATAFORMA_SMTP_*`, distinto del
 * `SMTP_*` con el que la API entrega comprobantes a los clientes de cada tenant.
 */
import { env } from "../../config/env.js";
import { construirTransport } from "../entrega/emailSender.js";

export interface CorreoPlataforma {
  to: string;
  subject: string;
  html: string;
}

export interface MailerPlataforma {
  disponible(): boolean;
  enviar(mensaje: CorreoPlataforma): Promise<void>;
}

export class NodemailerPlataforma implements MailerPlataforma {
  disponible(): boolean {
    return Boolean(env.PLATAFORMA_SMTP_HOST && env.PLATAFORMA_SMTP_FROM);
  }

  async enviar(mensaje: CorreoPlataforma): Promise<void> {
    if (!this.disponible()) throw new Error("El SMTP de la plataforma no está configurado");
    const transport = construirTransport({
      host: env.PLATAFORMA_SMTP_HOST!,
      port: env.PLATAFORMA_SMTP_PORT,
      secure: env.PLATAFORMA_SMTP_SECURE,
      user: env.PLATAFORMA_SMTP_USER,
      pass: env.PLATAFORMA_SMTP_PASS,
    });
    await transport.sendMail({
      from: env.PLATAFORMA_SMTP_FROM!,
      to: mensaje.to,
      subject: mensaje.subject,
      html: mensaje.html,
    });
  }
}
