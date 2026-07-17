/**
 * Cuentas de servicio (API keys) para que aplicaciones externas emitan vía API.
 *
 * Formato de la key:  factu_<keyId>.<secret>
 *   - keyId:  prefijo público, indexado → permite el lookup O(1).
 *   - secret: se guarda SOLO como hash (scrypt). El valor completo se muestra
 *             una única vez, al crearla.
 *
 * La verificación resuelve la key a un "principal" equivalente al de un usuario
 * ({ sub, tenantId, rol, ... }) para que las guardas de rol y de tenant que ya
 * existen funcionen igual con humanos y con integraciones.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { Rol } from "../../domain/auth/roles.js";
import { hashPassword, verifyPassword } from "../usuarios/password.js";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
} from "../../infra/repos/types.js";

export const API_KEY_PREFIJO = "factu_";
const SEPARADOR = ".";

/** Principal resuelto desde una API key (misma forma base que el JWT humano). */
export interface PrincipalServicio {
  sub: string;
  tenantId: string;
  rol: Rol;
  kind: "service";
  /** Emisores permitidos; vacío = todos los del tenant. */
  emisores: string[];
  label: string;
}

/** Vista pública de una API key (nunca incluye el hash del secreto). */
export type ApiKeyPublica = Omit<ApiKeyRecord, "secretHash">;

export interface DatosNuevaApiKey {
  label: string;
  rol: Rol;
  emisoresPermitidos?: string[];
  expiresAt?: Date | null;
}

function sinHash(record: ApiKeyRecord): ApiKeyPublica {
  const { secretHash: _omit, ...resto } = record;
  return resto;
}

export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository) {}

  /**
   * Crea una API key y devuelve el secreto en claro UNA sola vez (junto con el
   * registro público). Después solo queda su hash.
   */
  async crear(
    tenantId: string,
    datos: DatosNuevaApiKey,
  ): Promise<{ apiKey: ApiKeyPublica; secreto: string }> {
    const keyId = randomBytes(9).toString("hex"); // 18 hex, público
    const secret = randomBytes(32).toString("base64url");
    const secretoCompleto = `${API_KEY_PREFIJO}${keyId}${SEPARADOR}${secret}`;

    const record = await this.repo.crear({
      id: randomUUID(),
      tenantId,
      label: datos.label,
      keyId,
      secretHash: hashPassword(secret),
      rol: datos.rol,
      emisoresPermitidos: datos.emisoresPermitidos ?? [],
      expiresAt: datos.expiresAt ?? null,
    });

    return { apiKey: sinHash(record), secreto: secretoCompleto };
  }

  /** Lista las API keys del tenant (sin secretos). */
  async listar(tenantId: string): Promise<ApiKeyPublica[]> {
    const keys = await this.repo.listarPorTenant(tenantId);
    return keys.map(sinHash);
  }

  /** Revoca una API key del tenant. Devuelve false si no existe o es de otro tenant. */
  async revocar(tenantId: string, id: string): Promise<boolean> {
    const key = await this.repo.buscarPorId(id);
    if (!key || key.tenantId !== tenantId) return false;
    await this.repo.revocar(id);
    return true;
  }

  /**
   * Resuelve una API key a su principal, o `null` si es inválida, revocada o
   * expirada. Registra el uso (best-effort) cuando es válida.
   */
  async autenticar(token: string): Promise<PrincipalServicio | null> {
    if (!token.startsWith(API_KEY_PREFIJO)) return null;
    const resto = token.slice(API_KEY_PREFIJO.length);
    const sep = resto.indexOf(SEPARADOR);
    if (sep <= 0) return null;

    const keyId = resto.slice(0, sep);
    const secret = resto.slice(sep + 1);
    if (!keyId || !secret) return null;

    const record = await this.repo.buscarPorKeyId(keyId);
    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
    if (!verifyPassword(secret, record.secretHash)) return null;

    // Registro de uso sin bloquear la petición.
    void this.repo.marcarUso(record.id).catch(() => {});

    return {
      sub: record.id,
      tenantId: record.tenantId,
      rol: record.rol,
      kind: "service",
      emisores: record.emisoresPermitidos,
      label: record.label,
    };
  }
}
