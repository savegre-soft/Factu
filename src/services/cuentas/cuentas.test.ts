import { describe, it, expect } from "vitest";
import { CuentaService } from "./cuentaService.js";
import { PasswordResetService } from "./passwordResetService.js";
import type { CorreoPlataforma, MailerPlataforma } from "./mailerPlataforma.js";
import type { PerfilOAuth } from "./oauthProviders.js";
import type { EstadoOAuth } from "./estado.js";
import { verifyPassword } from "../usuarios/password.js";
import {
  TenantRepositoryMemoria,
  UsuarioRepositoryMemoria,
  OAuthIdentityRepositoryMemoria,
  PasswordResetRepositoryMemoria,
} from "../../infra/repos/memory.js";
import { Rol } from "../../domain/auth/roles.js";

const LOGIN: EstadoOAuth = { intent: "login", exp: Date.now() + 60_000 };

function perfil(over: Partial<PerfilOAuth> = {}): PerfilOAuth {
  return { sub: "sub-1", email: "ana@x.cr", emailVerificado: true, nombre: "Ana", ...over };
}

function armarCuentas() {
  const tenants = new TenantRepositoryMemoria();
  const usuarios = new UsuarioRepositoryMemoria();
  const identidades = new OAuthIdentityRepositoryMemoria();
  const svc = new CuentaService(tenants, usuarios, identidades);
  return { svc, tenants, usuarios, identidades };
}

describe("CuentaService (OAuth)", () => {
  it("correo nuevo: crea organización + admin sin contraseña + identidad", async () => {
    const { svc, usuarios, identidades } = armarCuentas();
    const { usuario, creada } = await svc.resolverOAuth("google", perfil(), LOGIN);
    expect(creada).toBe(true);
    expect(usuario.rol).toBe(Rol.Admin);
    expect(usuario.passwordHash).toBe("");
    expect(await usuarios.buscarPorEmail("ana@x.cr")).not.toBeNull();
    expect(await identidades.buscarPorProviderSub("google", "sub-1")).not.toBeNull();
  });

  it("identidad ya vinculada: inicia sesión con el mismo usuario", async () => {
    const { svc } = armarCuentas();
    const primero = await svc.resolverOAuth("google", perfil(), LOGIN);
    const segundo = await svc.resolverOAuth("google", perfil(), LOGIN);
    expect(segundo.creada).toBe(false);
    expect(segundo.usuario.id).toBe(primero.usuario.id);
  });

  it("correo existente verificado: se vincula automáticamente", async () => {
    const { svc, usuarios } = armarCuentas();
    const existente = await usuarios.crear({
      id: "u1", tenantId: "t1", email: "ana@x.cr", nombre: "Ana", passwordHash: "scrypt$a$b", rol: Rol.Admin,
    });
    const { usuario, creada } = await svc.resolverOAuth("google", perfil(), LOGIN);
    expect(creada).toBe(false);
    expect(usuario.id).toBe(existente.id);
  });

  it("vincular (link) adjunta la identidad al usuario autenticado", async () => {
    const { svc, usuarios, identidades } = armarCuentas();
    const u = await usuarios.crear({
      id: "u1", tenantId: "t1", email: "b@x.cr", nombre: "B", passwordHash: "scrypt$a$b", rol: Rol.Admin,
    });
    const estadoLink: EstadoOAuth = { intent: "link", userId: u.id, exp: Date.now() + 60_000 };
    await svc.resolverOAuth("microsoft", perfil({ sub: "ms-9", email: "otro@x.cr" }), estadoLink);
    const ids = await identidades.listarPorUsuario(u.id);
    expect(ids.map((i) => i.provider)).toContain("microsoft");
  });

  it("vincular una identidad que ya es de otro usuario falla", async () => {
    const { svc, usuarios } = armarCuentas();
    await svc.resolverOAuth("google", perfil(), LOGIN); // identidad de Ana
    const otro = await usuarios.crear({
      id: "u2", tenantId: "t2", email: "c@x.cr", nombre: "C", passwordHash: "scrypt$a$b", rol: Rol.Admin,
    });
    const estadoLink: EstadoOAuth = { intent: "link", userId: otro.id, exp: Date.now() + 60_000 };
    await expect(svc.resolverOAuth("google", perfil(), estadoLink)).rejects.toThrow(/otro usuario/);
  });

  it("no permite desvincular la única forma de acceso (sin contraseña)", async () => {
    const { svc } = armarCuentas();
    const { usuario } = await svc.resolverOAuth("google", perfil(), LOGIN); // sin contraseña
    await expect(svc.desvincular(usuario.id, "google")).rejects.toThrow(/única forma de acceso/);
  });
});

class FakeMailer implements MailerPlataforma {
  enviados: CorreoPlataforma[] = [];
  disponibleValor = true;
  disponible() {
    return this.disponibleValor;
  }
  async enviar(m: CorreoPlataforma) {
    this.enviados.push(m);
  }
}

function armarReset() {
  const usuarios = new UsuarioRepositoryMemoria();
  const resets = new PasswordResetRepositoryMemoria();
  const mailer = new FakeMailer();
  const svc = new PasswordResetService(usuarios, resets, mailer, 15);
  return { svc, usuarios, resets, mailer };
}

describe("PasswordResetService", () => {
  it("envía un código y permite fijar la nueva contraseña", async () => {
    const { svc, usuarios, mailer } = armarReset();
    await usuarios.crear({
      id: "u1", tenantId: "t1", email: "ana@x.cr", nombre: "Ana", passwordHash: "scrypt$a$b", rol: Rol.Admin,
    });

    await svc.solicitar("ana@x.cr");
    expect(mailer.enviados).toHaveLength(1);
    const codigo = mailer.enviados[0]!.html.match(/(\d{6})/)![1]!;

    await svc.resetear("ana@x.cr", codigo, "nuevaClave123");
    const actualizado = await usuarios.buscarPorEmail("ana@x.cr");
    expect(verifyPassword("nuevaClave123", actualizado!.passwordHash)).toBe(true);
  });

  it("un código incorrecto no cambia la contraseña", async () => {
    const { svc, usuarios, mailer } = armarReset();
    await usuarios.crear({
      id: "u1", tenantId: "t1", email: "ana@x.cr", nombre: "Ana", passwordHash: "scrypt$a$b", rol: Rol.Admin,
    });
    await svc.solicitar("ana@x.cr");
    const real = mailer.enviados[0]!.html.match(/(\d{6})/)![1]!;
    const incorrecto = String((Number(real) + 1) % 1_000_000).padStart(6, "0");
    await expect(svc.resetear("ana@x.cr", incorrecto, "x")).rejects.toThrow(/inválido o venció/);
  });

  it("no revela ni envía nada si el correo no existe", async () => {
    const { svc, mailer } = armarReset();
    await expect(svc.solicitar("nadie@x.cr")).resolves.toBeUndefined();
    expect(mailer.enviados).toHaveLength(0);
  });
});
