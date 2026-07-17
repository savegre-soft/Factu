/**
 * Composición del servicio de firma.
 *
 * Expone `firmar`, que aplica la política de Hacienda (XAdES-EPES) cuando está
 * configurada en el entorno. Si no hay política, cae a XAdES-BES (útil para
 * pruebas locales sin los datos oficiales de la política).
 */
import { env } from "../../config/env.js";
import { firmarXadesBes, type PoliticaFirma } from "./xadesSigner.js";
import type { Certificado } from "./certificado.js";

/**
 * Política de firma de Hacienda tomada del entorno.
 *
 * ⚠️ Para producción hay que configurar HACIENDA_POLICY_URL y HACIENDA_POLICY_HASH
 * con la URL del documento de la resolución vigente (v4.4) y su digest SHA-256 en
 * base64. Sin estos datos oficiales la firma se genera como XAdES-BES.
 */
export function politicaHacienda(): PoliticaFirma | undefined {
  if (env.HACIENDA_POLICY_URL && env.HACIENDA_POLICY_HASH) {
    return {
      url: env.HACIENDA_POLICY_URL,
      digestBase64: env.HACIENDA_POLICY_HASH,
      description: "Política de firma para comprobantes electrónicos de Costa Rica",
    };
  }
  return undefined;
}

/** Firma un XML con el certificado dado, aplicando la política si está configurada. */
export function firmar(xml: string, certificado: Certificado): Promise<string> {
  return firmarXadesBes(xml, certificado, {
    productionPlace: { country: "Costa Rica" },
    policy: politicaHacienda(),
  });
}

export * from "./xadesSigner.js";
export * from "./certificado.js";
