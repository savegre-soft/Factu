import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { UsuarioService } from "./usuarioService.js";
import { TenantRepositoryMemoria, UsuarioRepositoryMemoria } from "../../infra/repos/memory.js";
import { Rol, Permiso, rolTienePermiso } from "../../domain/auth/roles.js";

describe("password (scrypt)", () => {
  it("hashea y verifica correctamente", () => {
    const hash = hashPassword("secreto123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("secreto123", hash)).toBe(true);
    expect(verifyPassword("otra", hash)).toBe(false);
  });

  it("produce hashes distintos para la misma contraseña (salt aleatorio)", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });
});

describe("roles y permisos", () => {
  it("admin tiene todos los permisos", () => {
    expect(rolTienePermiso(Rol.Admin, Permiso.GestionarUsuarios)).toBe(true);
    expect(rolTienePermiso(Rol.Admin, Permiso.Emitir)).toBe(true);
  });
  it("facturador emite y lee pero no gestiona usuarios", () => {
    expect(rolTienePermiso(Rol.Facturador, Permiso.Emitir)).toBe(true);
    expect(rolTienePermiso(Rol.Facturador, Permiso.GestionarUsuarios)).toBe(false);
  });
  it("lector solo lee", () => {
    expect(rolTienePermiso(Rol.Lector, Permiso.Leer)).toBe(true);
    expect(rolTienePermiso(Rol.Lector, Permiso.Emitir)).toBe(false);
  });
});

describe("UsuarioService", () => {
  let service: UsuarioService;

  beforeEach(() => {
    service = new UsuarioService(new TenantRepositoryMemoria(), new UsuarioRepositoryMemoria());
  });

  it("registra un tenant con su usuario admin", async () => {
    const { tenant, usuario } = await service.registrar({
      tenantNombre: "Contabilidad X",
      email: "admin@x.cr",
      nombre: "Admin",
      password: "supersecreto",
    });
    expect(tenant.id).toBeTruthy();
    expect(usuario.rol).toBe(Rol.Admin);
    expect(usuario.tenantId).toBe(tenant.id);
  });

  it("no permite registrar dos veces el mismo correo", async () => {
    const datos = { tenantNombre: "X", email: "a@x.cr", nombre: "A", password: "12345678" };
    await service.registrar(datos);
    await expect(service.registrar(datos)).rejects.toThrow(/Ya existe/);
  });

  it("login valida credenciales", async () => {
    await service.registrar({ tenantNombre: "X", email: "a@x.cr", nombre: "A", password: "clave1234" });
    expect(await service.login("a@x.cr", "clave1234")).not.toBeNull();
    expect(await service.login("a@x.cr", "mala")).toBeNull();
    expect(await service.login("nadie@x.cr", "clave1234")).toBeNull();
  });

  it("un admin crea usuarios en su tenant y se listan sin el hash", async () => {
    const { tenant } = await service.registrar({
      tenantNombre: "X", email: "admin@x.cr", nombre: "Admin", password: "clave1234",
    });
    await service.crearUsuario(tenant.id, {
      email: "fact@x.cr", nombre: "Facturador", password: "clave1234", rol: Rol.Facturador,
    });
    const usuarios = await service.listarUsuarios(tenant.id);
    expect(usuarios).toHaveLength(2);
    expect(usuarios[0]).not.toHaveProperty("passwordHash");
  });

  it("aísla usuarios por tenant", async () => {
    const a = await service.registrar({ tenantNombre: "A", email: "a@a.cr", nombre: "A", password: "clave1234" });
    const b = await service.registrar({ tenantNombre: "B", email: "b@b.cr", nombre: "B", password: "clave1234" });
    expect(await service.listarUsuarios(a.tenant.id)).toHaveLength(1);
    expect(await service.listarUsuarios(b.tenant.id)).toHaveLength(1);
  });
});

