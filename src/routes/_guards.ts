/**
 * Guardas reutilizables de aislamiento por tenant para las rutas.
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { emisorRepository } from "../infra/repos/index.js";
import type { EmisorRecord } from "../infra/repos/types.js";

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
  return emisor;
}
