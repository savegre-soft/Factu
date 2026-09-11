/**
 * Credenciales de servicio GLOBALES (sin tenant) para que Savegre Center
 * consuma las rutas `/plataforma/*`.
 *
 * Mismo mecanismo que `ApiKeyService` (prefijo + secreto, solo se guarda el
 * hash) pero deliberadamente separado de él: esta credencial no pertenece a
 * ningún tenant y resuelve a un principal `PrincipalPlataforma` sin
 * `tenantId` ni `rol`, para que nunca pueda satisfacer por accidente una
 * guarda pensada para un tenant (`app.authenticate`/`requierePermiso`) — solo
 * `app.requierePlataforma` la acepta.
 *
 * Formato de la credencial:  platform_<keyId>.<secret>
 *
 * No hay ruta HTTP para crear estas credenciales (no habría con qué
 * autenticarse la primera vez): se generan con
 * `scripts/crear-credencial-plataforma.ts`, corrido por un humano.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "../usuarios/password.js";
import type {
  CredencialPlataformaRecord,
  CredencialPlataformaRepository,
} from "../../infra/repos/types.js";

export const CREDENCIAL_PLATAFORMA_PREFIJO = "platform_";
const SEPARADOR = ".";

/** Principal resuelto desde una credencial de plataforma. */
export interface PrincipalPlataforma {
  sub: string;
  kind: "plataforma";
  label: string;
}

/** Vista pública de una credencial (nunca incluye el hash del secreto). */
export type CredencialPlataformaPublica = Omit<CredencialPlataformaRecord, "secretHash">;

export interface DatosNuevaCredencialPlataforma {
  label: string;
  expiresAt?: Date | null;
}

function sinHash(record: CredencialPlataformaRecord): CredencialPlataformaPublica {
  const { secretHash: _omit, ...resto } = record;
  return resto;
}

export class CredencialPlataformaService {
  constructor(private readonly repo: CredencialPlataformaRepository) {}

  /**
   * Crea una credencial y devuelve el secreto en claro UNA sola vez (junto
   * con el registro público). Después solo queda su hash.
   */
  async crear(
    datos: DatosNuevaCredencialPlataforma,
  ): Promise<{ credencial: CredencialPlataformaPublica; secreto: string }> {
    const keyId = randomBytes(9).toString("hex"); // 18 hex, público
    const secret = randomBytes(32).toString("base64url");
    const secretoCompleto = `${CREDENCIAL_PLATAFORMA_PREFIJO}${keyId}${SEPARADOR}${secret}`;

    const record = await this.repo.crear({
      id: randomUUID(),
      label: datos.label,
      keyId,
      secretHash: hashPassword(secret),
      expiresAt: datos.expiresAt ?? null,
    });

    return { credencial: sinHash(record), secreto: secretoCompleto };
  }

  /** Lista todas las credenciales de plataforma (sin secretos). */
  async listar(): Promise<CredencialPlataformaPublica[]> {
    const credenciales = await this.repo.listar();
    return credenciales.map(sinHash);
  }

  /** Revoca una credencial. Devuelve false si no existe. */
  async revocar(id: string): Promise<boolean> {
    const credencial = await this.repo.buscarPorId(id);
    if (!credencial) return false;
    await this.repo.revocar(id);
    return true;
  }

  /**
   * Resuelve una credencial a su principal, o `null` si es inválida,
   * revocada o expirada. Registra el uso (best-effort) cuando es válida.
   */
  async autenticar(token: string): Promise<PrincipalPlataforma | null> {
    if (!token.startsWith(CREDENCIAL_PLATAFORMA_PREFIJO)) return null;
    const resto = token.slice(CREDENCIAL_PLATAFORMA_PREFIJO.length);
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

    void this.repo.marcarUso(record.id).catch(() => {});

    return { sub: record.id, kind: "plataforma", label: record.label };
  }
}
