import { describe, it, expect } from "vitest";
import { construirEnvelope, xmlToBase64, base64ToXml } from "./envelope.js";
import { TipoIdentificacion } from "../../domain/factura/types.js";

describe("xmlToBase64 / base64ToXml", () => {
  it("es reversible con acentos y caracteres UTF-8", () => {
    const xml = "<Detalle>Café con ñandú — 100% válido</Detalle>";
    expect(base64ToXml(xmlToBase64(xml))).toBe(xml);
  });
});

describe("construirEnvelope", () => {
  const meta = {
    clave: "5".repeat(50),
    fecha: "2026-07-16T12:00:00-06:00",
    emisor: { tipo: TipoIdentificacion.Juridica, numero: "3101123456" },
  };

  it("mapea clave, fecha, emisor y codifica el XML", () => {
    const env = construirEnvelope("<Factura/>", meta);
    expect(env.clave).toBe("5".repeat(50));
    expect(env.fecha).toBe("2026-07-16T12:00:00-06:00");
    expect(env.emisor).toEqual({ tipoIdentificacion: "02", numeroIdentificacion: "3101123456" });
    expect(base64ToXml(env.comprobanteXml)).toBe("<Factura/>");
    expect(env.receptor).toBeUndefined();
  });

  it("incluye receptor y callbackUrl cuando se proporcionan", () => {
    const env = construirEnvelope("<Factura/>", {
      ...meta,
      receptor: { tipo: TipoIdentificacion.Fisica, numero: "102340567" },
      callbackUrl: "https://mi-sistema.cr/callback",
    });
    expect(env.receptor).toEqual({ tipoIdentificacion: "01", numeroIdentificacion: "102340567" });
    expect(env.callbackUrl).toBe("https://mi-sistema.cr/callback");
  });
});
