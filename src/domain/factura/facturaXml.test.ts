import { describe, it, expect } from "vitest";
import { create } from "xmlbuilder2";
import { generarFacturaXml, fechaEmisionISO } from "./facturaXml.js";
import {
  CodigoImpuesto,
  CondicionVenta,
  TipoIdentificacion,
  TipoMedioPago,
  type FacturaInput,
} from "./types.js";

function facturaBase(): FacturaInput {
  return {
    clave: "5".repeat(50),
    numeroConsecutivo: "00100001010000000001",
    codigoActividadEmisor: "620100",
    fechaEmision: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)), // 12:00 CR
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      ubicacion: { provincia: "1", canton: "01", distrito: "01", otrasSenas: "Centro" },
      correoElectronico: "facturas@empresa.cr",
    },
    receptor: {
      nombre: "Cliente Y",
      identificacion: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
      correoElectronico: "cliente@correo.cr",
    },
    condicionVenta: CondicionVenta.Contado,
    lineas: [
      {
        codigoCabys: "8399000000000",
        cantidad: 2,
        unidadMedida: "Unid",
        detalle: "Producto A",
        precioUnitario: 1000,
        impuestos: [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13 }],
      },
    ],
    mediosPago: [{ tipo: TipoMedioPago.Efectivo }],
  };
}

/** Convierte el XML a un objeto para inspeccionar nodos con comodidad. */
function parse(xml: string): any {
  return create(xml).end({ format: "object" });
}

describe("fechaEmisionISO", () => {
  it("usa el offset fijo -06:00 de Costa Rica", () => {
    const iso = fechaEmisionISO(new Date(Date.UTC(2026, 6, 16, 18, 0, 0)));
    expect(iso).toBe("2026-07-16T12:00:00-06:00");
  });
});

describe("generarFacturaXml", () => {
  it("produce XML bien formado con el namespace v4.4", () => {
    const xml = generarFacturaXml(facturaBase());
    expect(xml).toContain(
      'xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica"',
    );
    expect(() => create(xml)).not.toThrow();
  });

  it("incluye clave, consecutivo y fecha en la cabecera", () => {
    const obj = parse(generarFacturaXml(facturaBase()));
    const fe = obj.FacturaElectronica;
    expect(fe.Clave).toBe("5".repeat(50));
    expect(fe.NumeroConsecutivo).toBe("00100001010000000001");
    expect(fe.FechaEmision).toBe("2026-07-16T12:00:00-06:00");
    expect(fe.CodigoActividadEmisor).toBe("620100");
  });

  it("refleja emisor y receptor", () => {
    const fe = parse(generarFacturaXml(facturaBase())).FacturaElectronica;
    expect(fe.Emisor.Nombre).toBe("Empresa X S.A.");
    expect(fe.Emisor.Identificacion.Numero).toBe("3101123456");
    expect(fe.Receptor.Nombre).toBe("Cliente Y");
  });

  it("calcula la línea y el resumen con montos a 5 decimales", () => {
    const fe = parse(generarFacturaXml(facturaBase())).FacturaElectronica;
    const linea = fe.DetalleServicio.LineaDetalle;
    expect(linea.MontoTotal).toBe("2000.00000");
    expect(linea.Impuesto.Monto).toBe("260.00000");
    expect(linea.MontoTotalLinea).toBe("2260.00000");

    const resumen = fe.ResumenFactura;
    expect(resumen.TotalGravado).toBe("2000.00000");
    expect(resumen.TotalImpuesto).toBe("260.00000");
    expect(resumen.TotalComprobante).toBe("2260.00000");
    expect(resumen.MedioPago.TipoMedioPago).toBe("01");
  });

  it("omite el receptor cuando no se proporciona (caso tiquete)", () => {
    const input = facturaBase();
    delete input.receptor;
    const fe = parse(generarFacturaXml(input)).FacturaElectronica;
    expect(fe.Receptor).toBeUndefined();
  });
});
