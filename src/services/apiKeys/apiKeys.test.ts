import { describe, it, expect } from "vitest";
import { ApiKeyService, API_KEY_PREFIJO } from "./apiKeyService.js";
import { ApiKeyRepositoryMemoria } from "../../infra/repos/memory.js";
import { Rol } from "../../domain/auth/roles.js";

function servicio() {
  return new ApiKeyService(new ApiKeyRepositoryMemoria());
}

describe("ApiKeyService", () => {
  it("crea una key: devuelve el secreto una vez y no expone el hash", async () => {
    const svc = servicio();
    const { apiKey, secreto } = await svc.crear("t1", { label: "ERP", rol: Rol.Facturador });

    expect(secreto.startsWith(API_KEY_PREFIJO)).toBe(true);
    expect(secreto).toContain(".");
    expect(apiKey.label).toBe("ERP");
    expect(apiKey.rol).toBe(Rol.Facturador);
    expect("secretHash" in apiKey).toBe(false);
  });

  it("autentica con el secreto correcto y resuelve el principal de servicio", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear("t1", {
      label: "ERP",
      rol: Rol.Facturador,
      emisoresPermitidos: ["3101123456"],
    });

    const principal = await svc.autenticar(secreto);
    expect(principal).not.toBeNull();
    expect(principal!.tenantId).toBe("t1");
    expect(principal!.rol).toBe(Rol.Facturador);
    expect(principal!.kind).toBe("service");
    expect(principal!.emisores).toEqual(["3101123456"]);
  });

  it("rechaza un secreto incorrecto o mal formado", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear("t1", { label: "ERP", rol: Rol.Facturador });

    expect(await svc.autenticar(secreto + "x")).toBeNull();
    expect(await svc.autenticar("factu_desconocido.secreto")).toBeNull();
    expect(await svc.autenticar("otra-cosa")).toBeNull();
  });

  it("una key revocada deja de autenticar", async () => {
    const svc = servicio();
    const { apiKey, secreto } = await svc.crear("t1", { label: "ERP", rol: Rol.Facturador });

    expect(await svc.autenticar(secreto)).not.toBeNull();
    expect(await svc.revocar("t1", apiKey.id)).toBe(true);
    expect(await svc.autenticar(secreto)).toBeNull();
  });

  it("no revoca una key de otro tenant", async () => {
    const svc = servicio();
    const { apiKey } = await svc.crear("t1", { label: "ERP", rol: Rol.Facturador });
    expect(await svc.revocar("otro-tenant", apiKey.id)).toBe(false);
  });

  it("una key expirada no autentica", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear("t1", {
      label: "ERP",
      rol: Rol.Facturador,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await svc.autenticar(secreto)).toBeNull();
  });
});
