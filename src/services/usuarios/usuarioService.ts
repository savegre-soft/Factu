/**
 * Servicio de usuarios y tenants (control de acceso).
 *
 * - `registrar`: crea un tenant nuevo y su primer usuario (rol admin).
 * - `login`: valida credenciales y devuelve el usuario.
 * - `crearUsuario`: un admin agrega usuarios a su tenant.
 * - `obtener` / `actualizar` / `cambiarPassword` / `eliminar`: gestión del ciclo
 *   de vida, siempre acotada al tenant del admin que actúa.
 *
 * Las operaciones sobre un usuario concreto reciben el `tenantId` de quien actúa
 * y devuelven `null` si el usuario no existe o vive en otro tenant: así el
 * aislamiento multi-tenant no depende de que cada ruta lo recuerde.
 */
import { randomUUID } from "node:crypto";
import { Rol } from "../../domain/auth/roles.js";
import { hashPassword, verifyPassword } from "./password.js";
import type {
  TenantRecord,
  TenantRepository,
  UsuarioRecord,
  UsuarioRepository,
} from "../../infra/repos/types.js";

/** Usuario tal como se expone en la API (nunca incluye el hash). */
export type UsuarioPublico = Omit<UsuarioRecord, "passwordHash">;

export interface CambiosUsuario {
  nombre?: string;
  rol?: Rol;
}

function sinHash(usuario: UsuarioRecord): UsuarioPublico {
  const { passwordHash: _omit, ...resto } = usuario;
  return resto;
}

export interface DatosRegistro {
  tenantNombre: string;
  email: string;
  nombre: string;
  password: string;
}

export interface DatosNuevoUsuario {
  email: string;
  nombre: string;
  password: string;
  rol: Rol;
}

export class UsuarioService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly usuarios: UsuarioRepository,
  ) {}

  /** Crea un tenant y su usuario administrador inicial. */
  async registrar(datos: DatosRegistro): Promise<{ tenant: TenantRecord; usuario: UsuarioRecord }> {
    if (await this.usuarios.buscarPorEmail(datos.email)) {
      throw new Error(`Ya existe un usuario con el correo "${datos.email}"`);
    }
    const tenant = await this.tenants.crear({ id: randomUUID(), nombre: datos.tenantNombre });
    const usuario = await this.usuarios.crear({
      id: randomUUID(),
      tenantId: tenant.id,
      email: datos.email.toLowerCase(),
      nombre: datos.nombre,
      passwordHash: hashPassword(datos.password),
      rol: Rol.Admin,
    });
    return { tenant, usuario };
  }

  /** Valida email + contraseña. Devuelve el usuario o `null` si no coincide. */
  async login(email: string, password: string): Promise<UsuarioRecord | null> {
    const usuario = await this.usuarios.buscarPorEmail(email.toLowerCase());
    if (!usuario) return null;
    return verifyPassword(password, usuario.passwordHash) ? usuario : null;
  }

  /** Un admin crea un usuario dentro de su tenant. */
  async crearUsuario(tenantId: string, datos: DatosNuevoUsuario): Promise<UsuarioRecord> {
    if (await this.usuarios.buscarPorEmail(datos.email)) {
      throw new Error(`Ya existe un usuario con el correo "${datos.email}"`);
    }
    return this.usuarios.crear({
      id: randomUUID(),
      tenantId,
      email: datos.email.toLowerCase(),
      nombre: datos.nombre,
      passwordHash: hashPassword(datos.password),
      rol: datos.rol,
    });
  }

  /** Lista los usuarios de un tenant (sin exponer el hash). */
  async listarUsuarios(tenantId: string): Promise<UsuarioPublico[]> {
    const usuarios = await this.usuarios.listarPorTenant(tenantId);
    return usuarios.map(sinHash);
  }

  /** Devuelve un usuario del tenant, o `null` si no existe o es de otro tenant. */
  async obtenerUsuario(tenantId: string, id: string): Promise<UsuarioPublico | null> {
    const usuario = await this.usuarioDelTenant(tenantId, id);
    return usuario ? sinHash(usuario) : null;
  }

  /**
   * Cambia el nombre y/o el rol de un usuario del tenant.
   *
   * Lanza si el cambio dejaría a la organización sin ningún administrador
   * (nadie podría volver a gestionar usuarios ni emisores).
   */
  async actualizarUsuario(
    tenantId: string,
    id: string,
    cambios: CambiosUsuario,
  ): Promise<UsuarioPublico | null> {
    const usuario = await this.usuarioDelTenant(tenantId, id);
    if (!usuario) return null;

    const dejaDeSerAdmin = cambios.rol !== undefined && cambios.rol !== Rol.Admin;
    if (dejaDeSerAdmin && (await this.esUnicoAdmin(tenantId, usuario))) {
      throw new Error("No puedes quitar el rol admin al único administrador de la organización");
    }
    return sinHash(await this.usuarios.actualizar(id, cambios));
  }

  /** Fija una contraseña nueva para un usuario del tenant. */
  async cambiarPassword(
    tenantId: string,
    id: string,
    password: string,
  ): Promise<UsuarioPublico | null> {
    const usuario = await this.usuarioDelTenant(tenantId, id);
    if (!usuario) return null;
    return sinHash(await this.usuarios.actualizar(id, { passwordHash: hashPassword(password) }));
  }

  /**
   * Elimina un usuario del tenant. Devuelve `false` si no existe o es de otro
   * tenant; lanza si es el último administrador.
   */
  async eliminarUsuario(tenantId: string, id: string): Promise<boolean> {
    const usuario = await this.usuarioDelTenant(tenantId, id);
    if (!usuario) return false;
    if (await this.esUnicoAdmin(tenantId, usuario)) {
      throw new Error("No puedes eliminar al único administrador de la organización");
    }
    await this.usuarios.eliminar(id);
    return true;
  }

  /** Busca un usuario exigiendo que pertenezca al tenant indicado. */
  private async usuarioDelTenant(tenantId: string, id: string): Promise<UsuarioRecord | null> {
    const usuario = await this.usuarios.buscarPorId(id);
    return usuario && usuario.tenantId === tenantId ? usuario : null;
  }

  /** Indica si el usuario es el único admin que le queda al tenant. */
  private async esUnicoAdmin(tenantId: string, usuario: UsuarioRecord): Promise<boolean> {
    if (usuario.rol !== Rol.Admin) return false;
    const admins = (await this.usuarios.listarPorTenant(tenantId)).filter(
      (u) => u.rol === Rol.Admin,
    );
    return admins.length <= 1;
  }
}
