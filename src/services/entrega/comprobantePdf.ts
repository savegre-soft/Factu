/**
 * Genera el PDF de un comprobante a partir de su XML firmado.
 *
 * Se parsea el XML (ignorando namespaces) y se dibuja una factura legible con
 * pdfkit (sin navegador headless). Un único camino sirve tanto para el envío
 * inicial como para los reintentos y el reenvío manual.
 */
import PDFDocument from "pdfkit";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";

interface LineaPdf {
  numero: string;
  detalle: string;
  cantidad: string;
  precio: number;
  ivaTarifa: string;
  total: number;
}

export interface DatosPdf {
  tipoNombre: string;
  clave: string;
  consecutivo: string;
  fecha: string;
  emisorNombre: string;
  emisorCedula: string;
  receptorNombre: string;
  receptorCedula: string;
  receptorCorreo: string;
  moneda: string;
  lineas: LineaPdf[];
  totalVentaNeta: number;
  totalDescuentos: number;
  totalImpuesto: number;
  totalOtrosCargos: number;
  totalComprobante: number;
}

const TIPO_POR_RAIZ: Record<string, string> = {
  FacturaElectronica: "Factura electrónica",
  TiqueteElectronico: "Tiquete electrónico",
  NotaCreditoElectronica: "Nota de crédito electrónica",
  NotaDebitoElectronica: "Nota de débito electrónica",
};

function ln(name: string): string {
  return `*[local-name()='${name}']`;
}

function texto(contexto: Node, expr: string): string {
  const nodo = xpath.select1(expr, contexto as never) as { textContent?: string } | undefined;
  return (nodo?.textContent ?? "").trim();
}

function nodo(contexto: Node, expr: string): Node | undefined {
  return (xpath.select1(expr, contexto as never) as Node | undefined) ?? undefined;
}

function numero(contexto: Node | undefined, expr: string): number {
  if (!contexto) return 0;
  const n = Number(texto(contexto, expr));
  return Number.isFinite(n) ? n : 0;
}

/** Parsea el XML de un comprobante v4.4 a los datos que necesita el PDF. */
export function parsearParaPdf(xml: string): DatosPdf {
  const doc = new DOMParser({
    errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} },
  }).parseFromString(xml, "text/xml");
  const raiz = doc.documentElement;

  const emisor = nodo(doc, `//${ln("Emisor")}`);
  const receptor = nodo(doc, `//${ln("Receptor")}`);
  const resumen = nodo(doc, `//${ln("ResumenFactura")}`);

  const lineas: LineaPdf[] = (
    xpath.select(`//${ln("LineaDetalle")}`, doc as never) as Node[]
  ).map((l) => {
    const imp = nodo(l, `.//${ln("Impuesto")}`);
    return {
      numero: texto(l, `.//${ln("NumeroLinea")}`),
      detalle: texto(l, `.//${ln("Detalle")}`),
      cantidad: texto(l, `.//${ln("Cantidad")}`),
      precio: numero(l, `.//${ln("PrecioUnitario")}`),
      ivaTarifa: imp ? texto(imp, `.//${ln("Tarifa")}`) : "",
      total: numero(l, `.//${ln("MontoTotalLinea")}`),
    };
  });

  return {
    tipoNombre: TIPO_POR_RAIZ[raiz?.localName ?? ""] ?? "Comprobante electrónico",
    clave: texto(doc, `//${ln("Clave")}`),
    consecutivo: texto(doc, `//${ln("NumeroConsecutivo")}`),
    fecha: texto(doc, `//${ln("FechaEmision")}`),
    emisorNombre: emisor ? texto(emisor, `.//${ln("Nombre")}`) : "",
    emisorCedula: emisor ? texto(emisor, `.//${ln("Numero")}`) : "",
    receptorNombre: receptor ? texto(receptor, `.//${ln("Nombre")}`) : "",
    receptorCedula: receptor ? texto(receptor, `.//${ln("Numero")}`) : "",
    receptorCorreo: receptor ? texto(receptor, `.//${ln("CorreoElectronico")}`) : "",
    moneda: resumen ? texto(resumen, `.//${ln("CodigoMoneda")}`) || "CRC" : "CRC",
    lineas,
    totalVentaNeta: numero(resumen, `.//${ln("TotalVentaNeta")}`),
    totalDescuentos: numero(resumen, `.//${ln("TotalDescuentos")}`),
    totalImpuesto: numero(resumen, `.//${ln("TotalImpuesto")}`),
    totalOtrosCargos: numero(resumen, `.//${ln("TotalOtrosCargos")}`),
    totalComprobante: numero(resumen, `.//${ln("TotalComprobante")}`),
  };
}

