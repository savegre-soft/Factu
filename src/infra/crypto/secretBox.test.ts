import { describe, it, expect } from "vitest";
import { sellar, abrir, abrirTexto } from "./secretBox.js";

const KEY = "llave-maestra-de-prueba-muy-secreta";

describe("secretBox", () => {
  it("cifra y descifra texto (ida y vuelta)", () => {
    const sellado = sellar("mi-pin-1234", KEY);
    expect(abrirTexto(sellado, KEY)).toBe("mi-pin-1234");
  });

  it("cifra y descifra binario (ida y vuelta)", () => {
    const datos = Buffer.from([0, 1, 2, 255, 128, 64]);
    const sellado = sellar(datos, KEY);
    expect(abrir(sellado, KEY).equals(datos)).toBe(true);
  });

  it("produce salt e iv distintos en cada cifrado", () => {
    const a = sellar("x", KEY);
    const b = sellar("x", KEY);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("falla al descifrar con la llave incorrecta", () => {
    const sellado = sellar("secreto", KEY);
    expect(() => abrir(sellado, "llave-incorrecta")).toThrow();
  });

  it("detecta manipulación del ciphertext (GCM auth tag)", () => {
    const sellado = sellar("secreto", KEY);
    const alterado = { ...sellado, ciphertext: Buffer.from("otracosa").toString("base64") };
    expect(() => abrir(alterado, KEY)).toThrow();
  });

  it("exige una llave maestra no vacía", () => {
    expect(() => sellar("x", "")).toThrow(/llave maestra/);
  });
});
