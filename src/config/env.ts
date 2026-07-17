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
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
