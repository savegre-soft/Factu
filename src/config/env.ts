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
  /**
   * Cédula del proveedor del sistema de facturación (nodo ProveedorSistemas,
   * obligatorio en v4.4). Si se deja vacío, se usa la cédula del propio emisor.
   */
  PROVEEDOR_SISTEMAS: z.string().max(20).optional(),
  /**
   * Publicar la documentación interactiva (/docs y /swagger). Expone el mapa
   * completo de la API sin autenticación, así que en producción viene apagada.
   */
  DOCS_PUBLICAS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),

  /** Backend de persistencia: "memoria" (por defecto) o "prisma". */
  PERSISTENCIA: z.enum(["memoria", "prisma"]).default("memoria"),
  /** Revisar automáticamente los buzones de correo en busca de XML. */
  CORREO_POLL_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Cada cuántos minutos revisar los buzones (mínimo 1). */
  CORREO_POLL_MINUTOS: z.coerce.number().int().min(1).default(5),

  /**
   * Re-consultar en Hacienda los comprobantes que quedaron sin veredicto. Sin
   * esto, un comprobante cuyo estado tarde más que el polling de la emisión
   * (~15 s) se queda en "recibido" para siempre.
   */
  RECONSULTA_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RECONSULTA_MINUTOS: z.coerce.number().int().min(1).default(10),

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

  // --- Notificaciones (canales de comunicación: SMS, WhatsApp, Slack, Teams) ---
  NOTIF_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  NOTIF_MAX_INTENTOS: z.coerce.number().int().min(1).default(5),
  NOTIF_POLL_MINUTOS: z.coerce.number().int().min(1).default(2),

  // --- URLs públicas (para OAuth y enlaces por correo) ---
  /** Base del frontend, ej. https://app.miplataforma.cr (a donde vuelve el OAuth). */
  APP_URL: z.string().url().default("http://localhost:5173"),
  /** Base pública de esta API, ej. https://api.miplataforma.cr (redirect_uri del OAuth). */
  API_PUBLIC_URL: z.string().url().default("http://localhost:3000"),

  // --- OAuth: iniciar sesión / registrarse con Google o Microsoft ---
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  /** Tenant de Azure AD: "common" (cualquiera), "organizations", o un GUID. */
  MICROSOFT_OAUTH_TENANT: z.string().default("common"),

  // --- SMTP PROPIO DE LA PLATAFORMA (correos de la cuenta: código de reseteo) ---
  // OJO: distinto de SMTP_* (que la API usa para entregar comprobantes a los
  // clientes del tenant). Este es el remitente de la plataforma para su gente.
  PLATAFORMA_SMTP_HOST: z.string().optional(),
  PLATAFORMA_SMTP_PORT: z.coerce.number().int().default(587),
  PLATAFORMA_SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  PLATAFORMA_SMTP_USER: z.string().optional(),
  PLATAFORMA_SMTP_PASS: z.string().optional(),
  /** Remitente, ej. `Factu <no-reply@miplataforma.cr>`. */
  PLATAFORMA_SMTP_FROM: z.string().optional(),
  /** Minutos de vigencia del código de reseteo de contraseña. */
  PASSWORD_RESET_TTL_MINUTOS: z.coerce.number().int().min(1).default(15),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
