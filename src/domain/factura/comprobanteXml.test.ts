import { describe, it, expect } from "vitest";
import { create } from "xmlbuilder2";
import { generarComprobanteXml, TipoDocumento } from "./facturaXml.js";
import {
  CodigoImpuesto,
  CodigoReferencia,
  CondicionVenta,
  TipoDocReferencia,
  TipoIdentificacion,
  type FacturaInput,
} from "./types.js";

function parse(xml: string): any {
  return create(xml).end({ format: "object" });
}

function base(): FacturaInput {
  return {
    clave: "5".repeat(50),
    numeroConsecutivo: "00100001040000000001",
    codigoActividadEmisor: "620100",
    fechaEmision: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)),
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
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

describe("generarComprobanteXml — Tiquete Electrónico", () => {
  it("usa el elemento raíz y namespace de tiquete y no exige receptor", () => {
    const xml = generarComprobanteXml(TipoDocumento.TiqueteElectronico, base());
    expect(xml).toContain("<TiqueteElectronico");
    expect(xml).toContain("/v4.4/tiqueteElectronico");
    const doc = parse(xml);
    expect(doc.TiqueteElectronico.Receptor).toBeUndefined();
    expect(doc.TiqueteElectronico.ResumenFactura.TotalComprobante).toBe("1130.00000");
  });
});

describe("generarComprobanteXml — Notas de crédito/débito", () => {
  const referencia = {
    tipoDoc: TipoDocReferencia.FacturaElectronica,
    numero: "1".repeat(50),
    fechaEmision: new Date(Date.UTC(2026, 6, 10, 18, 0, 0)),
    codigo: CodigoReferencia.AnulaDocumento,
    razon: "Anulación por error",
  };

  it("nota de crédito incluye InformacionReferencia y su raíz correcta", () => {
    const xml = generarComprobanteXml(TipoDocumento.NotaCredito, {
      ...base(),
      informacionReferencia: [referencia],
    });
    expect(xml).toContain("<NotaCreditoElectronica");
    expect(xml).toContain("/v4.4/notaCreditoElectronica");
    const nc = parse(xml).NotaCreditoElectronica;
    expect(nc.InformacionReferencia.TipoDoc).toBe("01");
    expect(nc.InformacionReferencia.Numero).toBe("1".repeat(50));
    expect(nc.InformacionReferencia.Codigo).toBe("01");
    expect(nc.InformacionReferencia.Razon).toBe("Anulación por error");
  });

  it("nota de débito usa su propio elemento raíz", () => {
    const xml = generarComprobanteXml(TipoDocumento.NotaDebito, {
      ...base(),
      informacionReferencia: [referencia],
    });
    expect(xml).toContain("<NotaDebitoElectronica");
    expect(xml).toContain("/v4.4/notaDebitoElectronica");
  });

  it("falla si una nota no lleva InformacionReferencia", () => {
    expect(() => generarComprobanteXml(TipoDocumento.NotaCredito, base())).toThrow(
      /InformacionReferencia/,
    );
  });
});

describe("generarComprobanteXml — Factura (compatibilidad)", () => {
  it("sigue produciendo FacturaElectronica sin referencia", () => {
    const xml = generarComprobanteXml(TipoDocumento.FacturaElectronica, base());
    expect(xml).toContain("<FacturaElectronica");
    expect(parse(xml).FacturaElectronica.InformacionReferencia).toBeUndefined();
  });
});
