/**
 * Firma XAdES-BES de comprobantes electrónicos (hito 4).
 *
 * Hacienda exige que el XML vaya firmado con una firma XAdES enveloped usando
 * el certificado del emisor. Este módulo produce esa firma con xadesjs y permite
 * verificarla.
 *
 * ⚠️ El perfil exacto que exige Hacienda es XAdES-EPES: además de lo que aquí se
 * genera (SigningTime + SigningCertificate), incluye una SignaturePolicyIdentifier
 * con el OID/URL de la política de resolución vigente. Cuando se disponga de ese
 * dato oficial se pasa en `opts.policy` (xadesjs lo soporta vía `ApplySignaturePolicyIdentifier`).
 */
import * as XAdES from "xadesjs";
import { Crypto } from "@peculiar/webcrypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import * as xpath from "xpath";
import { setNodeDependencies } from "xml-core";
import { pemToDerBase64, type Certificado } from "./certificado.js";

const DSIG_NS = "http://www.w3.org/2000/09/xmldsig#";

// Registro único de las dependencias de DOM (xml-core) y del motor cripto (xadesjs).
let engineReady = false;
function ensureEngine(): void {
  if (engineReady) return;
  setNodeDependencies({ DOMParser, XMLSerializer, xpath });
  XAdES.Application.setEngine("NodeJS", new Crypto());
  engineReady = true;
}

const crypto = new Crypto();

const SIGN_ALG: RsaHashedImportParams & { name: string } = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
};

export interface PoliticaFirma {
  /** URL identificadora de la política (SigPolicyId). */
  url: string;
  /** Digest SHA-256 del documento de la política, en base64 (SigPolicyHash). */
  digestBase64: string;
  description?: string;
}

export interface FirmaOpts {
  /** Lugar de producción (opcional; aparece en las propiedades firmadas). */
  productionPlace?: { country?: string; state?: string; city?: string; code?: string };
  /** Rol declarado del firmante (opcional). */
  signerRole?: string[];
  /**
   * Política de firma (XAdES-EPES). Si se proporciona, la firma pasa de BES a
   * EPES incluyendo la SignaturePolicyIdentifier que exige Hacienda.
   */
  policy?: PoliticaFirma;
}

/** Importa la llave privada PEM (PKCS#8) como CryptoKey para firmar. */
async function importarLlave(privateKeyPem: string): Promise<CryptoKey> {
  const der = Buffer.from(pemToDerBase64(privateKeyPem), "base64");
  return crypto.subtle.importKey("pkcs8", der, SIGN_ALG, false, ["sign"]);
}

/** Firma un XML (string) con XAdES-BES y devuelve el XML firmado (string). */
export async function firmarXadesBes(
  xml: string,
  certificado: Certificado,
  opts: FirmaOpts = {},
): Promise<string> {
  ensureEngine();
  const key = await importarLlave(certificado.privateKeyPem);
  const doc = XAdES.Parse(xml);

  const signed = new XAdES.SignedXml();
  await signed.Sign(SIGN_ALG, key, doc, {
    references: [{ id: "reference-0", uri: "", hash: "SHA-256", transforms: ["enveloped", "c14n"] }],
    x509: [certificado.certificateDerBase64],
    signingCertificate: certificado.certificateDerBase64,
    productionPlace: opts.productionPlace,
    signerRole: opts.signerRole ? { claimed: opts.signerRole } : undefined,
    policy: opts.policy
      ? {
          hash: "SHA-256",
          identifier: {
            qualifier: "OIDAsURI",
            value: opts.policy.url,
            description: opts.policy.description,
          },
          // Digest del documento de la política (no lo calcula xadesjs solo).
          digestValue: opts.policy.digestBase64,
          // Nota: se omite el SPURI (qualifiers) porque xadesjs no lo re-parsea
          // al verificar; SigPolicyId + SigPolicyHash son el núcleo de XAdES-EPES.
        }
      : undefined,
  });

  const signatureXml = signed.GetXml();
  if (!signatureXml) throw new Error("La firma no produjo un nodo XML");
  doc.documentElement.appendChild(signatureXml);
  return new XMLSerializer().serializeToString(doc);
}

/** Verifica la firma XAdES de un XML firmado. */
export async function verificarFirma(xmlFirmado: string): Promise<boolean> {
  ensureEngine();
  const doc = XAdES.Parse(xmlFirmado);
  const signatures = doc.getElementsByTagNameNS(DSIG_NS, "Signature");
  const signatureNode = signatures.item(0);
  if (!signatureNode) return false;

  const signed = new XAdES.SignedXml(doc);
  signed.LoadXml(signatureNode);
  try {
    // Verify() lanza (no devuelve false) cuando un digest no calza, p. ej. si el
    // XML fue manipulado tras firmar. Tratamos cualquier fallo como firma inválida.
    return await signed.Verify();
  } catch {
    return false;
  }
}
