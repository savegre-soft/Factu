/**
 * Resolución de cuentas para OAuth (Google / Microsoft) y gestión de las
 * identidades vinculadas a un usuario.
 *
 * Reglas (según la configuración elegida):
 *  - Si el `sub` del proveedor ya está vinculado → inicia sesión con ese usuario.
 *  - Si no, y el correo (verificado) ya existe → se vincula automáticamente.
 *  - Si el correo no existe → se crea una organización nueva con esa persona
 *    como admin (sin contraseña; puede definir una luego con el reseteo).
 *  - intent "link": adjunta la identidad al usuario autenticado.
 */
import { randomUUID } from "node:crypto";
import { Rol } from "../../domain/auth/roles.js";
import type {
  OAuthIdentityRecord,
  OAuthIdentityRepository,
  TenantRepository,
  UsuarioRecord,
  UsuarioRepository,
} from "../../infra/repos/types.js";
import type { PerfilOAuth, ProviderKey } from "./oauthProviders.js";
import type { EstadoOAuth } from "./estado.js";

export interface ResultadoOAuth {
  usuario: UsuarioRecord;
  /** true si se creó una organización nueva. */
  creada: boolean;
}

export class CuentaService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly identidades: OAuthIdentityRepository,
  ) {}

  async resolverOAuth(
    provider: ProviderKey,
    perfil: PerfilOAuth,
    estado: EstadoOAuth,
  ): Promise<ResultadoOAuth> {
    const existente = await this.identidades.buscarPorProviderSub(provider, perfil.sub);

    if (estado.intent === "link") {
      if (!estado.userId) throw new Error("Falta el usuario para vincular");
      const usuario = await this.usuarios.buscarPorId(estado.userId);
      if (!usuario) throw new Error("Usuario no encontrado");
      if (existente && existente.userId !== usuario.id) {
        throw new Error(`Esta cuenta de ${provider} ya está vinculada a otro usuario`);
      }
      if (!existente) await this.crearIdentidad(usuario.id, provider, perfil);
      return { usuario, creada: false };
    }

    // intent "login" (unificado con "registrarse").
    if (existente) {
      const usuario = await this.usuarios.buscarPorId(existente.userId);
      if (!usuario) throw new Error("La cuenta vinculada ya no existe");
      return { usuario, creada: false };
    }

    const porCorreo = await this.usuarios.buscarPorEmail(perfil.email.toLowerCase());
    if (porCorreo) {
      if (!perfil.emailVerificado) {
        throw new Error("El proveedor no verificó el correo; vincula la cuenta desde tu perfil");
      }
      await this.crearIdentidad(porCorreo.id, provider, perfil);
      return { usuario: porCorreo, creada: false };
    }

    // Correo nuevo: se crea una organización con esta persona como admin.
    const tenant = await this.tenants.crear({
      id: randomUUID(),
      nombre: `Organización de ${perfil.nombre}`,
    });
    const usuario = await this.usuarios.crear({
      id: randomUUID(),
      tenantId: tenant.id,
      email: perfil.email.toLowerCase(),
      nombre: perfil.nombre,
      passwordHash: "", // sin contraseña: entra por OAuth (puede definir una luego)
      rol: Rol.Admin,
    });
    await this.crearIdentidad(usuario.id, provider, perfil);
    return { usuario, creada: true };
  }

  async listarIdentidades(userId: string): Promise<OAuthIdentityRecord[]> {
    return this.identidades.listarPorUsuario(userId);
  }

  /**
   * Desvincula un proveedor. No permite quedar sin forma de acceso: debe restar
   * una contraseña o al menos otra identidad vinculada.
   */
  async desvincular(userId: string, provider: ProviderKey): Promise<boolean> {
    const usuario = await this.usuarios.buscarPorId(userId);
    if (!usuario) return false;
    const identidades = await this.identidades.listarPorUsuario(userId);
    const objetivo = identidades.find((i) => i.provider === provider);
    if (!objetivo) return false;

    const tienePassword = usuario.passwordHash !== "";
    const quedanOtras = identidades.some((i) => i.id !== objetivo.id);
    if (!tienePassword && !quedanOtras) {
      throw new Error(
        "Es tu única forma de acceso. Define una contraseña antes de desvincular esta cuenta.",
      );
    }
    await this.identidades.eliminar(objetivo.id);
    return true;
  }

  private async crearIdentidad(userId: string, provider: ProviderKey, perfil: PerfilOAuth) {
    await this.identidades.crear({
      id: randomUUID(),
      userId,
      provider,
      providerSub: perfil.sub,
      email: perfil.email,
    });
  }
}