describe("UsuarioService · gestión", () => {
  let service: UsuarioService;
  let tenantId: string;
  let adminId: string;

  beforeEach(async () => {
    service = new UsuarioService(new TenantRepositoryMemoria(), new UsuarioRepositoryMemoria());
    const { tenant, usuario } = await service.registrar({
      tenantNombre: "X", email: "admin@x.cr", nombre: "Admin", password: "clave1234",
    });
    tenantId = tenant.id;
    adminId = usuario.id;
  });

  /** Crea un facturador de apoyo en el tenant activo. */
  async function crearFacturador() {
    return service.crearUsuario(tenantId, {
      email: "fact@x.cr", nombre: "Facturador", password: "clave1234", rol: Rol.Facturador,
    });
  }

  it("obtiene un usuario del tenant sin el hash", async () => {
    const usuario = await service.obtenerUsuario(tenantId, adminId);
    expect(usuario?.email).toBe("admin@x.cr");
    expect(usuario).not.toHaveProperty("passwordHash");
  });

  it("no expone usuarios de otro tenant", async () => {
    const otro = await service.registrar({
      tenantNombre: "Y", email: "admin@y.cr", nombre: "Otro", password: "clave1234",
    });
    expect(await service.obtenerUsuario(tenantId, otro.usuario.id)).toBeNull();
    expect(await service.actualizarUsuario(tenantId, otro.usuario.id, { nombre: "Hack" })).toBeNull();
    expect(await service.eliminarUsuario(tenantId, otro.usuario.id)).toBe(false);
    // El usuario ajeno sigue intacto.
    expect((await service.obtenerUsuario(otro.tenant.id, otro.usuario.id))?.nombre).toBe("Otro");
  });

  it("actualiza nombre y rol", async () => {
    const fact = await crearFacturador();
    const actualizado = await service.actualizarUsuario(tenantId, fact.id, {
      nombre: "Nuevo nombre", rol: Rol.Lector,
    });
    expect(actualizado?.nombre).toBe("Nuevo nombre");
    expect(actualizado?.rol).toBe(Rol.Lector);
  });

  it("cambia la contraseña y el login usa la nueva", async () => {
    await service.cambiarPassword(tenantId, adminId, "clavenueva1");
    expect(await service.login("admin@x.cr", "clave1234")).toBeNull();
    expect(await service.login("admin@x.cr", "clavenueva1")).not.toBeNull();
  });

  it("elimina un usuario del tenant", async () => {
    const fact = await crearFacturador();
    expect(await service.eliminarUsuario(tenantId, fact.id)).toBe(true);
    expect(await service.obtenerUsuario(tenantId, fact.id)).toBeNull();
    expect(await service.listarUsuarios(tenantId)).toHaveLength(1);
  });

  it("devuelve null/false ante un id inexistente", async () => {
    expect(await service.obtenerUsuario(tenantId, "no-existe")).toBeNull();
    expect(await service.actualizarUsuario(tenantId, "no-existe", { nombre: "X" })).toBeNull();
    expect(await service.cambiarPassword(tenantId, "no-existe", "clave1234")).toBeNull();
    expect(await service.eliminarUsuario(tenantId, "no-existe")).toBe(false);
  });

  it("protege al único admin: no se puede degradar ni eliminar", async () => {
    await expect(service.actualizarUsuario(tenantId, adminId, { rol: Rol.Lector })).rejects.toThrow(/único administrador/);
    await expect(service.eliminarUsuario(tenantId, adminId)).rejects.toThrow(/único administrador/);
    expect((await service.obtenerUsuario(tenantId, adminId))?.rol).toBe(Rol.Admin);
  });

  it("permite degradar o eliminar un admin si queda otro", async () => {
    const segundo = await service.crearUsuario(tenantId, {
      email: "admin2@x.cr", nombre: "Admin 2", password: "clave1234", rol: Rol.Admin,
    });
    const degradado = await service.actualizarUsuario(tenantId, segundo.id, { rol: Rol.Lector });
    expect(degradado?.rol).toBe(Rol.Lector);
    // Con el segundo ya degradado, el primero vuelve a ser el único admin.
    await expect(service.eliminarUsuario(tenantId, adminId)).rejects.toThrow(/único administrador/);
  });

  it("cambiar solo el nombre del único admin no lo bloquea", async () => {
    const actualizado = await service.actualizarUsuario(tenantId, adminId, { nombre: "Admin renombrado" });
    expect(actualizado?.nombre).toBe("Admin renombrado");
    expect(actualizado?.rol).toBe(Rol.Admin);
  });
});
