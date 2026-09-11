/**
 * E2E de `/plataforma/*` (panel interno de Savegre Center) contra un servidor
 * real levantado en proceso (`PERSISTENCIA=memoria`) — mismo flujo que se
 * verificó a mano con curl contra Postgres real antes de esta suite, pero
 * automatizado y hermético (sin depender de una base de datos externa).
 *
 * Cubre, en particular, la separación estructural entre `app.requierePlataforma`
 * y `app.authenticate`/`requierePermiso`: una credencial de plataforma nunca
 * debe autenticar una ruta de tenant, y viceversa.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import type { FastifyInstance } from "fastify";

process.env.PERSISTENCIA ??= "memoria";
process.env.NODE_ENV ??= "test";

let app: FastifyInstance;
let baseURL: string;
let api: APIRequestContext;
let tenantId: string;

test.beforeAll(async () => {
  const { buildServer } = await import("../src/server.js");
  const { tenantRepository } = await import("../src/infra/repos/index.js");
  const { credencialPlataformaService } = await import("../src/services/plataforma/index.js");

  app = buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("No se pudo obtener el puerto del servidor");
  baseURL = `http://127.0.0.1:${address.port}`;

  const tenant = await tenantRepository.crear({ id: "e2e-tenant", nombre: "E2E Tenant" });
  tenantId = tenant.id;

  const { secreto } = await credencialPlataformaService.crear({ label: "Playwright E2E" });
  api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${secreto}` },
  });
});

test.afterAll(async () => {
  await api?.dispose();
  await app?.close();
});

test.describe("GET /plataforma/tenants", () => {
  test("lista el tenant creado, con su suscripción por defecto", async () => {
    const res = await api.get("/plataforma/tenants");
    expect(res.status()).toBe(200);
    const tenants = await res.json();
    const propio = tenants.find((t: { id: string }) => t.id === tenantId);
    expect(propio).toBeTruthy();
    expect(propio.suscripcion).toEqual({ plan: "sin definir", estado: "activa" });
  });
});

test.describe("suscripción y pagos de un tenant", () => {
  test("PUT actualiza plan/estado; GET detalle lo refleja", async () => {
    const put = await api.put(`/plataforma/tenants/${tenantId}/suscripcion`, {
      data: {
        plan: "pro",
        estado: "activa",
        moneda: "CRC",
        ciclo: "mensual",
        iniciaEn: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(put.status()).toBe(200);
    expect((await put.json()).plan).toBe("pro");

    const detalle = await api.get(`/plataforma/tenants/${tenantId}`);
    expect(detalle.status()).toBe(200);
    const body = await detalle.json();
    expect(body.suscripcion.plan).toBe("pro");
    expect(body.tenant.id).toBe(tenantId);
  });

  test("POST registra un pago; aparece en el historial", async () => {
    const post = await api.post(`/plataforma/tenants/${tenantId}/suscripcion/pagos`, {
      data: { monto: 1000, moneda: "CRC", metodo: "transferencia", referencia: "e2e-1" },
    });
    expect(post.status()).toBe(201);
    expect((await post.json()).referencia).toBe("e2e-1");

    const lista = await api.get(`/plataforma/tenants/${tenantId}/suscripcion/pagos`);
    const pagos = await lista.json();
    expect(pagos).toHaveLength(1);
    expect(pagos[0].referencia).toBe("e2e-1");
  });

  test("un tenant inexistente responde 404 en todas las sub-rutas", async () => {
    expect((await api.get("/plataforma/tenants/no-existe")).status()).toBe(404);
    expect((await api.get("/plataforma/tenants/no-existe/suscripcion")).status()).toBe(404);
    expect(
      (
        await api.put("/plataforma/tenants/no-existe/suscripcion", {
          data: {
            plan: "x",
            estado: "activa",
            moneda: "CRC",
            ciclo: "mensual",
            iniciaEn: "2026-01-01T00:00:00.000Z",
          },
        })
      ).status(),
    ).toBe(404);
  });
});

test.describe("separación estructural de guardas", () => {
  test("una credencial de plataforma NO autentica una ruta de tenant (/auditoria)", async () => {
    const res = await api.get("/auditoria");
    expect(res.status()).toBe(401);
  });

  test("sin token, /plataforma/tenants responde 401", async () => {
    const anon = await playwrightRequest.newContext({ baseURL });
    const res = await anon.get("/plataforma/tenants");
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test("un Bearer con forma de ApiKey de tenant (prefijo factu_) no pasa requierePlataforma", async () => {
    const fake = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: "Bearer factu_algo.inventado" },
    });
    const res = await fake.get("/plataforma/tenants");
    expect(res.status()).toBe(401);
    await fake.dispose();
  });
});
