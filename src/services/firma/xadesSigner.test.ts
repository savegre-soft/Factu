import { describe, it, expect } from "vitest";
import { firmarXadesBes, verificarFirma } from "./xadesSigner.js";
import { generarP12Autofirmado } from "./certificado.js";
import { generarFacturaXml } from "../../domain/factura/facturaXml.js";
import {
  CodigoImpuesto,
  CondicionVenta,
  TipoIdentificacion,
  type FacturaInput,
} from "../../domain/factura/types.js";

// Un solo certificado de prueba para todo el archivo (la generación es la parte lenta).
const { certificado } = generarP12Autofirmado({
  password: "1234",
  commonName: "Empresa X",
  cedula: "3101123456",
});

function facturaXml(): string {
  const input: FacturaInput = {
    clave: "5".repeat(50),
    numeroConsecutivo: "00100001010000000001",
    codigoActividadEmisor: "620100",
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
  return generarFacturaXml(input);
}

describe("firmarXadesBes", () => {
  it("firma un XML sencillo y la firma verifica", async () => {
    const firmado = await firmarXadesBes("<Root><A>hola</A></Root>", certificado);
    expect(firmado).toContain("Signature");
    expect(firmado).toContain("QualifyingProperties");
    expect(firmado).toContain("SigningTime");
    expect(firmado).toContain("SigningCertificate");
    expect(await verificarFirma(firmado)).toBe(true);
  });

  it("firma una Factura Electrónica v4.4 y la firma verifica", async () => {
    const firmado = await firmarXadesBes(facturaXml(), certificado, {
      productionPlace: { country: "Costa Rica" },
    });
    expect(firmado).toContain("FacturaElectronica");
    expect(firmado).toContain("<ds:Signature");
    expect(await verificarFirma(firmado)).toBe(true);
  });

  it("detecta un XML manipulado después de firmar", async () => {
    const firmado = await firmarXadesBes(facturaXml(), certificado);
    const manipulado = firmado.replace("1000.00000", "9999.00000");
    expect(await verificarFirma(manipulado)).toBe(false);
  });

  it("verificarFirma devuelve false si no hay firma", async () => {
    expect(await verificarFirma("<Root/>")).toBe(false);
  });
});
