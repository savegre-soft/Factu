import { describe, it, expect } from "vitest";
import { SuscripcionService } from "./suscripcionService.js";
import { SuscripcionRepositoryMemoria, PagoSuscripcionRepositoryMemoria } from "../../infra/repos/memory.js";

function servicio() {
  return new SuscripcionService(new SuscripcionRepositoryMemoria(), new PagoSuscripcionRepositoryMemoria());
}

describe("SuscripcionService", () => {
  it("un tenant sin fila propia se trata como 'activa' (no bloqueado)", async () => {
    const svc = servicio();
    const suscripcion = await svc.obtener("sin-suscripcion");
    expect(suscripcion.estado).toBe("activa");
    expect(suscripcion.tenantId).toBe("sin-suscripcion");
  });

  it("actualizar crea/reemplaza la suscripción real del tenant", async () => {
    const svc = servicio();
    const suscripcion = await svc.actualizar("t1", {
      plan: "pro",
      estado: "suspendida",
      moneda: "USD",
      ciclo: "anual",
      iniciaEn: new Date("2026-01-01"),
    });
    expect(suscripcion.plan).toBe("pro");
    expect((await svc.obtener("t1")).estado).toBe("suspendida");
  });

  it("registrarPago materializa una suscripción por defecto si el tenant no tenía una", async () => {
    const svc = servicio();
    const pago = await svc.registrarPago("t2", { monto: 5000, moneda: "CRC", metodo: "transferencia" });

    expect(pago.monto).toBe(5000);
    const pagos = await svc.listarPagos("t2");
    expect(pagos).toHaveLength(1);
    expect(pagos[0]!.id).toBe(pago.id);
  });

  it("listarPagos devuelve vacío si el tenant no tiene suscripción ni pagos", async () => {
    const svc = servicio();
    expect(await svc.listarPagos("nadie")).toEqual([]);
  });

  it("mapaPorTenant solo incluye tenants con fila propia", async () => {
    const svc = servicio();
    await svc.actualizar("t1", {
      plan: "básico",
      estado: "activa",
      moneda: "CRC",
      ciclo: "mensual",
      iniciaEn: new Date("2026-01-01"),
    });
    const mapa = await svc.mapaPorTenant();
    expect(mapa.has("t1")).toBe(true);
    expect(mapa.has("t2-nunca-tocado")).toBe(false);
  });
});
