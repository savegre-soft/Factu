/**
 * Extrae los datos de un comprobante electrónico (v4.4) recibido, a partir de su
 * XML. Sirve para registrar las facturas que nos emiten y, desde ahí, generar el
 * mensaje receptor.
 *
 * Se ignoran los namespaces (se busca por `local-name`), de modo que funcione
 * con el XML tal cual lo emite cualquier proveedor.
 */
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";

export interface IdentificacionParseada {
  tipo: string;
  numero: string;
}

export interface ComprobanteParseado {
  /** Clave numérica de 50 dígitos. */
  clave: string;
  /** Tipo derivado del elemento raíz: FE, TE, NC, ND (o el nombre si es otro). */
  tipo: string;
  numeroConsecutivo: string;
  /** Fecha de emisión en ISO-8601. */
  fechaEmision: string;
  emisorNombre: string;
  emisorIdentificacion: IdentificacionParseada;
  receptorNombre?: string;
  receptorIdentificacion?: IdentificacionParseada;
  moneda: string;
  totalComprobante: number;
  totalImpuesto: number;
}

const TIPO_POR_RAIZ: Record<string, string> = {
  FacturaElectronica: "FE",
  TiqueteElectronico: "TE",
  NotaCreditoElectronica: "NC",
  NotaDebitoElectronica: "ND",
  MensajeReceptor: "MR",
};

function texto(contexto: Node, expr: string): string | undefined {
  const nodo = xpath.select1(expr, contexto as never) as { textContent?: string; nodeValue?: string } | undefined;
  if (!nodo) return undefined;
  const valor = nodo.textContent ?? nodo.nodeValue ?? "";
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : undefined;
}

function nodo(contexto: Node, expr: string): Node | undefined {
  return (xpath.select1(expr, contexto as never) as Node | undefined) ?? undefined;
}

function ln(name: string): string {
  return `*[local-name()='${name}']`;
}

function identificacion(base: Node | undefined): IdentificacionParseada | undefined {
  if (!base) return undefined;
  const ident = nodo(base, `.//${ln("Identificacion")}`);
  if (!ident) return undefined;
  const tipo = texto(ident, `.//${ln("Tipo")}`) ?? "";
  const numero = texto(ident, `.//${ln("Numero")}`) ?? "";
  if (!numero) return undefined;
  return { tipo, numero };
}

/** Parsea el XML de un comprobante recibido. Lanza si el XML es inválido. */
export function parsearComprobante(xml: string): ComprobanteParseado {
  const doc = new DOMParser({
    // Silenciar el logger por defecto ante XML imperfecto de terceros.
    errorHandler: { warning: () => {}, error: () => {}, fatalError: (m) => { throw new Error(String(m)); } },
  }).parseFromString(xml, "text/xml");

  const raiz = doc.documentElement;
  if (!raiz) throw new Error("XML vacío o ilegible");

  const nombreRaiz = raiz.localName ?? raiz.nodeName;
  const tipo = TIPO_POR_RAIZ[nombreRaiz] ?? nombreRaiz;

  const clave = texto(doc, `//${ln("Clave")}`);
  if (!clave) throw new Error("El XML no contiene una Clave (¿no es un comprobante v4.4?)");

  const emisor = nodo(doc, `//${ln("Emisor")}`);
  const receptor = nodo(doc, `//${ln("Receptor")}`);
  const resumen = nodo(doc, `//${ln("ResumenFactura")}`);

  const emisorIdent = identificacion(emisor);
  const totalComprobante = resumen ? Number(texto(resumen, `.//${ln("TotalComprobante")}`) ?? "0") : 0;
  const totalImpuesto = resumen ? Number(texto(resumen, `.//${ln("TotalImpuesto")}`) ?? "0") : 0;
  const moneda =
    (resumen && texto(resumen, `.//${ln("CodigoMoneda")}`)) ?? "CRC";

  return {
    clave,
    tipo,
    numeroConsecutivo: texto(doc, `//${ln("NumeroConsecutivo")}`) ?? "",
    fechaEmision: texto(doc, `//${ln("FechaEmision")}`) ?? new Date().toISOString(),
    emisorNombre: (emisor && texto(emisor, `.//${ln("Nombre")}`)) ?? "",
    emisorIdentificacion: emisorIdent ?? { tipo: "", numero: "" },
    receptorNombre: receptor ? texto(receptor, `.//${ln("Nombre")}`) : undefined,
    receptorIdentificacion: identificacion(receptor),
    moneda,
    totalComprobante: Number.isFinite(totalComprobante) ? totalComprobante : 0,
    totalImpuesto: Number.isFinite(totalImpuesto) ? totalImpuesto : 0,
  };
}
