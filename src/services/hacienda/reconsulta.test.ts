import { describe, it, expect, vi } from "vitest";
import { ReconsultaService } from "./reconsulta.js";
import {
  ComprobanteRepositoryMemoria,
  EmisorRepositoryMemoria,
} from "../../infra/repos/memory.js";
import type { EstadoResult } from "./reception.js";

/** Comprobante base para poblar el repositorio. */
const BASE = {
  cedulaEmisor: "3101123456",
  tipo: "FE",
  consecutivo: "00100001010000000001",
  estado: "recibido",
};

function estado(valor: EstadoResult["estado"], clave = "1".repeat(50)): EstadoResult {
  return { clave, estado: valor, respuestaXml: "<Mensaje/>", raw: {} };
}

/** Monta el servicio con repositorios reales en memoria y dobles inyectados. */
async function montar(opciones: {
  pendientes: Array<Partial<typeof BASE> & { clave: string; estado?: string }>;
  consultarEstado: ReturnType<typeof vi.fn>;
  getAccessToken?: ReturnType<typeof vi.fn>;
}) {
  const comprobantes = new ComprobanteRepositoryMemoria();
  const emisores = new EmisorRepositoryMemoria();
  await emisores.upsert({ cedula: BASE.cedulaEmisor, tenantId: "t1", nombre: "Empresa X" });
  for (const p of opciones.pendientes) {
    await comprobantes.crear({ ...BASE, ...p });
  }

  const alResolver = vi.fn();
  const servicio = new ReconsultaService({
    comprobantes,
    emisores,
    cliente: { consultarEstado: opciones.consultarEstado },
    tokens: { getAccessToken: opciones.getAccessToken ?? vi.fn().mockResolvedValue("AT") },
    alResolver,
  });
  return { servicio, comprobantes, alResolver };
}

describe("ReconsultaService", () => {
  it("cierra el comprobante cuando Hacienda ya tiene veredicto", async () => {
    const clave = "1".repeat(50);
    const { servicio, comprobantes, alResolver } = await montar({
      pendientes: [{ clave }],
      consultarEstado: vi.fn().mockResolvedValue(estado("aceptado", clave)),
    });

    const r = await servicio.barrer();

    expect(r).toEqual({ revisados: 1, resueltos: 1, omitidos: 0 });
    const guardado = await comprobantes.buscar(clave);
    expect(guardado?.estado).toBe("aceptado");
    expect(guardado?.respuestaXml).toBe("<Mensaje/>");
    // Los efectos de la emisión (webhook, notificación, entrega) se disparan
    // igual aunque el veredicto llegue tarde.
    expect(alResolver).toHaveBeenCalledWith(
      expect.objectContaining({ clave, estado: "aceptado", tenantId: "t1" }),
    );
  });

  it("deja en paz a los que Hacienda todavía está procesando", async () => {
    const clave = "1".repeat(50);
    const { servicio, comprobantes, alResolver } = await montar({
      pendientes: [{ clave }],
      consultarEstado: vi.fn().mockResolvedValue(estado("procesando", clave)),
    });

    const r = await servicio.barrer();

    expect(r).toEqual({ revisados: 1, resueltos: 0, omitidos: 1 });
    expect(await comprobantes.buscar(clave).then((c) => c?.estado)).toBe("recibido");
    expect(alResolver).not.toHaveBeenCalled();
  });

  it("no toca los que ya están resueltos", async () => {
    const consultarEstado = vi.fn();
    const { servicio } = await montar({
      pendientes: [
        { clave: "1".repeat(50), estado: "aceptado" },
        { clave: "2".repeat(50), estado: "rechazado" },
      ],
      consultarEstado,
    });

    expect(await servicio.barrer()).toEqual({ revisados: 0, resueltos: 0, omitidos: 0 });
    expect(consultarEstado).not.toHaveBeenCalled();
  });

  it("sin sesión del emisor lo salta y sigue con los demás", async () => {
    const { servicio, comprobantes } = await montar({
      pendientes: [{ clave: "1".repeat(50) }, { clave: "2".repeat(50) }],
      consultarEstado: vi.fn().mockResolvedValue(estado("aceptado", "2".repeat(50))),
      getAccessToken: vi
        .fn()
        .mockRejectedValueOnce(new Error("No hay sesión"))
        .mockResolvedValue("AT"),
    });

    const r = await servicio.barrer();

    // El primero queda pendiente para el próximo barrido; el segundo se resuelve.
    expect(r.omitidos).toBe(1);
    expect(r.resueltos).toBe(1);
    expect(await comprobantes.buscar("1".repeat(50)).then((c) => c?.estado)).toBe("recibido");
  });

  it("un fallo consultando no frena el barrido", async () => {
    const { servicio } = await montar({
      pendientes: [{ clave: "1".repeat(50) }, { clave: "2".repeat(50) }],
      consultarEstado: vi
        .fn()
        .mockRejectedValueOnce(new Error("Hacienda 500"))
        .mockResolvedValue(estado("rechazado", "2".repeat(50))),
    });

    const r = await servicio.barrer();
    expect(r.revisados).toBe(2);
    expect(r.resueltos).toBe(1);
    expect(r.omitidos).toBe(1);
  });

  it("respeta el límite de comprobantes por barrido", async () => {
    const consultarEstado = vi.fn().mockResolvedValue(estado("procesando"));
    const { servicio } = await montar({
      pendientes: Array.from({ length: 5 }, (_, i) => ({ clave: String(i).repeat(50) })),
      consultarEstado,
    });

    const r = await servicio.barrer(2);
    expect(r.revisados).toBe(2);
    expect(consultarEstado).toHaveBeenCalledTimes(2);
  });
});
