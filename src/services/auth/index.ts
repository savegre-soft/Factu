/**
 * Punto de composición del módulo de autenticación: crea el cliente de Hacienda
 * y un TokenStore compartido a partir de la configuración de entorno.
 */
import { configHacienda } from "../../config/hacienda.js";
import { masterKey, sesionHaciendaRepository } from "../../infra/repos/index.js";
import { HaciendaAuthClient } from "./haciendaAuth.js";
import { AlmacenSesionesCifrado } from "./almacenSesiones.js";
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

/**
 * Los tokens se respaldan cifrados en la base: sobreviven a un reinicio y sirven
 * si mañana hay más de una instancia. El Map del TokenStore queda como caché.
 */
export const almacenSesiones = new AlmacenSesionesCifrado(sesionHaciendaRepository, masterKey());

export const tokenStore = new TokenStore(haciendaAuth, Date.now, almacenSesiones);

export * from "./haciendaAuth.js";
export * from "./almacenSesiones.js";
export * from "./tokenStore.js";
