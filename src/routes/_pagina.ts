/**
 * Ventana de paginación común a los listados.
 *
 * Todos los listados del tenant devuelven `{ total, limite, desplazamiento,
 * items }`. Con un tope por defecto ninguna consulta puede arrastrar el
 * histórico completo por descuido.
 */
import { z } from "zod";

export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 200;

export const paginaSchema = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_MAXIMO).default(LIMITE_POR_DEFECTO),
  desplazamiento: z.coerce.number().int().min(0).default(0),
});

/** Descriptor OpenAPI de los mismos parámetros, para la documentación. */
export const paginaQuerystring = {
  type: "object",
  properties: {
    limite: {
      type: "integer",
      minimum: 1,
      maximum: LIMITE_MAXIMO,
      default: LIMITE_POR_DEFECTO,
    },
    desplazamiento: { type: "integer", minimum: 0, default: 0 },
  },
} as const;
