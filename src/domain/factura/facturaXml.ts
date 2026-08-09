/**
 * Generación del XML de la Factura Electrónica de Costa Rica (v4.4).
 *
 * Construye el documento SIN FIRMAR. La firma XAdES-BES es el hito 4.
 *
 * ⚠️ Los nombres de elementos, el orden y el namespace siguen el esquema v4.4
 * conocido, pero DEBEN validarse contra el XSD oficial de Hacienda antes de
 * enviar a producción. La estructura está aislada aquí para facilitar ajustes.
 */
import { create } from "xmlbuilder2";
import type {
  Emisor,
  FacturaInput,
  InformacionReferencia,
  MedioPago,
  Receptor,
  Telefono,
  Ubicacion,
} from "./types.js";
import { calcularTotales, type LineaCalculada } from "./totales.js";
import { TipoMedioPago } from "./types.js";

/** Tipos de comprobante que comparten esta misma estructura de XML. */
export enum TipoDocumento {
  FacturaElectronica = "FE",
  TiqueteElectronico = "TE",
  NotaCredito = "NC",
  NotaDebito = "ND",
}

interface DocumentoMeta {
  /** Nombre del elemento raíz. */
  root: string;
  /** Segmento del namespace (último tramo de la URL del XSD v4.4). */
  nsSegment: string;
  /** Si exige InformacionReferencia (notas de crédito/débito). */
  requiereReferencia: boolean;
}

const DOCUMENTOS: Record<TipoDocumento, DocumentoMeta> = {
  [TipoDocumento.FacturaElectronica]: {
    root: "FacturaElectronica",
    nsSegment: "facturaElectronica",
    requiereReferencia: false,
  },
  [TipoDocumento.TiqueteElectronico]: {
    root: "TiqueteElectronico",
    nsSegment: "tiqueteElectronico",
    requiereReferencia: false,
  },
  [TipoDocumento.NotaCredito]: {
    root: "NotaCreditoElectronica",
    nsSegment: "notaCreditoElectronica",
    requiereReferencia: true,
  },
  [TipoDocumento.NotaDebito]: {
    root: "NotaDebitoElectronica",
    nsSegment: "notaDebitoElectronica",
    requiereReferencia: true,
  },
};

const NS_BASE = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4";
const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";
const NS_DS = "http://www.w3.org/2000/09/xmldsig#";

/** Formatea un monto con 5 decimales, como exige Hacienda. */
function money(n: number): string {
  return n.toFixed(5);
}

/**
 * Formatea la fecha en ISO 8601 con offset fijo de Costa Rica (-06:00).
 * Costa Rica no aplica horario de verano, así que el offset es constante.
 */
