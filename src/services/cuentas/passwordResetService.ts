/**
 * Reseteo de contraseña con código de un solo uso enviado por el SMTP de la
 * plataforma. Nunca revela si un correo existe (no enumeración).
 */
import { randomUUID, randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "../usuarios/password.js";
import type {
  PasswordResetRepository,
  UsuarioRepository,
} from "../../infra/repos/types.js";
import type { MailerPlataforma } from "./mailerPlataforma.js";

function cuerpoCorreo(codigo: string, minutos: number): string {
  return `
    <div style="font-family:system-ui,sans-serif;max-width:480px">
      <h2>Restablecer tu contraseña</h2>
      <p>Usa este código para restablecer la contraseña de tu cuenta:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px">${codigo}</p>
      <p>Vence en ${minutos} minutos. Si no lo solicitaste, ignora este correo.</p>
    </div>`;
}

export class PasswordResetService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly resets: PasswordResetRepository,
    private readonly mailer: MailerPlataforma,
    private readonly ttlMinutos: number,
    private readonly log: (nivel: "info" | "warn", msg: string) => void = () => {},
  ) {}

  /**
   * Genera y envía un código. Devuelve siempre sin error aunque el correo no
   * exista (para no filtrar qué correos están registrados).
   */
  async solicitar(email: string): Promise<void> {
    const usuario = await this.usuarios.buscarPorEmail(email.toLowerCase());
    if (!usuario) return;

    await this.resets.invalidarPorUsuario(usuario.id);
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.resets.crear({
      id: randomUUID(),
      userId: usuario.id,
      codigoHash: hashPassword(codigo),
      expiresAt: new Date(Date.now() + this.ttlMinutos * 60_000),
    });

    if (!this.mailer.disponible()) {
      // Sin SMTP de plataforma no se puede enviar: se registra para no perder el
      // flujo en desarrollo (el operador debe configurar PLATAFORMA_SMTP_*).
      this.log("warn", `[reset] SMTP de plataforma sin configurar; código de ${email}: ${codigo}`);
      return;
    }
    await this.mailer
      .enviar({
        to: usuario.email,
        subject: "Código para restablecer tu contraseña",
        html: cuerpoCorreo(codigo, this.ttlMinutos),
      })
      .catch((err) => this.log("warn", `[reset] no se pudo enviar el correo: ${(err as Error).message}`));
  }

  /**
   * Verifica el código y fija la nueva contraseña. Lanza un error genérico si el
   * código es inválido o venció.
   */
  async resetear(email: string, codigo: string, nueva: string): Promise<void> {
    const invalido = new Error("El código es inválido o venció. Solicita uno nuevo.");
    const usuario = await this.usuarios.buscarPorEmail(email.toLowerCase());
    if (!usuario) throw invalido;

    const reset = await this.resets.buscarVigentePorUsuario(usuario.id);
    if (!reset || !verifyPassword(codigo, reset.codigoHash)) throw invalido;

    await this.usuarios.actualizar(usuario.id, { passwordHash: hashPassword(nueva) });
    await this.resets.marcarUsado(reset.id);
  }
}
