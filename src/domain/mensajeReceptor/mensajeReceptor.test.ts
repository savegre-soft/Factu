import { describe, it, expect } from "vitest";
import { create } from "xmlbuilder2";
import { generarMensajeReceptorXml, RespuestaMensaje } from "./mensajeReceptor.js";

function parse(xml: string): any {
  return create(xml).end({ format: "object" });
}

function base() {
  return {
    clave: "5".repeat(50),
    numeroCedulaEmisor: "3101123456",
    fechaEmisionDoc: new Date(Date.UTC(2026, 6, 16, 18, 0, 0)),
    mensaje: RespuestaMensaje.Aceptado,
    totalFactura: 1130,
    montoTotalImpuesto: 130,
    numeroCedulaReceptor: "102340567",
    numeroConsecutivoReceptor: "00100001050000000001",
  };
}

describe("generarMensajeReceptorXml", () => {
  it("genera el XML con la estructura del Mensaje Receptor", () => {
    const xml = generarMensajeReceptorXml(base());
    expect(xml).toContain("<MensajeReceptor");
    expect(xml).toContain("/v4.4/mensajeReceptor");

    const mr = parse(xml).MensajeReceptor;
    expect(mr.Clave).toBe("5".repeat(50));
    expect(mr.NumeroCedulaEmisor).toBe("3101123456");
    expect(mr.FechaEmisionDoc).toBe("2026-07-16T12:00:00-06:00");
    expect(mr.Mensaje).toBe("1");
    expect(mr.TotalFactura).toBe("1130.00000");
    expect(mr.MontoTotalImpuesto).toBe("130.00000");
    expect(mr.NumeroConsecutivoReceptor).toBe("00100001050000000001");
  });

  it("omite el detalle y el impuesto cuando no se proporcionan", () => {
    const { montoTotalImpuesto, ...sinImpuesto } = base();
    const mr = parse(generarMensajeReceptorXml(sinImpuesto)).MensajeReceptor;
    expect(mr.MontoTotalImpuesto).toBeUndefined();
    expect(mr.DetalleMensaje).toBeUndefined();
  });

  it("refleja un rechazo con su detalle", () => {
    const mr = parse(
      generarMensajeReceptorXml({
        ...base(),
        mensaje: RespuestaMensaje.Rechazado,
        detalleMensaje: "No corresponde a una compra",
      }),
    ).MensajeReceptor;
    expect(mr.Mensaje).toBe("3");
    expect(mr.DetalleMensaje).toBe("No corresponde a una compra");
  });

  it("valida la longitud de la clave y del consecutivo", () => {
    expect(() => generarMensajeReceptorXml({ ...base(), clave: "123" })).toThrow(/50 dígitos/);
    expect(() =>
      generarMensajeReceptorXml({ ...base(), numeroConsecutivoReceptor: "123" }),
    ).toThrow(/20 dígitos/);
  });
});