export function fechaEmisionISO(fecha: Date): string {
  const cr = new Date(fecha.getTime() - 6 * 60 * 60 * 1000);
  const yyyy = cr.getUTCFullYear();
  const mm = String(cr.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(cr.getUTCDate()).padStart(2, "0");
  const hh = String(cr.getUTCHours()).padStart(2, "0");
  const mi = String(cr.getUTCMinutes()).padStart(2, "0");
  const ss = String(cr.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-06:00`;
}

type XmlNode = ReturnType<ReturnType<typeof create>["ele"]>;

function addTelefono(parent: XmlNode, tel: Telefono): void {
  const t = parent.ele("Telefono");
  t.ele("CodigoPais").txt(tel.codigoPais);
  t.ele("NumTelefono").txt(tel.numTelefono);
}

function addUbicacion(parent: XmlNode, u: Ubicacion): void {
  const node = parent.ele("Ubicacion");
  node.ele("Provincia").txt(u.provincia);
  node.ele("Canton").txt(u.canton);
  node.ele("Distrito").txt(u.distrito);
  if (u.barrio) node.ele("Barrio").txt(u.barrio);
  node.ele("OtrasSenas").txt(u.otrasSenas);
}

function addEmisor(root: XmlNode, emisor: Emisor): void {
  const node = root.ele("Emisor");
  node.ele("Nombre").txt(emisor.nombre);
  const id = node.ele("Identificacion");
  id.ele("Tipo").txt(emisor.identificacion.tipo);
  id.ele("Numero").txt(emisor.identificacion.numero);
  if (emisor.nombreComercial) node.ele("NombreComercial").txt(emisor.nombreComercial);
  addUbicacion(node, emisor.ubicacion);
  if (emisor.telefono) addTelefono(node, emisor.telefono);
  node.ele("CorreoElectronico").txt(emisor.correoElectronico);
}

function addReceptor(root: XmlNode, receptor: Receptor): void {
  const node = root.ele("Receptor");
  node.ele("Nombre").txt(receptor.nombre);
  const id = node.ele("Identificacion");
  id.ele("Tipo").txt(receptor.identificacion.tipo);
  id.ele("Numero").txt(receptor.identificacion.numero);
  if (receptor.nombreComercial) node.ele("NombreComercial").txt(receptor.nombreComercial);
  if (receptor.ubicacion) addUbicacion(node, receptor.ubicacion);
  if (receptor.telefono) addTelefono(node, receptor.telefono);
  if (receptor.correoElectronico)
    node.ele("CorreoElectronico").txt(receptor.correoElectronico);
}

function addLinea(
  parent: XmlNode,
  input: FacturaInput["lineas"][number],
  calc: LineaCalculada,
): void {
  const node = parent.ele("LineaDetalle");
  node.ele("NumeroLinea").txt(String(calc.numeroLinea));
  node.ele("CodigoCABYS").txt(input.codigoCabys);
  node.ele("Cantidad").txt(String(input.cantidad));
  node.ele("UnidadMedida").txt(input.unidadMedida);
  node.ele("Detalle").txt(input.detalle);
  node.ele("PrecioUnitario").txt(money(input.precioUnitario));
  node.ele("MontoTotal").txt(money(calc.montoTotal));

  for (const d of input.descuentos ?? []) {
    const desc = node.ele("Descuento");
    desc.ele("MontoDescuento").txt(money(d.monto));
    desc.ele("NaturalezaDescuento").txt(d.naturaleza);
  }

  node.ele("SubTotal").txt(money(calc.subTotal));

  if (calc.impuestos.length > 0) {
    node.ele("BaseImponible").txt(money(calc.subTotal));
    for (const imp of calc.impuestos) {
      const i = node.ele("Impuesto");
      i.ele("Codigo").txt(imp.codigo);
      i.ele("CodigoTarifaIVA").txt(imp.codigoTarifa);
      i.ele("Tarifa").txt(imp.tarifa.toFixed(2));
      i.ele("Monto").txt(money(imp.monto));
    }
    // Obligatorio en v4.4, va entre Impuesto e ImpuestoNeto. En una venta normal
    // (sin impuesto asumido por el emisor / cobrado a nivel de fábrica) es 0.
    node.ele("ImpuestoAsumidoEmisorFabrica").txt(money(0));
    node.ele("ImpuestoNeto").txt(money(calc.impuestoNeto));
  }

  node.ele("MontoTotalLinea").txt(money(calc.montoTotalLinea));
}

function addResumen(
  root: XmlNode,
  factura: FacturaInput,
  totales: ReturnType<typeof calcularTotales>,
): void {
  const { resumen } = totales;
  const node = root.ele("ResumenFactura");

  const moneda = factura.moneda ?? { codigo: "CRC" };
  const cm = node.ele("CodigoTipoMoneda");
  cm.ele("CodigoMoneda").txt(moneda.codigo);
  cm.ele("TipoCambio").txt(money(moneda.tipoCambio ?? 1));

  node.ele("TotalServGravados").txt(money(resumen.totalServGravados));
  node.ele("TotalServExentos").txt(money(resumen.totalServExentos));
  node.ele("TotalMercanciasGravadas").txt(money(resumen.totalMercanciasGravadas));
  node.ele("TotalMercanciasExentas").txt(money(resumen.totalMercanciasExentas));
  node.ele("TotalGravado").txt(money(resumen.totalGravado));
  node.ele("TotalExento").txt(money(resumen.totalExento));
  node.ele("TotalVenta").txt(money(resumen.totalVenta));
  node.ele("TotalDescuentos").txt(money(resumen.totalDescuentos));
  node.ele("TotalVentaNeta").txt(money(resumen.totalVentaNeta));

  for (const d of resumen.desgloseImpuesto) {
    const dg = node.ele("TotalDesgloseImpuesto");
    dg.ele("Codigo").txt(d.codigo);
    dg.ele("CodigoTarifaIVA").txt(d.codigoTarifa);
    dg.ele("TotalMontoImpuesto").txt(money(d.totalMonto));
  }

  node.ele("TotalImpuesto").txt(money(resumen.totalImpuesto));

  const medios: MedioPago[] =
    factura.mediosPago && factura.mediosPago.length > 0
      ? factura.mediosPago
      : [{ tipo: TipoMedioPago.Efectivo }];
  for (const m of medios) {
    const mp = node.ele("MedioPago");
    mp.ele("TipoMedioPago").txt(m.tipo);
    mp.ele("TotalMedioPago").txt(money(m.monto ?? resumen.totalComprobante));
  }

  node.ele("TotalComprobante").txt(money(resumen.totalComprobante));
}

function addInformacionReferencia(root: XmlNode, refs: InformacionReferencia[]): void {
  for (const ref of refs) {
    const node = root.ele("InformacionReferencia");
    node.ele("TipoDoc").txt(ref.tipoDoc);
    node.ele("Numero").txt(ref.numero);
    node.ele("FechaEmision").txt(fechaEmisionISO(ref.fechaEmision));
    node.ele("Codigo").txt(ref.codigo);
    node.ele("Razon").txt(ref.razon);
  }
}

/**
 * Genera el XML (sin firmar) de un comprobante electrónico v4.4. Cubre factura,
 * tiquete y notas de crédito/débito, que comparten la misma estructura salvo el
 * elemento raíz, el namespace y la InformacionReferencia (obligatoria en notas).
 */
export function generarComprobanteXml(
  tipo: TipoDocumento,
  factura: FacturaInput,
): string {
  const meta = DOCUMENTOS[tipo];
  const refs = factura.informacionReferencia ?? [];
  if (meta.requiereReferencia && refs.length === 0) {
    throw new Error(`${meta.root} requiere al menos una InformacionReferencia`);
  }

  const totales = calcularTotales(factura);
  const fecha = factura.fechaEmision ?? new Date();

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele(meta.root, {
    xmlns: `${NS_BASE}/${meta.nsSegment}`,
    "xmlns:xsi": NS_XSI,
    "xmlns:ds": NS_DS,
  });

  root.ele("Clave").txt(factura.clave);
  // ProveedorSistemas es obligatorio en v4.4 y va justo tras Clave. Si no se
  // especifica, el emisor es su propio proveedor: se usa su cédula.
  root
    .ele("ProveedorSistemas")
    .txt(factura.proveedorSistemas?.trim() || factura.emisor.identificacion.numero);
  root.ele("CodigoActividadEmisor").txt(factura.codigoActividadEmisor);
  if (factura.codigoActividadReceptor)
    root.ele("CodigoActividadReceptor").txt(factura.codigoActividadReceptor);
  root.ele("NumeroConsecutivo").txt(factura.numeroConsecutivo);
  root.ele("FechaEmision").txt(fechaEmisionISO(fecha));

  addEmisor(root, factura.emisor);
  if (factura.receptor) addReceptor(root, factura.receptor);

  root.ele("CondicionVenta").txt(factura.condicionVenta);
  if (factura.plazoCredito) root.ele("PlazoCredito").txt(factura.plazoCredito);

  const detalle = root.ele("DetalleServicio");
  factura.lineas.forEach((linea, i) => addLinea(detalle, linea, totales.lineas[i]!));

  addResumen(root, factura, totales);

  if (refs.length > 0) addInformacionReferencia(root, refs);

  return root.end({ prettyPrint: true });
}

/** Genera el XML (sin firmar) de la Factura Electrónica v4.4. */
export function generarFacturaXml(factura: FacturaInput): string {
  return generarComprobanteXml(TipoDocumento.FacturaElectronica, factura);
}
