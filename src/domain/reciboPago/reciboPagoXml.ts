/**
 * Recibo Electrónico de Pago (REP), nuevo en la versión 4.4.
 *
 * Documenta el cobro de una venta a crédito: quien facturó a crédito debe
 * emitirlo cuando recibe el pago. Referencia siempre la factura que se está
 * cobrando (`InformacionReferencia` es obligatoria, a diferencia de la factura).
 *
 * Su estructura es más corta que la de una factura: el emisor y el receptor van
 * sin ubicación ni teléfono, no lleva código de actividad, y la línea no tiene
 * CABYS ni cantidad —lo que se documenta es un monto cobrado, no una venta.
 */
import { create } from "xmlbuilder2";
import { fechaEmisionISO } from "../factura/facturaXml.js";
import { TipoMedioPago } from "../factura/types.js";
import type {
  CodigoTarifa,
  CodigoImpuesto,
  Identificacion,
  InformacionReferencia,
  MedioPago,
  Moneda,
} from "../factura/types.js";

const NS_BASE = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4";
const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";

function money(n: number): string {
  return n.toFixed(5);
}

/** Emisor/receptor del REP: sin ubicación ni teléfono, a diferencia de la factura. */
export interface ParteRecibo {
  nombre: string;
  identificacion: Identificacion;
  correoElectronico?: string;
}

/** Impuesto que se detalla dentro de una línea del recibo. */
export interface ImpuestoRecibo {
  codigo: CodigoImpuesto | string;
  codigoTarifa?: CodigoTarifa;
  tarifa?: number;
  monto: number;
}

export interface LineaRecibo {
  /** Descripción de lo que se está cobrando. */
  detalle: string;
  /** Monto cobrado antes de impuestos. */
  montoTotal: number;
  impuestos?: ImpuestoRecibo[];
}

export interface ReciboPagoInput {
  clave: string;
  proveedorSistemas?: string;
  numeroConsecutivo: string;
  fechaEmision?: Date;
  emisor: ParteRecibo;
  /** Obligatorio: es quien pagó. */
  receptor: ParteRecibo;
  condicionVenta: string;
  lineas: LineaRecibo[];
  moneda?: Moneda;
  mediosPago?: MedioPago[];
  /** Obligatoria: identifica la factura que se está cobrando. */
  informacionReferencia: InformacionReferencia[];
}

type XmlNode = ReturnType<ReturnType<typeof create>["ele"]>;

function addParte(root: XmlNode, etiqueta: string, parte: ParteRecibo, correoObligatorio: boolean): void {
  const node = root.ele(etiqueta);
  node.ele("Nombre").txt(parte.nombre);
  const id = node.ele("Identificacion");
  id.ele("Tipo").txt(parte.identificacion.tipo);
  id.ele("Numero").txt(parte.identificacion.numero);
  if (parte.correoElectronico) {
    node.ele("CorreoElectronico").txt(parte.correoElectronico);
  } else if (correoObligatorio) {
    throw new Error(`El ${etiqueta.toLowerCase()} del recibo de pago requiere correo electrónico`);
  }
}

