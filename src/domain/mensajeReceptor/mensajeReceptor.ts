/**
 * Mensaje Receptor (v4.4).
 *
 * Es la respuesta que el RECEPTOR de un comprobante envía a Hacienda para
 * aceptarlo, aceptarlo parcialmente o rechazarlo. Su estructura es distinta a la
 * de una factura: referencia la clave del documento recibido y lleva el
 * consecutivo del receptor (no del emisor).
 *
 * ⚠️ Validar contra el XSD oficial antes de producción.
 */
import { create } from "xmlbuilder2";
import { fechaEmisionISO } from "../factura/facturaXml.js";

const NS_MR =
  "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeReceptor";
const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";

/** Respuesta del receptor ante el comprobante recibido. */
export enum RespuestaMensaje {
  Aceptado = "1",
  AceptadoParcial = "2",
  Rechazado = "3",
}

export interface MensajeReceptorInput {
  /** Clave de 50 dígitos del comprobante recibido. */
  clave: string;
  /** Cédula del emisor del comprobante recibido. */
  numeroCedulaEmisor: string;
  /** Fecha de emisión del documento recibido. */
  fechaEmisionDoc: Date;
  mensaje: RespuestaMensaje;
  detalleMensaje?: string;
  montoTotalImpuesto?: number;
  /** Total del comprobante que se está confirmando. */
  totalFactura: number;
  /** Cédula del receptor (quien emite este mensaje). */
  numeroCedulaReceptor: string;
  /** Consecutivo de 20 dígitos del receptor. */
  numeroConsecutivoReceptor: string;
}

function money(n: number): string {
  return n.toFixed(5);
}

/** Genera el XML (sin firmar) de un Mensaje Receptor v4.4. */
export function generarMensajeReceptorXml(input: MensajeReceptorInput): string {
  if (input.clave.length !== 50) {
    throw new Error("La clave del comprobante recibido debe tener 50 dígitos");
  }
  if (input.numeroConsecutivoReceptor.length !== 20) {
    throw new Error("El consecutivo del receptor debe tener 20 dígitos");
  }

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("MensajeReceptor", {
    xmlns: NS_MR,
    "xmlns:xsi": NS_XSI,
    "xmlns:ds": NS_DS,
  });

  root.ele("Clave").txt(input.clave);
  root.ele("NumeroCedulaEmisor").txt(input.numeroCedulaEmisor);
  root.ele("FechaEmisionDoc").txt(fechaEmisionISO(input.fechaEmisionDoc));
  root.ele("Mensaje").txt(input.mensaje);
  if (input.detalleMensaje) root.ele("DetalleMensaje").txt(input.detalleMensaje);
  if (input.montoTotalImpuesto !== undefined)
    root.ele("MontoTotalImpuesto").txt(money(input.montoTotalImpuesto));
  root.ele("TotalFactura").txt(money(input.totalFactura));
  root.ele("NumeroCedulaReceptor").txt(input.numeroCedulaReceptor);
  root.ele("NumeroConsecutivoReceptor").txt(input.numeroConsecutivoReceptor);

  return root.end({ prettyPrint: true });
}
