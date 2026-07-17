import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { emisorRepository } from "../infra/repos/index.js";
import { certStore } from "../services/emisor/index.js";
import {
  emisorRegistrarSchema,
  emisorCertificadoSchema,
  emisorListarSchema,
} from "../plugins/schemas.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";

const registrarSchema = z.object({
  cedula: z.string().regex(/^\d+$/),
  nombre: z.string().min(1),
});

const certificadoSchema = z.object({
  /** Archivo .p12 codificado en base64. */
  p12Base64: z.string().min(1),
  /** Clave (PIN) del .p12. */
  password: z.string().min(1),
});

export async function emisorRoutes(app: FastifyInstance): Promise<void> {
  /** Lista los emisores del tenant. */
  app.get(
    "/emisor",
    { schema: emisorListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request) => {
      const emisores = await emisorRepository.listarPorTenant(request.user.tenantId);
      return emisores.map((e) => ({
        cedula: e.cedula,
        nombre: e.nombre,
        tieneCertificado: Boolean(e.certificado),
      }));
    },
  );

  /** Registra (o actualiza) un emisor dentro del tenant del usuario. */
  app.post(
    "/emisor",
    { schema: emisorRegistrarSchema, preHandler: app.requierePermiso(Permiso.GestionarEmisores) },
    async (request, reply) => {
      const parsed = registrarSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }

      // Si el emisor ya existe, debe pertenecer a este tenant.
      const existente = await emisorRepository.buscar(parsed.data.cedula);
      if (existente && existente.tenantId !== request.user.tenantId) {
        return reply.status(409).send({ error: "El emisor ya está registrado por otra organización" });
      }

      const emisor = await emisorRepository.upsert({
        ...parsed.data,
        tenantId: request.user.tenantId,
      });
      return {
        cedula: emisor.cedula,
        nombre: emisor.nombre,
        tieneCertificado: Boolean(emisor.certificado),
      };
    },
  );

  /** Sube el certificado .p12 del emisor (se guarda cifrado en reposo). */
  app.post(
    "/emisor/:cedula/certificado",
    { schema: emisorCertificadoSchema, preHandler: app.requierePermiso(Permiso.GestionarEmisores) },
    async (request, reply) => {
      const cedula = (request.params as { cedula: string }).cedula;
      const parsed = certificadoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }

      if (!(await emisorDelTenant(request, reply, cedula))) return;

      try {
        const p12 = Buffer.from(parsed.data.p12Base64, "base64");
        await certStore.guardar(cedula, p12, parsed.data.password);
        return { cedula, tieneCertificado: true };
      } catch (err) {
        return reply.status(400).send({
          error: "El certificado no se pudo cargar (¿.p12 o clave incorrectos?)",
          detalle: (err as Error).message,
        });
      }
    },
  );
}