/** Genera el XML (sin firmar) de un Recibo Electrónico de Pago v4.4. */
export function generarReciboPagoXml(recibo: ReciboPagoInput): string {
  if (recibo.informacionReferencia.length === 0) {
    throw new Error("El recibo de pago requiere al menos una InformacionReferencia");
  }
  if (recibo.lineas.length === 0) {
    throw new Error("El recibo de pago requiere al menos una línea de detalle");
  }

  const fecha = recibo.fechaEmision ?? new Date();
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("ReciboElectronicoPago", {
    xmlns: `${NS_BASE}/reciboElectronicoPago`,
    "xmlns:xsi": NS_XSI,
    "xmlns:ds": NS_DS,
  });

  root.ele("Clave").txt(recibo.clave);
  root
    .ele("ProveedorSistemas")
    .txt(recibo.proveedorSistemas?.trim() || recibo.emisor.identificacion.numero);
  root.ele("NumeroConsecutivo").txt(recibo.numeroConsecutivo);
  root.ele("FechaEmision").txt(fechaEmisionISO(fecha));

  // El correo del emisor es obligatorio en su esquema; el del receptor, no.
  addParte(root, "Emisor", recibo.emisor, true);
  addParte(root, "Receptor", recibo.receptor, false);

  root.ele("CondicionVenta").txt(recibo.condicionVenta);

  const detalle = root.ele("DetalleServicio");
  let totalVenta = 0;
  let totalImpuesto = 0;
  const desglose = new Map<string, { codigo: string; codigoTarifa?: string; total: number }>();

  recibo.lineas.forEach((linea, i) => {
    const node = detalle.ele("LineaDetalle");
    node.ele("NumeroLinea").txt(String(i + 1));
    node.ele("Detalle").txt(linea.detalle);
    node.ele("MontoTotal").txt(money(linea.montoTotal));
    node.ele("SubTotal").txt(money(linea.montoTotal));

    let impuestoLinea = 0;
    for (const imp of linea.impuestos ?? []) {
      const nodo = node.ele("Impuesto");
      nodo.ele("Codigo").txt(imp.codigo);
      if (imp.codigoTarifa) nodo.ele("CodigoTarifaIVA").txt(imp.codigoTarifa);
      if (imp.tarifa !== undefined) nodo.ele("Tarifa").txt(imp.tarifa.toFixed(2));
      nodo.ele("Monto").txt(money(imp.monto));

      impuestoLinea += imp.monto;
      const clave = `${imp.codigo}|${imp.codigoTarifa ?? ""}`;
      const previo = desglose.get(clave);
      if (previo) previo.total += imp.monto;
      else
        desglose.set(clave, {
          codigo: imp.codigo,
          codigoTarifa: imp.codigoTarifa,
          total: imp.monto,
        });
    }

    node.ele("ImpuestoNeto").txt(money(impuestoLinea));
    node.ele("MontoTotalLinea").txt(money(linea.montoTotal + impuestoLinea));

    totalVenta += linea.montoTotal;
    totalImpuesto += impuestoLinea;
  });

  const totalComprobante = totalVenta + totalImpuesto;

  const resumen = root.ele("ResumenFactura");
  const moneda = recibo.moneda ?? { codigo: "CRC" };
  const cm = resumen.ele("CodigoTipoMoneda");
  cm.ele("CodigoMoneda").txt(moneda.codigo);
  cm.ele("TipoCambio").txt(money(moneda.tipoCambio ?? 1));

  resumen.ele("TotalVenta").txt(money(totalVenta));
  resumen.ele("TotalVentaNeta").txt(money(totalVenta));
  for (const d of desglose.values()) {
    const nodo = resumen.ele("TotalDesgloseImpuesto");
    nodo.ele("Codigo").txt(d.codigo);
    if (d.codigoTarifa) nodo.ele("CodigoTarifaIVA").txt(d.codigoTarifa);
    nodo.ele("TotalMontoImpuesto").txt(money(d.total));
  }
  if (totalImpuesto > 0) resumen.ele("TotalImpuesto").txt(money(totalImpuesto));

  // MedioPago es obligatorio aquí: un recibo de pago sin forma de pago no dice nada.
  const medios: MedioPago[] =
    recibo.mediosPago && recibo.mediosPago.length > 0
      ? recibo.mediosPago
      : [{ tipo: TipoMedioPago.Efectivo }];
  for (const m of medios) {
    const mp = resumen.ele("MedioPago");
    mp.ele("TipoMedioPago").txt(m.tipo);
    mp.ele("TotalMedioPago").txt(money(m.monto ?? totalComprobante));
  }
  resumen.ele("TotalComprobante").txt(money(totalComprobante));

  for (const ref of recibo.informacionReferencia) {
    const nodo = root.ele("InformacionReferencia");
    nodo.ele("TipoDocIR").txt(ref.tipoDoc);
    nodo.ele("Numero").txt(ref.numero);
    nodo.ele("FechaEmisionIR").txt(fechaEmisionISO(ref.fechaEmision));
    nodo.ele("Codigo").txt(ref.codigo);
    nodo.ele("Razon").txt(ref.razon);
  }

  return root.end({ prettyPrint: true });
}
