import { describe, it, expect } from "vitest";
import { EmisorRepositoryMemoria, ComprobanteRepositoryMemoria } from "./memory.js";

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

  describe("consecutivos", () => {
    const serie = { cedulaEmisor: "3101", sucursal: 1, terminal: 1, tipo: "FE" };

    it("entrega números crecientes y sin repetir", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      expect(await repo.reservarConsecutivo(serie)).toBe(1);
      expect(await repo.reservarConsecutivo(serie)).toBe(2);
      expect(await repo.reservarConsecutivo(serie)).toBe(3);
    });

    it("reservas concurrentes no chocan", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      const numeros = await Promise.all(
        Array.from({ length: 20 }, () => repo.reservarConsecutivo(serie)),
      );
      expect(new Set(numeros).size).toBe(20);
    });

    it("cada serie lleva su propio contador", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      await repo.reservarConsecutivo(serie);
      await repo.reservarConsecutivo(serie);
      expect(await repo.reservarConsecutivo({ ...serie, tipo: "TE" })).toBe(1);
      expect(await repo.reservarConsecutivo({ ...serie, terminal: 2 })).toBe(1);
      expect(await repo.reservarConsecutivo(serie)).toBe(3);
    });

    it("arranca desde el mayor consecutivo ya emitido", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      // 001 sucursal + 00001 terminal + 01 factura + 0000000007
      await repo.crear({ ...nuevo, consecutivo: "00100001010000000007" });
      expect(await repo.proximoConsecutivo(serie)).toBe(8);
      expect(await repo.reservarConsecutivo(serie)).toBe(8);
    });

    it("proximoConsecutivo no consume el número", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      expect(await repo.proximoConsecutivo(serie)).toBe(1);
      expect(await repo.proximoConsecutivo(serie)).toBe(1);
      expect(await repo.reservarConsecutivo(serie)).toBe(1);
    });
  });
});
