import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebhookService } from "./webhookService.js";
import {
  WebhookRepositoryMemoria,
  WebhookEntregaRepositoryMemoria,
} from "../../infra/repos/memory.js";

const MASTER = "clave-maestra-de-prueba";

function armar() {
  const hooks = new WebhookRepositoryMemoria();
  const entregas = new WebhookEntregaRepositoryMemoria();
  const svc = new WebhookService(hooks, entregas, MASTER, { habilitado: true, maxIntentos: 3 });
  return { svc, hooks, entregas };
}

describe("WebhookService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("entrega firmado (HMAC) al webhook suscrito y audita como enviado", async () => {
    const { svc } = armar();
    const hook = await svc.crear("t1", {
      url: "https://ext.example/hook",
      secret: "s3cr3t",
      eventos: ["comprobante.aceptado"],
      activo: true,
    });
    expect(hook.tieneSecret).toBe(true);

    const resultado = await svc.probar("t1", hook.id);
    expect(resultado?.estado).toBe("enviado");
    expect(resultado?.statusCode).toBe(200);

    const [, opciones] = fetchMock.mock.calls[0]!;
    expect(opciones.method).toBe("POST");
    expect(opciones.headers["X-Factu-Signature"]).toMatch(/^sha256=/);
    expect(opciones.headers["X-Factu-Event"]).toBe("webhook.prueba");
  });

  it("solo dispara a los webhooks suscritos al evento", async () => {
    const { svc, entregas } = armar();
    const hook = await svc.crear("t1", {
      url: "https://ext.example/hook",
      eventos: ["comprobante.aceptado"],
      activo: true,
    });

    await svc.emitir("t1", "documento.recibido", { x: 1 }); // no suscrito
    expect(await svc.historial("t1", hook.id)).toHaveLength(0);

    await svc.emitir("t1", "comprobante.aceptado", { clave: "50601..." });
    const hist = await svc.historial("t1", hook.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.evento).toBe("comprobante.aceptado");
    void entregas;
  });

  it("registra fallo (HTTP 500) y el poller reintenta con éxito", async () => {
    const { svc } = armar();
    const hook = await svc.crear("t1", {
      url: "https://ext.example/hook",
      eventos: ["comprobante.aceptado"],
      activo: true,
    });

    fetchMock.mockResolvedValueOnce({ status: 500 });
    const r1 = await svc.probar("t1", hook.id);
    expect(r1?.estado).toBe("fallido");
    expect(r1?.statusCode).toBe(500);

    // El poller reintenta; ahora responde 200.
    await svc.reintentarPendientes();
    const hist = await svc.historial("t1", hook.id);
    expect(hist[0]!.estado).toBe("enviado");
    expect(hist[0]!.intentos).toBe(2);
  });

  it("no dispara si el evento no está habilitado globalmente", async () => {
    const hooks = new WebhookRepositoryMemoria();
    const entregas = new WebhookEntregaRepositoryMemoria();
    const svc = new WebhookService(hooks, entregas, MASTER, { habilitado: false, maxIntentos: 3 });
    const hook = await svc.crear("t1", {
      url: "https://ext.example/hook",
      eventos: ["comprobante.aceptado"],
      activo: true,
    });
    await svc.emitir("t1", "comprobante.aceptado", {});
    expect(await svc.historial("t1", hook.id)).toHaveLength(0);
  });
});
