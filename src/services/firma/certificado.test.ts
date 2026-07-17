import { describe, it, expect } from "vitest";
import { cargarP12, generarP12Autofirmado, pemToDerBase64 } from "./certificado.js";

describe("generarP12Autofirmado + cargarP12 (ida y vuelta)", () => {
  it("genera un .p12 que luego se puede cargar con la misma clave", () => {
    const { p12, certificado } = generarP12Autofirmado({
      password: "1234",
      commonName: "Empresa X",
      cedula: "3101123456",
    });

    expect(Buffer.isBuffer(p12)).toBe(true);
    expect(p12.length).toBeGreaterThan(0);
    expect(certificado.privateKeyPem).toContain("PRIVATE KEY");
    expect(certificado.certificatePem).toContain("BEGIN CERTIFICATE");

    const cargado = cargarP12(p12, "1234");
    expect(cargado.certificatePem).toBe(certificado.certificatePem);
    expect(cargado.certificateDerBase64).toBe(certificado.certificateDerBase64);
    expect(cargado.privateKeyPem).toContain("PRIVATE KEY");
  });

  it("falla al cargar con clave incorrecta", () => {
    const { p12 } = generarP12Autofirmado({ password: "correcta" });
    expect(() => cargarP12(p12, "incorrecta")).toThrow();
  });
});

describe("pemToDerBase64", () => {
  it("quita cabeceras y espacios dejando solo el base64", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nAAAA\nBBBB\n-----END CERTIFICATE-----\n";
    expect(pemToDerBase64(pem)).toBe("AAAABBBB");
  });
});
