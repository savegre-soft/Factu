/**
 * Cálculo de totales de la Factura Electrónica (v4.4).
 *
 * Lógica de negocio PURA (sin XML ni IO): a partir de las líneas produce los
 * montos por línea, el desglose de impuestos y el resumen del comprobante.
 *
 * Reglas usadas por Hacienda:
 *   MontoTotal (línea)  = cantidad * precioUnitario
 *   SubTotal (línea)    = MontoTotal - descuentos
 *   Impuesto (línea)    = SubTotal * (tarifa / 100)   [por cada impuesto]
 *   MontoTotalLinea     = SubTotal + impuestos
 *   Los totales gravado/exento se calculan sobre MontoTotal (antes de descuento).
 *   TotalVentaNeta      = TotalVenta - TotalDescuentos
 *   TotalComprobante    = TotalVentaNeta + TotalImpuesto + TotalOtrosCargos
 */
import type { Exoneracion, FacturaInput, LineaDetalle } from "./types.js";

/** Decimales usados para montos (Hacienda admite hasta 5). */
const DECIMALES = 5;

/** Redondea a `d` decimales evitando errores de coma flotante. */
export function redondear(n: number, d: number = DECIMALES): number {
  return Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
}

export interface ImpuestoCalculado {
  codigo: string;
  codigoTarifa: string;
  tarifa: number;
  /** Impuesto que se cobra: ya rebajado si hay exoneración. */
  monto: number;
  /** Monto exonerado, para el nodo Exoneracion y el total exonerado. */
  montoExonerado: number;
  exoneracion?: Exoneracion;
}

export interface LineaCalculada {
  numeroLinea: number;
  montoTotal: number;
  montoDescuento: number;
  subTotal: number;
  impuestos: ImpuestoCalculado[];
  impuestoNeto: number;
  montoTotalLinea: number;
  gravada: boolean;
  esServicio: boolean;
}

export interface DesgloseImpuesto {
  codigo: string;
  codigoTarifa: string;
  totalMonto: number;
}

export interface ResumenFactura {
  totalServGravados: number;
  totalServExentos: number;
  totalMercanciasGravadas: number;
  totalMercanciasExentas: number;
  totalGravado: number;
  totalExento: number;
  /** Suma de lo exonerado en todas las líneas. */
  totalExonerado: number;
  totalVenta: number;
  totalDescuentos: number;
  totalVentaNeta: number;
  desgloseImpuesto: DesgloseImpuesto[];
  totalImpuesto: number;
  totalComprobante: number;
}

export interface TotalesFactura {
  lineas: LineaCalculada[];
  resumen: ResumenFactura;
}

/** Calcula los montos de una sola línea. */
export function calcularLinea(linea: LineaDetalle, numeroLinea: number): LineaCalculada {
  const montoTotal = redondear(linea.cantidad * linea.precioUnitario);
  const montoDescuento = redondear(
    (linea.descuentos ?? []).reduce((acc, d) => acc + d.monto, 0),
  );
  const subTotal = redondear(montoTotal - montoDescuento);

  const impuestos: ImpuestoCalculado[] = (linea.impuestos ?? []).map((imp) => {
    const bruto = redondear(subTotal * (imp.tarifa / 100));
    // La exoneración rebaja el impuesto en su porcentaje: con tarifa exonerada
    // igual a la del impuesto, la línea queda sin IVA que cobrar.
    const montoExonerado = imp.exoneracion
      ? redondear(subTotal * (imp.exoneracion.tarifaExonerada / 100))
      : 0;
    return {
      codigo: imp.codigo,
      codigoTarifa: imp.codigoTarifa,
      tarifa: imp.tarifa,
      monto: redondear(Math.max(bruto - montoExonerado, 0)),
      montoExonerado,
      ...(imp.exoneracion ? { exoneracion: imp.exoneracion } : {}),
    };
  });

  const impuestoNeto = redondear(impuestos.reduce((acc, i) => acc + i.monto, 0));
  const montoTotalLinea = redondear(subTotal + impuestoNeto);
  const gravada = impuestos.some((i) => i.tarifa > 0);

  return {
    numeroLinea,
    montoTotal,
    montoDescuento,
    subTotal,
    impuestos,
    impuestoNeto,
    montoTotalLinea,
    gravada,
    esServicio: linea.esServicio ?? false,
  };
}

/** Calcula todas las líneas y el resumen del comprobante. */
export function calcularTotales(factura: FacturaInput): TotalesFactura {
  const lineas = factura.lineas.map((l, i) => calcularLinea(l, i + 1));

  let totalServGravados = 0;
  let totalServExentos = 0;
  let totalMercanciasGravadas = 0;
  let totalMercanciasExentas = 0;
  let totalDescuentos = 0;
  let totalImpuesto = 0;
  let totalExonerado = 0;

  const desgloseMap = new Map<string, DesgloseImpuesto>();

  for (const l of lineas) {
    totalDescuentos += l.montoDescuento;
    totalImpuesto += l.impuestoNeto;
    totalExonerado += l.impuestos.reduce((a, i) => a + i.montoExonerado, 0);

    if (l.esServicio) {
      if (l.gravada) totalServGravados += l.montoTotal;
      else totalServExentos += l.montoTotal;
    } else {
      if (l.gravada) totalMercanciasGravadas += l.montoTotal;
      else totalMercanciasExentas += l.montoTotal;
    }

    for (const imp of l.impuestos) {
      const key = `${imp.codigo}|${imp.codigoTarifa}`;
      const prev = desgloseMap.get(key);
      if (prev) prev.totalMonto = redondear(prev.totalMonto + imp.monto);
      else
        desgloseMap.set(key, {
          codigo: imp.codigo,
          codigoTarifa: imp.codigoTarifa,
          totalMonto: imp.monto,
        });
    }
  }

  totalServGravados = redondear(totalServGravados);
  totalServExentos = redondear(totalServExentos);
  totalMercanciasGravadas = redondear(totalMercanciasGravadas);
  totalMercanciasExentas = redondear(totalMercanciasExentas);
  totalDescuentos = redondear(totalDescuentos);
  totalImpuesto = redondear(totalImpuesto);

  const totalGravado = redondear(totalServGravados + totalMercanciasGravadas);
  const totalExento = redondear(totalServExentos + totalMercanciasExentas);
  const totalVenta = redondear(totalGravado + totalExento);
  const totalVentaNeta = redondear(totalVenta - totalDescuentos);
  const totalComprobante = redondear(totalVentaNeta + totalImpuesto);

  return {
    lineas,
    resumen: {
      totalServGravados,
      totalServExentos,
      totalMercanciasGravadas,
      totalMercanciasExentas,
      totalGravado,
      totalExento,
      totalExonerado: redondear(totalExonerado),
      totalVenta,
      totalDescuentos,
      totalVentaNeta,
      desgloseImpuesto: [...desgloseMap.values()],
      totalImpuesto,
      totalComprobante,
    },
  };
}
