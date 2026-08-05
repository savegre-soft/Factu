import { describe, it, expect } from "vitest";
import {
  EmisorRepositoryMemoria,
  ComprobanteRepositoryMemoria,
  ConsecutivoRepositoryMemoria,
} from "./memory.js";

describe("EmisorRepositoryMemoria", () => {
  it("upsert crea y luego actualiza conservando createdAt", async () => {
    const repo = new EmisorRepositoryMemoria();
    const creado = await repo.upsert({ cedula: "3101", tenantId: "t1", nombre: "A" });
    const actualizado = await repo.upsert({ cedula: "3101", tenantId: "t1", nombre: "B" });
    expect(actualizado.nombre).toBe("B");
    expect(actualizado.createdAt).toEqual(creado.createdAt);
  });

  it("guardarCertificado falla si el emisor no existe", async () => {
    const repo = new EmisorRepositoryMemoria();
    await expect(
      repo.guardarCertificado("nadie", {
        p12: { salt: "", iv: "", tag: "", ciphertext: "" },
        password: { salt: "", iv: "", tag: "", ciphertext: "" },
      }),
    ).rejects.toThrow(/no registrado/);
  });
});

describe("ComprobanteRepositoryMemoria", () => {
  const nuevo = {
    clave: "5".repeat(50),
    cedulaEmisor: "3101",
    tipo: "FE",
    consecutivo: "0".repeat(20),
    estado: "ENVIADO",
  };

  it("crea, actualiza estado y busca por clave", async () => {
    const repo = new ComprobanteRepositoryMemoria();
    await repo.crear(nuevo);
    await repo.actualizarEstado(nuevo.clave, "ACEPTADO", "<Resp/>");

    const encontrado = await repo.buscar(nuevo.clave);
    expect(encontrado?.estado).toBe("ACEPTADO");
    expect(encontrado?.respuestaXml).toBe("<Resp/>");
  });

  it("lista por emisor", async () => {
    const repo = new ComprobanteRepositoryMemoria();
    await repo.crear(nuevo);
    await repo.crear({ ...nuevo, clave: "6".repeat(50) });
    await repo.crear({ ...nuevo, clave: "7".repeat(50), cedulaEmisor: "otro" });

    expect(await repo.listarPorEmisor("3101")).toHaveLength(2);
    expect(await repo.listarPorEmisor("otro")).toHaveLength(1);
  });

  it("busca por referencia externa, aislado por emisor (idempotencia)", async () => {
    const repo = new ComprobanteRepositoryMemoria();
    await repo.crear({ ...nuevo, referenciaExterna: "invoice-123" });
    await repo.crear({ ...nuevo, clave: "6".repeat(50), cedulaEmisor: "otro", referenciaExterna: "invoice-123" });

    const encontrado = await repo.buscarPorReferencia("3101", "invoice-123");
    expect(encontrado?.clave).toBe(nuevo.clave);
    // Misma referencia pero otro emisor no debe colisionar.
    expect((await repo.buscarPorReferencia("otro", "invoice-123"))?.clave).toBe("6".repeat(50));
    expect(await repo.buscarPorReferencia("3101", "no-existe")).toBeNull();
  });
});

describe("ConsecutivoRepositoryMemoria", () => {
  it("devuelve valores crecientes en llamadas sucesivas", async () => {
    const repo = new ConsecutivoRepositoryMemoria();
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(1);
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(2);
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(3);
  });

  it("no mezcla contadores de distinta sucursal/terminal/tipo", async () => {
    const repo = new ConsecutivoRepositoryMemoria();
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(1);
    expect(await repo.siguiente("3101", 2, 1, "01")).toBe(1); // otra sucursal
    expect(await repo.siguiente("3101", 1, 2, "01")).toBe(1); // otro terminal
    expect(await repo.siguiente("3101", 1, 1, "04")).toBe(1); // otro tipo (tiquete)
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(2); // el original sigue en 2
  });

  it("resuelve 5 llamadas 'concurrentes' sin colisión (Promise.all)", async () => {
    const repo = new ConsecutivoRepositoryMemoria();
    const valores = await Promise.all(
      Array.from({ length: 5 }, () => repo.siguiente("3101", 1, 1, "01")),
    );
    expect(new Set(valores).size).toBe(5);
    expect([...valores].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("registrarSiUsado avanza el contador pero nunca lo retrocede", async () => {
    const repo = new ConsecutivoRepositoryMemoria();
    await repo.registrarSiUsado("3101", 1, 1, "01", 10);
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(11);

    await repo.registrarSiUsado("3101", 1, 1, "01", 3); // menor: no retrocede
    expect(await repo.siguiente("3101", 1, 1, "01")).toBe(12);
  });
});
