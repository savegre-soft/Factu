/**
 * Construcción del "sobre" de recepción que se envía a la API de Hacienda.
 *
 * El comprobante (XML ya firmado) viaja codificado en base64 dentro de un JSON
 * con metadatos de clave, fecha, emisor y receptor.
 */
import type { Identificacion } from "../../domain/factura/types.js";

export interface ReceptionEnvelope {
  clave: string;
  fecha: string;
  emisor: { tipoIdentificacion: string; numeroIdentificacion: string };
  receptor?: { tipoIdentificacion: string; numeroIdentificacion: string };
  /**
   * Solo en el mensaje receptor: consecutivo de 20 dígitos de QUIEN responde.
   * La `clave` sigue siendo la del comprobante original.
   */
  consecutivoReceptor?: string;
  /** XML firmado, codificado en base64. */
  comprobanteXml: string;
  /** URL de callback opcional para notificación asíncrona. */
  callbackUrl?: string;
}

export interface EnvelopeMeta {
  clave: string;
  /** Fecha de emisión en ISO 8601 con offset (misma que va en el XML). */
  fecha: string;
  emisor: Identificacion;
  receptor?: Identificacion;
  consecutivoReceptor?: string;
  callbackUrl?: string;
}

/** Codifica un XML (UTF-8) a base64. */
export function xmlToBase64(xml: string): string {
  return Buffer.from(xml, "utf8").toString("base64");
}

/** Decodifica un base64 a XML (UTF-8). */
export function base64ToXml(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

/** Construye el sobre de recepción a partir del XML firmado y sus metadatos. */
export function construirEnvelope(signedXml: string, meta: EnvelopeMeta): ReceptionEnvelope {
  const envelope: ReceptionEnvelope = {
    clave: meta.clave,
    fecha: meta.fecha,
    emisor: {
      tipoIdentificacion: meta.emisor.tipo,
      numeroIdentificacion: meta.emisor.numero,
    },
    comprobanteXml: xmlToBase64(signedXml),
  };
  if (meta.receptor) {
    envelope.receptor = {
      tipoIdentificacion: meta.receptor.tipo,
      numeroIdentificacion: meta.receptor.numero,
    };
  }
  if (meta.consecutivoReceptor) envelope.consecutivoReceptor = meta.consecutivoReceptor;
  if (meta.callbackUrl) envelope.callbackUrl = meta.callbackUrl;
  return envelope;
}
