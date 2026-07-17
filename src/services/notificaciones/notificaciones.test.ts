import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NotificacionesService } from "./notificacionesService.js";
import { ProviderRegistry } from "./registry.js";
import { TwilioSmsProvider } from "./providers/twilioSms.js";
import { Bitrix24Provider } from "./providers/bitrix24.js";
import type { MensajeSaliente, NotificationProvider, ProviderResult } from "./tipos.js";
import {
  NotificationChannelRepositoryMemoria,
  NotificationMessageRepositoryMemoria,
} from "../../infra/repos/memory.js";

const MASTER = "clave-maestra-de-prueba";

/** Proveedor de prueba controlable, en el canal "slack" (config: webhookUrl). */
class FakeProvider implements NotificationProvider {
  readonly clave = "slack" as const;
  readonly canal = "slack" as const;
  readonly nombre = "Fake";
  readonly campos = [{ clave: "webhookUrl", etiqueta: "URL", tipo: "url" as const, requerido: true }];
  resultado: ProviderResult = { ok: true, respuesta: { ok: true } };
  enviados: MensajeSaliente[] = [];
  async enviar(mensaje: MensajeSaliente): Promise<ProviderResult> {
    this.enviados.push(mensaje);
    return this.resultado;
  }
}

function armar(fake = new FakeProvider()) {
  const canales = new NotificationChannelRepositoryMemoria();
  const mensajes = new NotificationMessageRepositoryMemoria();
  const registry = new ProviderRegistry();
  registry.registrar(fake);
  const svc = new NotificacionesService(canales, mensajes, registry, MASTER, {
    habilitado: true,
    maxIntentos: 3,
  });
  return { svc, canales, mensajes, fake };
}

async function crearCanal(svc: NotificacionesService, eventos: string[]) {
  return svc.crear("t1", {
    tipo: "slack",
    proveedor: "slack",
    nombre: "Alertas",
    config: { webhookUrl: "https://hooks.slack.com/x" },
    eventos,
    activo: true,
  });
}

describe("NotificacionesService", () => {
  it("entrega al canal suscrito y lo marca como enviado (sin exponer config)", async () => {
    const { svc, fake } = armar();
    const canal = await crearCanal(svc, ["comprobante.aceptado"]);
    expect(canal).not.toHaveProperty("configSellado");

    await svc.emitir("t1", "comprobante.aceptado", { clave: "506...", consecutivo: "00100001" });
    const hist = await svc.historial("t1", { canalId: canal.id });
    expect(hist).toHaveLength(1);
    expect(hist[0]!.estado).toBe("enviado");
    expect(fake.enviados[0]!.contenido).toContain("ACEPTADO");
  });

  it("solo dispara a los canales suscritos al evento", async () => {
    const { svc } = armar();
    const canal = await crearCanal(svc, ["comprobante.aceptado"]);
    await svc.emitir("t1", "documento.recibido", { clave: "x" });
    expect(await svc.historial("t1", { canalId: canal.id })).toHaveLength(0);
  });

  it("reintenta con backoff ante un fallo reintentable y luego se envía", async () => {
    const { svc, mensajes, fake } = armar();
    const canal = await crearCanal(svc, ["comprobante.aceptado"]);

    fake.resultado = { ok: false, error: "HTTP 500", reintentable: true };
    await svc.emitir("t1", "comprobante.aceptado", { clave: "x" });
    let hist = await svc.historial("t1", { canalId: canal.id });
    expect(hist[0]!.estado).toBe("reintentando");
    expect(hist[0]!.proximoIntentoAt).not.toBeNull();

    // Simula que venció la espera del backoff y que el proveedor ya responde ok.
    await mensajes.actualizar(hist[0]!.id, { proximoIntentoAt: new Date(Date.now() - 1000) });
    fake.resultado = { ok: true };
    await svc.reintentarPendientes();
    hist = await svc.historial("t1", { canalId: canal.id });
    expect(hist[0]!.estado).toBe("enviado");
    expect(hist[0]!.intentos).toBe(2);
  });

  it("un error definitivo (no reintentable) marca fallido de inmediato", async () => {
    const { svc, fake } = armar();
    const canal = await crearCanal(svc, ["comprobante.aceptado"]);
    fake.resultado = { ok: false, error: "Número inválido", reintentable: false };
    await svc.emitir("t1", "comprobante.aceptado", { clave: "x" });
    const hist = await svc.historial("t1", { canalId: canal.id });
    expect(hist[0]!.estado).toBe("fallido");
    expect(hist[0]!.proximoIntentoAt).toBeNull();
  });

  it("rechaza crear un canal con campos de configuración faltantes", async () => {
    const { svc } = armar();
    await expect(
      svc.crear("t1", { tipo: "slack", proveedor: "slack", nombre: "X", config: {}, eventos: ["comprobante.aceptado"], activo: true }),
    ).rejects.toThrow(/Faltan campos/);
  });
});

describe("TwilioSmsProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ sid: "SM123" }) }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hace POST con auth Basic y parsea el SID", async () => {
    const provider = new TwilioSmsProvider();
    const res = await provider.enviar(
      { evento: "x", contenido: "Hola", datos: {} },
      { accountSid: "AC1", authToken: "tok", from: "+15005550006", to: "+50688888888" },
    );
    expect(res.ok).toBe(true);
    expect(res.proveedorMensajeId).toBe("SM123");
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/Accounts/AC1/Messages.json");
    expect(opciones.headers.Authorization).toMatch(/^Basic /);
  });
});

describe("Bitrix24Provider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: 42 }) }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("llama im.notify.system.add con USER_ID y MESSAGE", async () => {
    const provider = new Bitrix24Provider();
    const res = await provider.enviar(
      { evento: "x", contenido: "Hola", datos: {} },
      { webhookUrl: "https://p.bitrix24.com/rest/1/tok/", userId: "7" },
    );
    expect(res.ok).toBe(true);
    const [url, opciones] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://p.bitrix24.com/rest/1/tok/im.notify.system.add.json");
    expect(opciones.body.toString()).toContain("USER_ID=7");
    expect(res.destino).toBe("Bitrix24 #7");
  });
});
