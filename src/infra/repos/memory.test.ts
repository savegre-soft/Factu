import { describe, it, expect, vi } from "vitest";
import {
  EmisorRepositoryMemoria,
  ComprobanteRepositoryMemoria,
  ConsecutivoRepositoryMemoria,
  SuscripcionRepositoryMemoria,
  PagoSuscripcionRepositoryMemoria,
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

  /**
   * `crear` sella la fecha con el reloj del sistema y varias altas seguidas
   * caerían en el mismo milisegundo: con el reloj falso cada comprobante tiene
   * un instante propio y el orden es comprobable.
   */
  async function repoConHistorial() {
    vi.useFakeTimers();
    const repo = new ComprobanteRepositoryMemoria();
    const altas = [
      { clave: "1".repeat(50), estado: "aceptado", total: 1000, moneda: "CRC", dia: "2026-01-10" },
      { clave: "2".repeat(50), estado: "aceptado", total: 500, moneda: "CRC", dia: "2026-02-10" },
      { clave: "3".repeat(50), estado: "aceptado", total: 200, moneda: "CRC", dia: "2026-02-11", tipo: "NC" },
      { clave: "4".repeat(50), estado: "rechazado", total: 9999, moneda: "CRC", dia: "2026-02-12" },
      { clave: "5".repeat(50), estado: "aceptado", total: 40, moneda: "USD", dia: "2026-02-13" },
      { clave: "6".repeat(50), estado: "recibido", dia: "2026-02-14" },
      { clave: "7".repeat(50), estado: "aceptado", total: 77, moneda: "CRC", dia: "2026-02-15", cedulaEmisor: "otro" },
    ];
    for (const { dia, ...datos } of altas) {
      vi.setSystemTime(new Date(`${dia}T12:00:00Z`));
      await repo.crear({ ...nuevo, ...datos });
    }
    vi.useRealTimers();
    return repo;
  }

  describe("listarResumen", () => {
    it("pagina, ordena por fecha descendente y omite los XML", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      await repo.crear({ ...nuevo, xmlFirmado: "<FE/>", respuestaXml: "<Resp/>" });

      const pagina = await repo.listarResumen({ cedulasEmisor: ["3101"] });
      expect(pagina.total).toBe(1);
      // Los XML pesan ~13 KB cada uno: no deben viajar en un listado.
      expect(pagina.items[0]).not.toHaveProperty("xmlFirmado");
      expect(pagina.items[0]).not.toHaveProperty("respuestaXml");
    });

    it("respeta límite y desplazamiento, y aísla por emisor", async () => {
      const repo = await repoConHistorial();

      const todos = await repo.listarResumen({ cedulasEmisor: ["3101"] });
      expect(todos.total).toBe(6); // el séptimo es de "otro"

      const primera = await repo.listarResumen({ cedulasEmisor: ["3101"], limite: 2 });
      expect(primera.items).toHaveLength(2);
      expect(primera.total).toBe(6);
      // Más reciente primero.
      expect(primera.items[0]!.clave).toBe("6".repeat(50));

      const segunda = await repo.listarResumen({
        cedulasEmisor: ["3101"],
        limite: 2,
        desplazamiento: 2,
      });
      expect(segunda.items.map((c) => c.clave)).not.toContain(primera.items[0]!.clave);
    });

    it("filtra por rango de fechas", async () => {
      const repo = await repoConHistorial();
      const enero = await repo.listarResumen({
        cedulasEmisor: ["3101"],
        hasta: new Date("2026-01-31T23:59:59Z"),
      });
      expect(enero.total).toBe(1);
    });
  });

  describe("listarNoFinalizados", () => {
    it("devuelve solo los que Hacienda no resolvió", async () => {
      const repo = await repoConHistorial();
      const pendientes = await repo.listarNoFinalizados(50, 365 * 24 * 60 * 60_000);
      expect(pendientes.map((c) => c.estado)).toEqual(["recibido"]);
    });

    it("descarta los más viejos que el margen dado", async () => {
      const repo = await repoConHistorial();
      // El "recibido" es del 14/02/2026; con un margen de 1 h no entra.
      expect(await repo.listarNoFinalizados(50, 60 * 60_000)).toHaveLength(0);
    });
  });

  describe("agregarPorEmisor", () => {
    it("agrupa por emisor, estado y tipo con su última fecha", async () => {
      const repo = await repoConHistorial();
      const filas = await repo.agregarPorEmisor(["3101"]);

      const total = filas.reduce((a, f) => a + f.total, 0);
      expect(total).toBe(6);
      const aceptadosFE = filas.find((f) => f.estado === "aceptado" && f.tipo === "FE");
      expect(aceptadosFE?.total).toBe(3);
      expect(aceptadosFE?.ultima.toISOString().slice(0, 10)).toBe("2026-02-13");
      expect(filas.some((f) => f.cedulaEmisor === "otro")).toBe(false);
    });
  });

  describe("montosPorMoneda", () => {
    it("suma solo los aceptados, resta las notas de crédito y separa monedas", async () => {
      const repo = await repoConHistorial();
      const montos = await repo.montosPorMoneda(["3101"]);

      const crcEnero = montos.find((m) => m.moneda === "CRC" && m.mes === "2026-01");
      const crcFebrero = montos.find((m) => m.moneda === "CRC" && m.mes === "2026-02");
      const usd = montos.find((m) => m.moneda === "USD");

      expect(crcEnero?.total).toBe(1000);
      // 500 de la factura menos 200 de la nota de crédito; el rechazado no cuenta.
      expect(crcFebrero?.total).toBe(300);
      expect(usd?.total).toBe(40);
      expect(montos.some((m) => m.total === 9999)).toBe(false);
    });

    it("ignora los comprobantes sin importe guardado", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      await repo.crear({ ...nuevo, estado: "aceptado" }); // sin total
      expect(await repo.montosPorMoneda(["3101"])).toEqual([]);
    });
  });

  describe("serieDiaria", () => {
    it("cuenta por día natural y ordena de más antiguo a más reciente", async () => {
      const repo = await repoConHistorial();
      const serie = await repo.serieDiaria(["3101"]);
      expect(serie[0]).toEqual({ fecha: "2026-01-10", total: 1 });
      expect(serie.at(-1)?.fecha).toBe("2026-02-14");
      expect(serie.reduce((a, p) => a + p.total, 0)).toBe(6);
    });
  });

  // `reservarConsecutivo`/`liberarConsecutivo` los usa hoy solo `/recibo-pago/
  // enviar` (serie "REP") — la emisión de facturas/tiquetes/notas usa el
  // contador atómico dedicado `ConsecutivoRepository` (D9, ver el describe
  // más abajo) en su lugar.
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

    it("libera el número si la emisión no llegó a Hacienda", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      const n = await repo.reservarConsecutivo(serie);
      expect(await repo.liberarConsecutivo(serie, n)).toBe(true);
      // El siguiente vuelve a ser el mismo: no queda hueco en la serie.
      expect(await repo.reservarConsecutivo(serie)).toBe(n);
    });

    it("no libera si otra emisión ya avanzó el contador", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      const mio = await repo.reservarConsecutivo(serie); // 1
      await repo.reservarConsecutivo(serie); // 2, de otra emisión
      // Devolver el 1 pisaría el 2: el hueco es inevitable.
      expect(await repo.liberarConsecutivo(serie, mio)).toBe(false);
      expect(await repo.reservarConsecutivo(serie)).toBe(3);
    });

    it("proximoConsecutivo no consume el número", async () => {
      const repo = new ComprobanteRepositoryMemoria();
      expect(await repo.proximoConsecutivo(serie)).toBe(1);
      expect(await repo.proximoConsecutivo(serie)).toBe(1);
      expect(await repo.reservarConsecutivo(serie)).toBe(1);
    });
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

