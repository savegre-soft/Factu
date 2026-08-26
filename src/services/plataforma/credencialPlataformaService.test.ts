import { describe, it, expect } from "vitest";
import { CredencialPlataformaService, CREDENCIAL_PLATAFORMA_PREFIJO } from "./credencialPlataformaService.js";
import { CredencialPlataformaRepositoryMemoria } from "../../infra/repos/memory.js";

function servicio() {
  return new CredencialPlataformaService(new CredencialPlataformaRepositoryMemoria());
}

describe("CredencialPlataformaService", () => {
  it("crea una credencial: devuelve el secreto una vez y no expone el hash", async () => {
    const svc = servicio();
    const { credencial, secreto } = await svc.crear({ label: "Savegre Center" });

    expect(secreto.startsWith(CREDENCIAL_PLATAFORMA_PREFIJO)).toBe(true);
    expect(secreto).toContain(".");
    expect(credencial.label).toBe("Savegre Center");
    expect("secretHash" in credencial).toBe(false);
  });

  it("autentica con el secreto correcto y resuelve un principal sin tenantId ni rol", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear({ label: "Savegre Center" });

    const principal = await svc.autenticar(secreto);
    expect(principal).not.toBeNull();
    expect(principal!.kind).toBe("plataforma");
    expect(principal!.label).toBe("Savegre Center");
    expect("tenantId" in principal!).toBe(false);
    expect("rol" in principal!).toBe(false);
  });

  it("rechaza un secreto incorrecto, mal formado, o con el prefijo de ApiKey de tenant", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear({ label: "Savegre Center" });

    expect(await svc.autenticar(secreto + "x")).toBeNull();
    expect(await svc.autenticar("platform_desconocido.secreto")).toBeNull();
    expect(await svc.autenticar("factu_algunaApiKeyDeTenant.secreto")).toBeNull();
    expect(await svc.autenticar("otra-cosa")).toBeNull();
  });

  it("una credencial revocada deja de autenticar", async () => {
    const svc = servicio();
    const { credencial, secreto } = await svc.crear({ label: "Savegre Center" });

    expect(await svc.autenticar(secreto)).not.toBeNull();
    expect(await svc.revocar(credencial.id)).toBe(true);
    expect(await svc.autenticar(secreto)).toBeNull();
  });

  it("una credencial expirada no autentica", async () => {
    const svc = servicio();
    const { secreto } = await svc.crear({ label: "Savegre Center", expiresAt: new Date(Date.now() - 1000) });
    expect(await svc.autenticar(secreto)).toBeNull();
  });
});