function money(n: number): string {
  return n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Dibuja el PDF y lo devuelve como Buffer. */
export function generarFacturaPdf(d: DatosPdf, estado?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const azul = "#0f6cbd";
    const gris = "#5f6b7a";

    // Encabezado
    doc.rect(40, 40, 515, 54).fill(azul);
    doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold").text(d.emisorNombre || "Emisor", 52, 52);
    doc.fontSize(9).font("Helvetica").text(`Cédula: ${d.emisorCedula}`, 52, 74);
    doc
      .fontSize(12)
      .font("Helvetica-Bold")
      .text(d.tipoNombre, 300, 52, { width: 243, align: "right" });
    doc.fontSize(9).font("Helvetica").text(`N.º ${d.consecutivo}`, 300, 72, { width: 243, align: "right" });
    if (estado) {
      doc.fontSize(9).text(`Estado: ${estado.toUpperCase()}`, 300, 84, { width: 243, align: "right" });
    }

    doc.fillColor("#1a2230");
    let y = 110;

    // Datos generales
    doc.fontSize(9).font("Helvetica").fillColor(gris);
    doc.text(`Fecha: ${d.fecha ? new Date(d.fecha).toLocaleString("es-CR") : ""}`, 40, y);
    doc.text(`Clave: ${d.clave}`, 40, y + 13, { width: 515 });
    y += 34;

    // Receptor
    doc.fillColor("#1a2230").font("Helvetica-Bold").fontSize(10).text("Cliente", 40, y);
    doc.font("Helvetica").fontSize(9).fillColor(gris);
    doc.text(`${d.receptorNombre || "—"}   ${d.receptorCedula ? "· " + d.receptorCedula : ""}`, 40, y + 14);
    if (d.receptorCorreo) doc.text(d.receptorCorreo, 40, y + 26);
    y += 48;

    // Tabla de líneas
    const cols = { detalle: 40, cant: 320, precio: 380, iva: 455, total: 500 };
    doc.rect(40, y, 515, 18).fill("#eef2f9");
    doc.fillColor(gris).font("Helvetica-Bold").fontSize(8);
    doc.text("Detalle", cols.detalle + 4, y + 5);
    doc.text("Cant.", cols.cant, y + 5, { width: 50, align: "right" });
    doc.text("Precio", cols.precio, y + 5, { width: 65, align: "right" });
    doc.text("IVA", cols.iva, y + 5, { width: 40, align: "right" });
    doc.text("Total", cols.total, y + 5, { width: 55, align: "right" });
    y += 20;

    doc.font("Helvetica").fontSize(8).fillColor("#1a2230");
    for (const l of d.lineas) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      const alto = Math.max(14, doc.heightOfString(l.detalle, { width: 270 }));
      doc.text(l.detalle, cols.detalle + 4, y, { width: 270 });
      doc.text(l.cantidad, cols.cant, y, { width: 50, align: "right" });
      doc.text(money(l.precio), cols.precio, y, { width: 65, align: "right" });
      doc.text(l.ivaTarifa ? `${l.ivaTarifa}%` : "—", cols.iva, y, { width: 40, align: "right" });
      doc.text(money(l.total), cols.total, y, { width: 55, align: "right" });
      y += alto + 4;
      doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor("#e0e6ef").stroke();
    }

    // Totales
    y += 8;
    const filaTotal = (etiqueta: string, valor: number, negrita = false) => {
      doc.font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(negrita ? 11 : 9).fillColor("#1a2230");
      doc.text(etiqueta, 360, y, { width: 100, align: "right" });
      doc.text(`${money(valor)} ${d.moneda}`, 460, y, { width: 95, align: "right" });
      y += negrita ? 18 : 14;
    };
    filaTotal("Venta neta", d.totalVentaNeta);
    if (d.totalDescuentos > 0) filaTotal("Descuentos", d.totalDescuentos);
    filaTotal("Impuesto", d.totalImpuesto);
    if (d.totalOtrosCargos > 0) filaTotal("Otros cargos", d.totalOtrosCargos);
    filaTotal("Total", d.totalComprobante, true);

    doc.end();
  });
}
