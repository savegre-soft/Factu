/**
 * Punto de composición del módulo de autenticación: crea el cliente de Hacienda
 * y un TokenStore compartido a partir de la configuración de entorno.
 */
import { env } from "../../config/env.js";
import { HaciendaAuthClient } from "./haciendaAuth.js";
import { TokenStore } from "./tokenStore.js";

if (!env.HACIENDA_IDP_URL) {
  // No abortamos el arranque: permite levantar el server sin credenciales aún,
  // pero cualquier intento de login fallará con un mensaje claro.
  // eslint-disable-next-line no-console
  console.warn("[auth] HACIENDA_IDP_URL no está configurada; el login no funcionará.");
}

export const haciendaAuth = new HaciendaAuthClient({
  idpTokenUrl: env.HACIENDA_IDP_URL ?? "",
  clientId: env.HACIENDA_CLIENT_ID ?? (env.HACIENDA_ENV === "prod" ? "api-prod" : "api-stag"),
});

export const tokenStore = new TokenStore(haciendaAuth);

export * from "./haciendaAuth.js";
export * from "./tokenStore.js";
