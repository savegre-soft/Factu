/**
 * Punto de composición del módulo de recepción: crea el cliente de Hacienda
 * a partir de la configuración de entorno.
 */
import { configHacienda } from "../../config/hacienda.js";
import { HaciendaReceptionClient } from "./reception.js";

export const receptionClient = new HaciendaReceptionClient({
  apiUrl: configHacienda.apiUrl,
});

export * from "./reception.js";
export * from "./envelope.js";
export * from "./emision.js";
