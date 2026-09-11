/**
 * Guardas reutilizables de aislamiento por tenant para las rutas.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { emisorRepository } from "../infra/repos/index.js";
import type { EmisorRecord } from "../infra/repos/types.js";
import { Permiso, rolTienePermiso } from "../domain/auth/roles.js";

/**
 * Devuelve el emisor si existe y pertenece al tenant del usuario autenticado.
 * En caso contrario responde (404 o 403) y devuelve `null`.
 */
export async function emisorDelTenant(
  request: FastifyRequest,
  reply: FastifyReply,
  cedula: string,
): Promise<EmisorRecord | null> {
  const emisor = await emisorRepository.buscar(cedula);
  if (!emisor) {
    reply.status(404).send({ error: `Emisor "${cedula}" no registrado` });
    return null;
  }
  if (emisor.tenantId !== request.user.tenantId) {
    reply.status(403).send({ error: "El emisor no pertenece a tu organización" });
    return null;
  }
  // Las API keys pueden limitarse a ciertos emisores; los humanos no traen lista.
  const permitidos = request.user.emisores;
  if (permitidos && permitidos.length > 0 && !permitidos.includes(cedula)) {
    reply.status(403).send({ error: "Esta credencial no puede operar sobre este emisor" });
    return null;
  }
  return emisor;
}

/**
 * Autoriza GESTIONAR (registrar/actualizar, subir certificado de) un emisor
 * específico: un humano con el permiso `GestionarEmisores` (rol admin), o una
 * API key de servicio ya scoped explícitamente a esa cédula (o sin lista de
 * `emisores` = sin restricción) desde que un admin humano la creó.
 *
 * Antes de este cambio, `GestionarEmisores` era admin-only sin excepción —
 * una API key nunca puede tener `rol: admin` por diseño (`apiKeyService`: "Una
 * API key nunca es admin: solo emite o lee"), así que ninguna integración
 * externa podía registrar su propio emisor ni subir su certificado, aunque el
 * admin que creó esa key ya la hubiera scoped explícitamente a esa cédula.
 * Esta guarda NO amplía lo que una API key puede hacer más allá de los
 * emisores que su propio creador ya le autorizó — sigue sin poder gestionar
 * usuarios, otras integraciones, ni emisores fuera de su whitelist.
 */
export function puedeGestionarEmisor(request: FastifyRequest, cedula: string): boolean {
  if (request.user.kind !== "service") {
    return rolTienePermiso(request.user.rol, Permiso.GestionarEmisores);
  }
  // Una API key `lector` (solo lectura) nunca debe poder subir un certificado
  // ni registrar un emisor, aunque esté scoped a esa cédula — el scope por sí
  // solo no basta, la key también necesita ser operativa (`facturador`, el
  // único rol de servicio con `Permiso.Emitir` además de `Leer`).
  if (!rolTienePermiso(request.user.rol, Permiso.Emitir)) return false;
  const permitidos = request.user.emisores;
  return !permitidos || permitidos.length === 0 || permitidos.includes(cedula);
}
