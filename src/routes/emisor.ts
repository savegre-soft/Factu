import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { emisorRepository, clienteRepository } from "../infra/repos/index.js";
import { certStore } from "../services/emisor/index.js";
import {
  emisorRegistrarSchema,
  emisorCertificadoSchema,
  emisorListarSchema,
  clientesListarSchema,
  clienteBuscarSchema,
} from "../plugins/schemas.js";
import { Permiso } from "../domain/auth/roles.js";
import { emisorDelTenant } from "./_guards.js";
import { paginaSchema } from "./_pagina.js";

const datosFiscalesSchema = z
  .object({
    tipoIdentificacion: z.string().optional(),
    nombreComercial: z.string().optional(),
    correoElectronico: z.string().email().optional(),
    telefono: z.object({ codigoPais: z.string(), numTelefono: z.string() }).optional(),
    ubicacion: z
      .object({
        provincia: z.string(),
        canton: z.string(),
        distrito: z.string(),
        otrasSenas: z.string().optional(),
      })
      .optional(),
    codigoActividad: z.string().optional(),
  })
  .optional();

const registrarSchema = z.object({
  cedula: z.string().regex(/^\d+$/),
  nombre: z.string().min(1),
  datosFiscales: datosFiscalesSchema,
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
        datosFiscales: e.datosFiscales ?? null,
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
        datosFiscales: emisor.datosFiscales ?? null,
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

  /** Clientes (receptores) usados en facturas pasadas del tenant. */
  app.get(
    "/clientes",
    { schema: clientesListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const q = paginaSchema.safeParse(request.query);
      if (!q.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: q.error.issues });
      }
      const [clientes, total] = await Promise.all([
        clienteRepository.listarPorTenant(request.user.tenantId, q.data),
        clienteRepository.contarPorTenant(request.user.tenantId),
      ]);
      return {
        total,
        ...q.data,
        items: clientes.map((c) => ({
          numero: c.numero,
          tipo: c.tipo,
          nombre: c.nombre,
          correo: c.correo,
        })),
      };
    },
  );

  /** Autocompletar: devuelve el receptor completo guardado para ese número. */
  app.get(
    "/clientes/:numero",
    { schema: clienteBuscarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const numero = (request.params as { numero: string }).numero;
      const cliente = await clienteRepository.buscarPorNumero(request.user.tenantId, numero);
      if (!cliente) return reply.status(404).send({ error: "Sin cliente previo con ese número" });
      return { numero: cliente.numero, receptor: JSON.parse(cliente.datos) };
    },
  );
}
