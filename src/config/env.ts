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
  /** URL de la política de firma de Hacienda (XAdES-EPES). */
  HACIENDA_POLICY_URL: z.string().url().optional(),
  /** Digest SHA-256 (base64) del documento de la política de firma. */
  HACIENDA_POLICY_HASH: z.string().optional(),
  /** Backend de persistencia: "memoria" (por defecto) o "prisma". */
  PERSISTENCIA: z.enum(["memoria", "prisma"]).default("memoria"),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