describe("SuscripcionRepositoryMemoria", () => {
  const datos = {
    plan: "básico",
    estado: "activa" as const,
    moneda: "CRC",
    ciclo: "mensual" as const,
    iniciaEn: new Date("2026-01-01"),
  };

  it("upsert crea y luego actualiza conservando id y createdAt", async () => {
    const repo = new SuscripcionRepositoryMemoria();
    const creada = await repo.upsert("t1", datos);
    const actualizada = await repo.upsert("t1", { ...datos, plan: "pro", estado: "suspendida" });

    expect(actualizada.id).toBe(creada.id);
    expect(actualizada.createdAt).toEqual(creada.createdAt);
    expect(actualizada.plan).toBe("pro");
    expect(actualizada.estado).toBe("suspendida");
  });

  it("buscarPorTenant devuelve null si el tenant no tiene suscripción", async () => {
    const repo = new SuscripcionRepositoryMemoria();
    expect(await repo.buscarPorTenant("nadie")).toBeNull();
  });

  it("listarTodas incluye las suscripciones de todos los tenants", async () => {
    const repo = new SuscripcionRepositoryMemoria();
    await repo.upsert("t1", datos);
    await repo.upsert("t2", { ...datos, plan: "pro" });
    const todas = await repo.listarTodas();
    expect(todas.map((s) => s.tenantId).sort()).toEqual(["t1", "t2"]);
  });
});

describe("PagoSuscripcionRepositoryMemoria", () => {
  it("crea un pago y lo lista solo para su suscripción", async () => {
    const repo = new PagoSuscripcionRepositoryMemoria();
    await repo.crear({ id: "p1", suscripcionId: "s1", monto: 100, moneda: "CRC", metodo: "transferencia" });
    await repo.crear({ id: "p2", suscripcionId: "s2", monto: 200, moneda: "CRC", metodo: "tarjeta" });

    const deS1 = await repo.listarPorSuscripcion("s1");
    expect(deS1).toHaveLength(1);
    expect(deS1[0]!.id).toBe("p1");
    expect(deS1[0]!.referencia).toBeNull();
  });
});
