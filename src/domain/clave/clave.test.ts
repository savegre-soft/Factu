import { describe, it, expect } from "vitest";
import {
  generarClave,
  generarConsecutivo,
  generarCodigoSeguridad,
  TipoComprobante,
  SituacionComprobante,
} from "./clave.js";

describe("generarConsecutivo", () => {
  it("arma un consecutivo de 20 dígitos con relleno correcto", () => {
    const c = generarConsecutivo({
      sucursal: 1,
      terminal: 1,
      tipo: TipoComprobante.FacturaElectronica,
      consecutivo: 1,
    });
    // 001 (sucursal) + 00001 (terminal) + 01 (tipo) + 0000000001 (número)
    expect(c).toBe("00100001010000000001");
    expect(c).toHaveLength(20);
  });

  it("lanza si un segmento excede su longitud", () => {
    expect(() =>
      generarConsecutivo({
        sucursal: 1234, // > 3 dígitos
        terminal: 1,
        tipo: TipoComprobante.FacturaElectronica,
        consecutivo: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe("generarClave", () => {
  it("produce una clave determinista de 50 dígitos", () => {
    const { clave, consecutivo, codigoSeguridad } = generarClave({
      cedulaEmisor: "3101123456",
      fecha: new Date(2026, 6, 16), // 16/07/2026 -> 160726
      sucursal: 1,
      terminal: 1,
      tipo: TipoComprobante.FacturaElectronica,
      consecutivo: 1,
      situacion: SituacionComprobante.Normal,
      codigoSeguridad: "12345678",
    });

    // 506 + 160726 + 000003101123456 -> cédula rellenada a 12: "003101123456"
    // + consecutivo(20) + situación(1)=1 + código(8)
    expect(clave).toBe(
      "506" + "160726" + "003101123456" + "00100001010000000001" + "1" + "12345678",
    );
    expect(clave).toHaveLength(50);
    expect(consecutivo).toBe("00100001010000000001");
    expect(codigoSeguridad).toBe("12345678");
  });

  it("genera código de seguridad aleatorio si no se pasa", () => {
    const { codigoSeguridad, clave } = generarClave({
      cedulaEmisor: "3101123456",
      sucursal: 1,
      terminal: 1,
      tipo: TipoComprobante.TiqueteElectronico,
      consecutivo: 42,
    });
    expect(codigoSeguridad).toMatch(/^\d{8}$/);
    expect(clave).toHaveLength(50);
  });

  it("rechaza un código de seguridad inválido", () => {
    expect(() =>
      generarClave({
        cedulaEmisor: "3101123456",
        sucursal: 1,
        terminal: 1,
        tipo: TipoComprobante.FacturaElectronica,
        consecutivo: 1,
        codigoSeguridad: "123", // muy corto
      }),
    ).toThrow(RangeError);
  });
});

describe("generarCodigoSeguridad", () => {
  it("siempre devuelve 8 dígitos", () => {
    for (let i = 0; i < 100; i++) {
      expect(generarCodigoSeguridad()).toMatch(/^\d{8}$/);
    }
  });
});
