/**
 * Estadísticas de la organización (tenant) del usuario autenticado.
 *
 *  GET /estadisticas/resumen           → usuarios, emisores y comprobantes
 *  GET /estadisticas/emisores          → desglose por emisor
 *  GET /estadisticas/emisores/:cedula  → un emisor concreto
 *  GET /estadisticas/serie             → comprobantes emitidos por día
 *
 * Todas requieren permiso de lectura y quedan acotadas al tenant del JWT.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { estadisticasService, type RangoFechas } from "../services/estadisticas/index.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  estadisticasResumenSchema,
  estadisticasEmisoresSchema,
  estadisticasEmisorSchema,
  estadisticasSerieSchema,
} from "../plugins/schemas.js";
import { emisorDelTenant } from "./_guards.js";

const rangoSchema = z
  .object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
  })
  .refine((r) => !r.desde || !r.hasta || r.desde <= r.hasta, {
    message: '"desde" debe ser anterior o igual a "hasta"',
  });

/** Valida el rango de la query; responde 400 y devuelve `null` si es inválido. */
function leerRango(query: unknown): { ok: true; rango: RangoFechas } | { ok: false; issues: z.ZodIssue[] } {
  const parsed = rangoSchema.safeParse(query ?? {});
  return parsed.success ? { ok: true, rango: parsed.data } : { ok: false, issues: parsed.error.issues };
}

export async function estadisticasRoutes(app: FastifyInstance): Promise<void> {
  const soloLectura = { preHandler: app.requierePermiso(Permiso.Leer) };

  app.get("/estadisticas/resumen", { schema: estadisticasResumenSchema, ...soloLectura }, async (request, reply) => {
    const r = leerRango(request.query);
    if (!r.ok) return reply.status(400).send({ error: "Rango inválido", detalles: r.issues });
    return estadisticasService.resumen(request.user.tenantId, r.rango);
  });

  app.get("/estadisticas/emisores", { schema: estadisticasEmisoresSchema, ...soloLectura }, async (request, reply) => {
    const r = leerRango(request.query);
    if (!r.ok) return reply.status(400).send({ error: "Rango inválido", detalles: r.issues });
    return estadisticasService.porEmisor(request.user.tenantId, r.rango);
  });

  app.get(
    "/estadisticas/emisores/:cedula",
    { schema: estadisticasEmisorSchema, ...soloLectura },
    async (request, reply) => {
      const r = leerRango(request.query);
      if (!r.ok) return reply.status(400).send({ error: "Rango inválido", detalles: r.issues });

      const { cedula } = request.params as { cedula: string };
      const emisor = await emisorDelTenant(request, reply, cedula);
      if (!emisor) return;

      return estadisticasService.deEmisor(emisor, r.rango);
    },
  );

  app.get("/estadisticas/serie", { schema: estadisticasSerieSchema, ...soloLectura }, async (request, reply) => {
    const r = leerRango(request.query);
    if (!r.ok) return reply.status(400).send({ error: "Rango inválido", detalles: r.issues });
    return estadisticasService.serieDiaria(request.user.tenantId, r.rango);
  });
}
