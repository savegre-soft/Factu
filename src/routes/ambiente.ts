/**
 * Ambiente de Hacienda activo (solo lectura). Permite que la webapp muestre si
 * está en PRUEBAS o PRODUCCIÓN y avise de configuraciones incompletas.
 *
 * No expone secretos: solo el ambiente, las URLs públicas y banderas de estado.
 */
import type { FastifyInstance } from "fastify";
import { configHacienda } from "../config/hacienda.js";
import { ambienteSchema } from "../plugins/schemas.js";

export async function ambienteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ambiente", { schema: ambienteSchema }, async () => ({
    ambiente: configHacienda.ambiente,
    idpUrl: configHacienda.idpTokenUrl,
    apiUrl: configHacienda.apiUrl,
    clientId: configHacienda.clientId,
    politicaFirma: configHacienda.politicaFirma,
    listoParaProduccion: configHacienda.listoParaProduccion,
  }));
}
