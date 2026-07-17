/**
 * Punto de composición del módulo de recepción: crea el cliente de Hacienda
 * a partir de la configuración de entorno.
 */
import { env } from "../../config/env.js";
import { HaciendaReceptionClient } from "./reception.js";

export const receptionClient = new HaciendaReceptionClient({
  apiUrl: env.HACIENDA_API_URL ?? "",
});

export * from "./reception.js";
export * from "./envelope.js";
export * from "./emision.js";
