import { describe, it, expect, beforeEach } from "vitest";
import { CertStore } from "./certStore.js";
import { EmisorRepositoryMemoria } from "../../infra/repos/memory.js";
import { generarP12Autofirmado } from "../firma/certificado.js";

const KEY = "master-key-de-prueba";

// Un solo .p12 para todo el archivo (generarlo es la parte lenta).
const { p12 } = generarP12Autofirmado({ password: "pin123", commonName: "Empresa X" });

describe("CertStore", () => {
  let repo: EmisorRepositoryMemoria;
  let store: CertStore;

  beforeEach(async () => {
    repo = new EmisorRepositoryMemoria();
    store = new CertStore(repo, KEY);
    await repo.upsert({ cedula: "3101123456", tenantId: "t1", nombre: "Empresa X" });
  });

  it("guarda el .p12 cifrado y luego recupera un Certificado usable", async () => {
    await store.guardar("3101123456", p12, "pin123");

    expect(await store.tieneCertificado("3101123456")).toBe(true);
    const cert = await store.obtenerCertificado("3101123456");
    expect(cert.privateKeyPem).toContain("PRIVATE KEY");
    expect(cert.certificatePem).toContain("BEGIN CERTIFICATE");
  });

  it("no guarda el .p12 ni la clave en texto plano", async () => {
    await store.guardar("3101123456", p12, "pin123");
    const emisor = await repo.buscar("3101123456");
    const serializado = JSON.stringify(emisor);
    expect(serializado).not.toContain("pin123");
    // El certificado va sellado (con salt/iv/tag), no como el binario crudo.
    expect(emisor?.certificado?.p12.ciphertext).toBeTruthy();
    expect(emisor?.certificado?.p12.tag).toBeTruthy();
  });

  it("rechaza un .p12 con clave incorrecta al guardar", async () => {
    await expect(store.guardar("3101123456", p12, "clave-mala")).rejects.toThrow();
    expect(await store.tieneCertificado("3101123456")).toBe(false);
  });

  it("lanza si se pide el certificado de un emisor sin certificado", async () => {
    await expect(store.obtenerCertificado("3101123456")).rejects.toThrow(/no tiene un certificado/);
  });

  it("no puede descifrar con otra llave maestra", async () => {
    await store.guardar("3101123456", p12, "pin123");
    const otro = new CertStore(repo, "otra-llave");
    await expect(otro.obtenerCertificado("3101123456")).rejects.toThrow();
  });
});
