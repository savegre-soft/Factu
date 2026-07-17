/**
 * Manejo de certificados para la firma de comprobantes electrónicos.
 *
 * - `cargarP12`: extrae la llave privada y el certificado de un archivo .p12
 *   (el formato que entrega Hacienda al emisor).
 * - `generarP12Autofirmado`: crea un .p12 autofirmado para PRUEBAS/desarrollo.
 *   NUNCA usar en producción: Hacienda solo acepta el certificado que ella emite.
 */
import forge from "node-forge";
import { generateKeyPairSync } from "node:crypto";

export interface Certificado {
  /** Llave privada en formato PEM (PKCS#8). */
  privateKeyPem: string;
  /** Certificado X.509 en formato PEM. */
  certificatePem: string;
  /** Certificado en DER, codificado en base64 (para X509Data del XML-DSig). */
  certificateDerBase64: string;
}

/** Convierte un PEM a su contenido DER en base64 (sin cabeceras). */
export function pemToDerBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

/** Carga un archivo .p12 y extrae la llave privada y el certificado. */
export function cargarP12(p12: Buffer, password: string): Certificado {
  const p12Der = forge.util.createBuffer(p12.toString("binary"));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12Obj = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const oidShrouded = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const oidKeyBag = forge.pki.oids.keyBag as string;
  const oidCertBag = forge.pki.oids.certBag as string;

  // Llave privada: puede venir en un bag cifrado o sin cifrar.
  const shroudedBags = p12Obj.getBags({ bagType: oidShrouded });
  const plainBags = p12Obj.getBags({ bagType: oidKeyBag });
  const keyBag =
    (shroudedBags[oidShrouded] ?? [])[0] ?? (plainBags[oidKeyBag] ?? [])[0];
  if (!keyBag?.key) {
    throw new Error("El .p12 no contiene una llave privada legible (¿clave incorrecta?)");
  }

  const certBags = p12Obj.getBags({ bagType: oidCertBag });
  const certBag = (certBags[oidCertBag] ?? [])[0];
  if (!certBag?.cert) {
    throw new Error("El .p12 no contiene un certificado");
  }

  const privateKeyPem = forge.pki.privateKeyInfoToPem(
    forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyBag.key)),
  );
  const certificatePem = forge.pki.certificateToPem(certBag.cert);

  return {
    privateKeyPem,
    certificatePem,
    certificateDerBase64: pemToDerBase64(certificatePem),
  };
}

export interface P12AutofirmadoOpts {
  password: string;
  /** Nombre común (CN) del sujeto. */
  commonName?: string;
  /** Cédula a incluir en el certificado (uso informativo). */
  cedula?: string;
  /** Días de validez. */
  diasValidez?: number;
}

/**
 * Genera un certificado autofirmado y lo empaqueta como .p12 (solo PRUEBAS).
 * La llave RSA se genera con el módulo nativo de Node (rápido) y el certificado
 * se arma con node-forge.
 */
export function generarP12Autofirmado(opts: P12AutofirmadoOpts): {
  p12: Buffer;
  certificado: Certificado;
} {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privatePkcs1Pem = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
  const forgeKey = forge.pki.privateKeyFromPem(privatePkcs1Pem);
  const publicKey = forge.pki.setRsaPublicKey(forgeKey.n, forgeKey.e);

  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(0);
  const notAfter = new Date(0);
  notAfter.setFullYear(1970 + Math.ceil((opts.diasValidez ?? 365) / 365) + 30);
  cert.validity.notAfter = notAfter;

  const attrs = [
    { name: "commonName", value: opts.commonName ?? "Certificado de Prueba Factu" },
    { name: "countryName", value: "CR" },
    { name: "organizationName", value: opts.cedula ?? "PRUEBA" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(forgeKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(forgeKey, cert, opts.password, {
    algorithm: "3des",
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12 = Buffer.from(p12Der, "binary");

  const certificatePem = forge.pki.certificateToPem(cert);
  return {
    p12,
    certificado: {
      privateKeyPem: forge.pki.privateKeyInfoToPem(
        forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(forgeKey)),
      ),
      certificatePem,
      certificateDerBase64: pemToDerBase64(certificatePem),
    },
  };
}
