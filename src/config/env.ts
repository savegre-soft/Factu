import { z } from "zod";

/** Valida y expone las variables de entorno de forma tipada. */
const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  HACIENDA_ENV: z.enum(["stag", "prod"]).default("stag"),
  HACIENDA_IDP_URL: z.string().url().optional(),
  HACIENDA_API_URL: z.string().url().optional(),
  HACIENDA_CLIENT_ID: z.string().optional(),
  /** Llave maestra para cifrar certificados en reposo. En producción es OBLIGATORIA. */
  FACTU_MASTER_KEY: z.string().optional(),
  /** Secreto para firmar los JWT de sesión de usuario. En producción es OBLIGATORIO. */
  JWT_SECRET: z.string().optional(),
  /** Vigencia del token de usuario (formato de `jsonwebtoken`, ej. "8h", "7d"). */
  JWT_EXPIRES_IN: z.string().default("8h"),
  /** URL de la política de firma de Hacienda (XAdES-EPES). */
  HACIENDA_POLICY_URL: z.string().url().optional(),
  /** Digest SHA-256 (base64) del documento de la política de firma. */
  HACIENDA_POLICY_HASH: z.string().optional(),
  /** Backend de persistencia: "memoria" (por defecto) o "prisma". */
  PERSISTENCIA: z.enum(["memoria", "prisma"]).default("memoria"),
  /** Revisar automáticamente los buzones de correo en busca de XML. */
  CORREO_POLL_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Cada cuántos minutos revisar los buzones (mínimo 1). */
  CORREO_POLL_MINUTOS: z.coerce.number().int().min(1).default(5),

  // --- Entrega de comprobantes al cliente (correo saliente SMTP) ---
  /** Enviar el comprobante al cliente por correo tras la aceptación. */
  ENTREGA_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Máximo de intentos de envío por destinatario. */
  ENTREGA_MAX_INTENTOS: z.coerce.number().int().min(1).default(3),
  /** Cada cuántos minutos reintentar los envíos fallidos/pendientes. */
  ENTREGA_POLL_MINUTOS: z.coerce.number().int().min(1).default(5),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  /** TLS directo (true, puerto 465) o STARTTLS (false, puerto 587). */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** Remitente, ej. `Mi Empresa <facturas@empresa.cr>`. */
  SMTP_FROM: z.string().optional(),

  // --- Webhooks salientes (integraciones con sistemas externos) ---
  WEBHOOK_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  WEBHOOK_MAX_INTENTOS: z.coerce.number().int().min(1).default(5),
  WEBHOOK_POLL_MINUTOS: z.coerce.number().int().min(1).default(5),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
