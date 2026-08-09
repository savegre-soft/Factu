import { describe, it, expect } from "vitest";
import { create } from "xmlbuilder2";
import { generarReciboPagoXml, type ReciboPagoInput } from "./reciboPagoXml.js";
import {
  CodigoImpuesto,
  CodigoReferencia,
  TipoDocReferencia,
  TipoIdentificacion,
  TipoMedioPago,
} from "../factura/types.js";

function reciboBase(): ReciboPagoInput {
  return {
    clave: "5".repeat(50),
    numeroConsecutivo: "00100001100000000001",
    fechaEmision: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)), // 12:00 CR
    emisor: {
      nombre: "Empresa X S.A.",
      identificacion: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
      correoElectronico: "cobros@empresa.cr",
    },
    receptor: {
      nombre: "Cliente Y",
      identificacion: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
    },
    condicionVenta: "01",
    lineas: [
      {
        detalle: "Abono a factura 00100001010000000042",
        montoTotal: 1000,
        impuestos: [{ codigo: CodigoImpuesto.IVA, codigoTarifa: "08", tarifa: 13, monto: 130 }],
      },
    ],
    mediosPago: [{ tipo: TipoMedioPago.Transferencia }],
    informacionReferencia: [
      {
        tipoDoc: TipoDocReferencia.FacturaElectronica,
        numero: "1".repeat(50),
        fechaEmision: new Date(Date.UTC(2026, 5, 1, 18, 0, 0)),
        codigo: CodigoReferencia.ReferenciaOtroDocumento,
        razon: "Cobro de la factura a crédito",
      },
    ],
  };
}

function parse(xml: string): any {
  return create(xml).end({ format: "object" });
}

describe("generarReciboPagoXml", () => {
  it("usa la raíz y el namespace del recibo de pago", () => {
    const xml = generarReciboPagoXml(reciboBase());
    expect(xml).toContain("<ReciboElectronicoPago");
    expect(xml).toContain("/v4.4/reciboElectronicoPago");
    expect(() => create(xml)).not.toThrow();
  });

  it("no lleva código de actividad ni ubicación: su esquema no los tiene", () => {
    const rep = parse(generarReciboPagoXml(reciboBase())).ReciboElectronicoPago;
    expect(rep.CodigoActividadEmisor).toBeUndefined();
    expect(rep.Emisor.Ubicacion).toBeUndefined();
    expect(rep.Emisor.CorreoElectronico).toBe("cobros@empresa.cr");
  });

  it("la línea documenta un cobro, sin CABYS ni cantidad", () => {
    const linea = parse(generarReciboPagoXml(reciboBase())).ReciboElectronicoPago.DetalleServicio
      .LineaDetalle;
    expect(linea.CodigoCABYS).toBeUndefined();
    expect(linea.Cantidad).toBeUndefined();
    expect(linea.Detalle).toBe("Abono a factura 00100001010000000042");
    expect(linea.MontoTotal).toBe("1000.00000");
    expect(linea.ImpuestoNeto).toBe("130.00000");
    expect(linea.MontoTotalLinea).toBe("1130.00000");
  });

  it("resume totales, desglose y medio de pago", () => {
    const resumen = parse(generarReciboPagoXml(reciboBase())).ReciboElectronicoPago.ResumenFactura;
    expect(resumen.TotalVenta).toBe("1000.00000");
    expect(resumen.TotalImpuesto).toBe("130.00000");
    expect(resumen.TotalDesgloseImpuesto.TotalMontoImpuesto).toBe("130.00000");
    expect(resumen.MedioPago.TipoMedioPago).toBe("04");
    expect(resumen.MedioPago.TotalMedioPago).toBe("1130.00000");
    expect(resumen.TotalComprobante).toBe("1130.00000");
  });

  it("referencia la factura que se está cobrando con los nombres de v4.4", () => {
    const ref = parse(generarReciboPagoXml(reciboBase())).ReciboElectronicoPago
      .InformacionReferencia;
    expect(ref.TipoDocIR).toBe("01");
    expect(ref.FechaEmisionIR).toBe("2026-06-01T12:00:00-06:00");
    expect(ref.Numero).toBe("1".repeat(50));
  });

  it("exige la referencia: un recibo sin factura que cobrar no tiene sentido", () => {
    expect(() =>
      generarReciboPagoXml({ ...reciboBase(), informacionReferencia: [] }),
    ).toThrow(/InformacionReferencia/);
  });

  it("exige el correo del emisor, que su esquema marca obligatorio", () => {
    const sinCorreo = reciboBase();
    delete sinCorreo.emisor.correoElectronico;
    expect(() => generarReciboPagoXml(sinCorreo)).toThrow(/correo/);
  });
});
