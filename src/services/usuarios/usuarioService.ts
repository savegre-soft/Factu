/**
 * Servicio de usuarios y tenants (control de acceso).
 *
 * - `registrar`: crea un tenant nuevo y su primer usuario (rol admin).
 * - `login`: valida credenciales y devuelve el usuario.
 * - `crearUsuario`: un admin agrega usuarios a su tenant.
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
  async listarUsuarios(tenantId: string): Promise<Omit<UsuarioRecord, "passwordHash">[]> {
    const usuarios = await this.usuarios.listarPorTenant(tenantId);
    return usuarios.map(({ passwordHash: _omit, ...resto }) => resto);
  }
}
