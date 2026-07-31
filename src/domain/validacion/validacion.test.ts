import { describe, it, expect } from "vitest";
import { validarComprobante, type ComprobanteValidable } from "./validacion.js";
import { TipoDocumento } from "../factura/facturaXml.js";
import {
  CodigoImpuesto,
  CondicionVenta,
  TipoIdentificacion,
} from "../factura/types.js";

function valido(): ComprobanteValidable {
  return {
    codigoActividadEmisor: "620100",
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
    },
    receptor: {
      nombre: "Cliente Y",
      identificacion: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
    },
    condicionVenta: CondicionVenta.Contado,
    lineas: [
      {
        codigoCabys: "8399000000000",
        cantidad: 1,
        unidadMedida: "Unid",
        detalle: "Producto A",
        precioUnitario: 1000,
        impuestos: [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13 }],
      },
    ],
  };
}

const campos = (errs: { campo: string }[]) => errs.map((e) => e.campo);

describe("validarComprobante — caso válido", () => {
  it("no reporta errores para una factura correcta", () => {
    expect(validarComprobante(TipoDocumento.FacturaElectronica, valido())).toEqual([]);
  });

  it("un tiquete sin receptor es válido", () => {
    const { receptor, ...sinReceptor } = valido();
    expect(validarComprobante(TipoDocumento.TiqueteElectronico, sinReceptor)).toEqual([]);
  });
});

describe("validarComprobante — emisor y receptor", () => {
  it("exige receptor en factura", () => {
    const { receptor, ...sinReceptor } = valido();
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, sinReceptor);
    expect(campos(errs)).toContain("receptor");
  });

  it("detecta código de actividad inválido y correo inválido", () => {
    const d = valido();
    d.codigoActividadEmisor = "62";
    d.emisor.correoElectronico = "no-es-correo";
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toEqual(
      expect.arrayContaining(["codigoActividadEmisor", "emisor.correoElectronico"]),
    );
  });

  it("valida el largo de la cédula según el tipo", () => {
    const d = valido();
    d.emisor.identificacion = { tipo: TipoIdentificacion.Fisica, numero: "3101123456" }; // 10, física espera 9
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toContain("emisor.identificacion.numero");
  });
});

describe("validarComprobante — líneas", () => {
  it("detecta CABYS con largo incorrecto, cantidad 0 y descuento excesivo", () => {
    const d = valido();
    d.lineas = [
      {
        codigoCabys: "123",
        cantidad: 0,
        unidadMedida: "Unid",
        detalle: "X",
        precioUnitario: 1000,
        descuentos: [{ monto: 5000, naturaleza: "Promo" }],
      },
    ];
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toEqual(
      expect.arrayContaining([
        "lineas[0].codigoCabys",
        "lineas[0].cantidad",
        "lineas[0].descuentos",
      ]),
    );
  });

  it("rechaza tarifas fuera de rango", () => {
    const d = valido();
    d.lineas[0]!.impuestos = [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 150 }];
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toContain("lineas[0].impuestos[0].tarifa");
  });

  it("exige al menos una línea", () => {
    const d = valido();
    d.lineas = [];
    expect(campos(validarComprobante(TipoDocumento.FacturaElectronica, d))).toContain("lineas");
  });
});

describe("validarComprobante — exoneración por línea", () => {
  it("rechaza una exoneración incompleta (sin documento, institución ni fecha, porcentaje fuera de rango)", () => {
    const d = valido();
    d.lineas[0]!.impuestos = [
      {
        codigo: CodigoImpuesto.IVA,
        codigoTarifa: "08",
        tarifa: 13,
        exoneracion: {
          tipoDocumento: "01",
          numeroDocumento: "",
          nombreInstitucion: "",
          fechaEmisionDocumento: undefined as unknown as Date,
          porcentajeExoneracion: 0,
          montoExoneracion: 0,
        },
      },
    ];
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toEqual(
      expect.arrayContaining([
        "lineas[0].impuestos[0].exoneracion.numeroDocumento",
        "lineas[0].impuestos[0].exoneracion.nombreInstitucion",
        "lineas[0].impuestos[0].exoneracion.fechaEmisionDocumento",
        "lineas[0].impuestos[0].exoneracion.porcentajeExoneracion",
      ]),
    );
  });

  it("rechaza un monto exonerado mayor al impuesto sin exonerar", () => {
    const d = valido();
    d.lineas[0]!.precioUnitario = 1000; // IVA bruto = 130
    d.lineas[0]!.impuestos = [
      {
        codigo: CodigoImpuesto.IVA,
        codigoTarifa: "08",
        tarifa: 13,
        exoneracion: {
          tipoDocumento: "01",
          numeroDocumento: "DGT-1",
          nombreInstitucion: "Hacienda",
          fechaEmisionDocumento: new Date("2026-01-01"),
          porcentajeExoneracion: 100,
          montoExoneracion: 500,
        },
      },
    ];
    const errs = validarComprobante(TipoDocumento.FacturaElectronica, d);
    expect(campos(errs)).toContain("lineas[0].impuestos[0].exoneracion.montoExoneracion");
  });

  it("acepta una exoneración completa y consistente", () => {
    const d = valido();
    d.lineas[0]!.precioUnitario = 1000;
    d.lineas[0]!.impuestos = [
      {
        codigo: CodigoImpuesto.IVA,
        codigoTarifa: "08",
        tarifa: 13,
        exoneracion: {
          tipoDocumento: "01",
          numeroDocumento: "DGT-1",
          nombreInstitucion: "Hacienda",
          fechaEmisionDocumento: new Date("2026-01-01"),
          porcentajeExoneracion: 100,
          montoExoneracion: 130,
        },
      },
    ];
    expect(validarComprobante(TipoDocumento.FacturaElectronica, d)).toEqual([]);
  });
});

describe("validarComprobante — condición de venta y moneda", () => {
  it("exige plazo de crédito cuando la venta es a crédito", () => {
    const d = valido();
    d.condicionVenta = CondicionVenta.Credito;
    expect(campos(validarComprobante(TipoDocumento.FacturaElectronica, d))).toContain("plazoCredito");
  });

  it("exige tipo de cambio cuando la moneda no es CRC", () => {
    const d = valido();
    d.moneda = { codigo: "USD" };
    expect(campos(validarComprobante(TipoDocumento.FacturaElectronica, d))).toContain("moneda.tipoCambio");
  });
});

describe("validarComprobante — notas de crédito/débito", () => {
  it("exige información de referencia", () => {
    const errs = validarComprobante(TipoDocumento.NotaCredito, valido());
    expect(campos(errs)).toContain("informacionReferencia");
  });

  it("valida el contenido de la referencia", () => {
    const d = valido();
    d.informacionReferencia = [
      { tipoDoc: "01", numero: "123", fechaEmision: new Date(), codigo: "01", razon: "" },
    ];
    const errs = validarComprobante(TipoDocumento.NotaDebito, d);
    expect(campos(errs)).toEqual(
      expect.arrayContaining(["informacionReferencia[0].numero", "informacionReferencia[0].razon"]),
    );
  });

  it("acepta una nota de crédito con referencia válida", () => {
    const d = valido();
    d.informacionReferencia = [
      { tipoDoc: "01", numero: "1".repeat(50), fechaEmision: new Date(), codigo: "01", razon: "Anula" },
    ];
    expect(validarComprobante(TipoDocumento.NotaCredito, d)).toEqual([]);
  });
});
