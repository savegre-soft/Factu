import { describe, it, expect } from "vitest";
import { calcularLinea, calcularTotales, redondear } from "./totales.js";
import {
  CodigoImpuesto,
  CondicionVenta,
  TipoIdentificacion,
  type FacturaInput,
  type LineaDetalle,
} from "./types.js";

const IVA_13: LineaDetalle["impuestos"] = [
  { codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13 },
];

describe("redondear", () => {
  it("redondea a 5 decimales sin errores de coma flotante", () => {
    expect(redondear(0.1 + 0.2)).toBe(0.3);
    expect(redondear(1.234567)).toBe(1.23457);
  });
});

describe("calcularLinea", () => {
  it("calcula monto, subtotal, impuesto y total de una línea gravada", () => {
    const linea = calcularLinea(
      {
        codigoCabys: "8399000000000",
        cantidad: 2,
        unidadMedida: "Unid",
        detalle: "Producto",
        precioUnitario: 1000,
        impuestos: IVA_13,
      },
      1,
    );

    expect(linea.montoTotal).toBe(2000);
    expect(linea.subTotal).toBe(2000);
    expect(linea.impuestoNeto).toBe(260); // 13% de 2000
    expect(linea.montoTotalLinea).toBe(2260);
    expect(linea.gravada).toBe(true);
  });

  it("aplica descuentos antes de calcular el impuesto", () => {
    const linea = calcularLinea(
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Producto con descuento",
        precioUnitario: 1000,
        descuentos: [{ monto: 100, naturaleza: "Promoción" }],
        impuestos: IVA_13,
      },
      1,
    );

    expect(linea.montoTotal).toBe(1000);
    expect(linea.montoDescuento).toBe(100);
    expect(linea.subTotal).toBe(900);
    expect(linea.impuestoNeto).toBe(117); // 13% de 900
    expect(linea.montoTotalLinea).toBe(1017);
  });

  it("resta la exoneración del monto del impuesto (parcial)", () => {
    const linea = calcularLinea(
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Exonerado parcial",
        precioUnitario: 1000,
        impuestos: [
          {
            codigo: CodigoImpuesto.IVA,
            codigoTarifa: "08",
            tarifa: 13,
            exoneracion: {
              tipoDocumento: "01",
              numeroDocumento: "DGT-123",
              nombreInstitucion: "Ministerio de Hacienda",
              fechaEmisionDocumento: new Date("2026-01-01"),
              porcentajeExoneracion: 50,
              montoExoneracion: 65, // 50% de los 130 de IVA bruto
            },
          },
        ],
      },
      1,
    );

    expect(linea.impuestos[0]!.monto).toBe(65); // 130 bruto - 65 exonerado
    expect(linea.impuestoNeto).toBe(65);
    expect(linea.montoTotalLinea).toBe(1065);
  });

  it("no deja el monto de impuesto en negativo si la exoneración supera el bruto", () => {
    const linea = calcularLinea(
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Exonerado total",
        precioUnitario: 1000,
        impuestos: [
          {
            codigo: CodigoImpuesto.IVA,
            codigoTarifa: "08",
            tarifa: 13,
            exoneracion: {
              tipoDocumento: "01",
              numeroDocumento: "DGT-123",
              nombreInstitucion: "Ministerio de Hacienda",
              fechaEmisionDocumento: new Date("2026-01-01"),
              porcentajeExoneracion: 100,
              montoExoneracion: 130,
            },
          },
        ],
      },
      1,
    );

    expect(linea.impuestos[0]!.monto).toBe(0);
    expect(linea.impuestoNeto).toBe(0);
    expect(linea.montoTotalLinea).toBe(1000);
  });

  it("marca como no gravada una línea sin impuestos", () => {
    const linea = calcularLinea(
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Exento",
        precioUnitario: 500,
      },
      1,
    );
    expect(linea.gravada).toBe(false);
    expect(linea.impuestoNeto).toBe(0);
  });
});

describe("calcularTotales", () => {
  const base: Omit<FacturaInput, "lineas"> = {
    clave: "5".repeat(50),
    numeroConsecutivo: "0".repeat(20),
    codigoActividadEmisor: "620100",
    emisor: {
      nombre: "Empresa X",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
    },
    condicionVenta: CondicionVenta.Contado,
  };

  it("suma gravado/exento separando servicios de mercancías", () => {
    const { resumen } = calcularTotales({
      ...base,
      lineas: [
        {
          codigoCabys: "8399000000000",
          cantidad: 1,
          unidadMedida: "Unid",
          detalle: "Mercancía gravada",
          precioUnitario: 1000,
          impuestos: IVA_13,
        },
        {
          codigoCabys: "8511000000000",
          cantidad: 1,
          unidadMedida: "Sp",
          detalle: "Servicio gravado",
          precioUnitario: 2000,
          esServicio: true,
          impuestos: IVA_13,
        },
        {
          codigoCabys: "0111100000000",
          cantidad: 1,
          unidadMedida: "Unid",
          detalle: "Mercancía exenta",
          precioUnitario: 500,
        },
      ],
    });

    expect(resumen.totalMercanciasGravadas).toBe(1000);
    expect(resumen.totalServGravados).toBe(2000);
    expect(resumen.totalMercanciasExentas).toBe(500);
    expect(resumen.totalGravado).toBe(3000);
    expect(resumen.totalExento).toBe(500);
    expect(resumen.totalVenta).toBe(3500);
    expect(resumen.totalImpuesto).toBe(390); // 13% de 3000
    expect(resumen.totalVentaNeta).toBe(3500);
    expect(resumen.totalComprobante).toBe(3890);
  });

  it("agrupa el desglose de impuestos por código y tarifa", () => {
    const { resumen } = calcularTotales({
      ...base,
      lineas: [
        {
          codigoCabys: "8399000000000",
          cantidad: 1,
          unidadMedida: "Unid",
          detalle: "A",
          precioUnitario: 1000,
          impuestos: IVA_13,
        },
        {
          codigoCabys: "8399000000000",
          cantidad: 1,
          unidadMedida: "Unid",
          detalle: "B",
          precioUnitario: 3000,
          impuestos: IVA_13,
        },
      ],
    });

    expect(resumen.desgloseImpuesto).toHaveLength(1);
    expect(resumen.desgloseImpuesto[0]).toMatchObject({
      codigo: "01",
      codigoTarifa: "08",
      totalMonto: 520, // 13% de 4000
    });
  });

  it("resta descuentos en la venta neta", () => {
    const { resumen } = calcularTotales({
      ...base,
      lineas: [
        {
          codigoCabys: "8399000000000",
          cantidad: 1,
          unidadMedida: "Unid",
          detalle: "Con descuento",
          precioUnitario: 1000,
          descuentos: [{ monto: 200, naturaleza: "Promo" }],
          impuestos: IVA_13,
        },
      ],
    });

    expect(resumen.totalVenta).toBe(1000);
    expect(resumen.totalDescuentos).toBe(200);
    expect(resumen.totalVentaNeta).toBe(800);
    expect(resumen.totalImpuesto).toBe(104); // 13% de 800
    expect(resumen.totalComprobante).toBe(904);
  });
});
