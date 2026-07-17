/**
 * Punto de composición del módulo de autenticación: crea el cliente de Hacienda
 * y un TokenStore compartido a partir de la configuración de entorno.
 */
import { configHacienda } from "../../config/hacienda.js";
import { HaciendaAuthClient } from "./haciendaAuth.js";
import { TokenStore } from "./tokenStore.js";

if (configHacienda.ambiente === "prod" && !configHacienda.politicaFirma) {
  // eslint-disable-next-line no-console
  console.warn(
    "[hacienda] Ambiente PROD sin política de firma (HACIENDA_POLICY_URL/HASH): " +
      "la firma se generará como XAdES-BES y Hacienda la rechazará.",
  );
}

export const haciendaAuth = new HaciendaAuthClient({
  idpTokenUrl: configHacienda.idpTokenUrl,
  clientId: configHacienda.clientId,
});

export const tokenStore = new TokenStore(haciendaAuth);

export * from "./haciendaAuth.js";
export * from "./tokenStore.js";
