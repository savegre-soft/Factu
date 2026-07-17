/**
 * Configuración efectiva del ambiente de Hacienda.
 *
 * El ambiente se elige con una sola variable, `HACIENDA_ENV` (`stag` | `prod`):
 * de ahí se derivan las URLs oficiales del IDP y de recepción, y el `client_id`.
 * Cada valor se puede sobrescribir con su variable explícita (`HACIENDA_IDP_URL`,
 * `HACIENDA_API_URL`, `HACIENDA_CLIENT_ID`) para casos especiales o si Hacienda
 * publica endpoints nuevos.
 *
 * ⚠️ Las URLs por defecto son las documentadas por Hacienda (realm `rut-stag`
 * para pruebas y `rut` para producción). Confírmalas contra la documentación
 * oficial vigente antes de emitir en producción.
 */
import { env } from "./env.js";

export type AmbienteHacienda = "stag" | "prod";

interface DefaultsAmbiente {
  idpTokenUrl: string;
  apiUrl: string;
  clientId: string;
}

const DEFAULTS: Record<AmbienteHacienda, DefaultsAmbiente> = {
  stag: {
    idpTokenUrl:
      "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token",
    apiUrl: "https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1",
    clientId: "api-stag",
  },
  prod: {
    idpTokenUrl:
      "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token",
    apiUrl: "https://api.comprobanteselectronicos.go.cr/recepcion/v1",
    clientId: "api-prod",
  },
};

export interface ConfigHacienda {
  ambiente: AmbienteHacienda;
  idpTokenUrl: string;
  apiUrl: string;
  clientId: string;
  /** true si la política de firma XAdES-EPES está configurada. */
  politicaFirma: boolean;
  /** true si el ambiente es prod Y la firma EPES está lista (apto para emitir en real). */
  listoParaProduccion: boolean;
}

/** Resuelve la configuración efectiva a partir del entorno. */
export function resolverConfigHacienda(): ConfigHacienda {
  const ambiente = env.HACIENDA_ENV;
  const def = DEFAULTS[ambiente];
  const politicaFirma = Boolean(env.HACIENDA_POLICY_URL && env.HACIENDA_POLICY_HASH);

  return {
    ambiente,
    idpTokenUrl: env.HACIENDA_IDP_URL ?? def.idpTokenUrl,
    apiUrl: env.HACIENDA_API_URL ?? def.apiUrl,
    clientId: env.HACIENDA_CLIENT_ID ?? def.clientId,
    politicaFirma,
    listoParaProduccion: ambiente === "prod" && politicaFirma,
  };
}

export const configHacienda = resolverConfigHacienda();
