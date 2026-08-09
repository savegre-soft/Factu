/**
 * Documentos recibidos (facturas que nos emiten) y su mensaje receptor.
 *
 *   POST /recibidos                        → registra un comprobante desde su XML
 *   GET  /recibidos                        → lista los del tenant (sin XML)
 *   GET  /recibidos/:id                    → detalle (con XML y MR si existe)
 *   POST /recibidos/:id/mensaje-receptor   → genera y guarda el mensaje receptor
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { documentosRecibidosService } from "../services/documentosRecibidos/index.js";
import { RespuestaMensaje } from "../domain/mensajeReceptor/mensajeReceptor.js";
import { Permiso } from "../domain/auth/roles.js";
import {
  recibidoCrearSchema,
  recibidoListarSchema,
  recibidoGetSchema,
  recibidoEliminarSchema,
  recibidoMensajeReceptorSchema,
} from "../plugins/schemas.js";
import type { DocumentoRecibidoRecord } from "../infra/repos/types.js";
import { paginaSchema } from "./_pagina.js";

const crearSchema = z.object({ xml: z.string().min(1) });
const mrSchema = z.object({
  respuesta: z.nativeEnum(RespuestaMensaje),
  detalleMensaje: z.string().optional(),
});

/** Resumen (sin los XML, que son grandes) para los listados. */
function resumen(d: DocumentoRecibidoRecord) {
  return {
    id: d.id,
    clave: d.clave,
    tipo: d.tipo,
    numeroConsecutivo: d.numeroConsecutivo,
    fechaEmision: d.fechaEmision,
    emisorNombre: d.emisorNombre,
    emisorCedula: d.emisorCedula,
    receptorCedula: d.receptorCedula,
    receptorNombre: d.receptorNombre,
    moneda: d.moneda,
    totalComprobante: d.totalComprobante,
    totalImpuesto: d.totalImpuesto,
    origen: d.origen,
    mrRespuesta: d.mrRespuesta,
    mrConsecutivo: d.mrConsecutivo,
    mrGeneradoAt: d.mrGeneradoAt,
    createdAt: d.createdAt,
  };
}

/** Detalle: incluye el XML original y el del mensaje receptor. */
function detalle(d: DocumentoRecibidoRecord) {
  return { ...resumen(d), xml: d.xml, mrXml: d.mrXml };
}

export async function documentosRecibidosRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/recibidos",
    { schema: recibidoCrearSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const parsed = crearSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      try {
        const { documento, yaExistia } = await documentosRecibidosService.registrarDesdeXml(
          request.user.tenantId,
          parsed.data.xml,
          "manual",
        );
        return reply.status(yaExistia ? 200 : 201).send({ ...detalle(documento), yaExistia });
      } catch (err) {
        return reply.status(400).send({
          error: "No se pudo leer el comprobante",
          detalle: (err as Error).message,
        });
      }
    },
  );

  app.get(
    "/recibidos",
    { schema: recibidoListarSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const q = paginaSchema.safeParse(request.query);
      if (!q.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: q.error.issues });
      }
      const { items, total } = await documentosRecibidosService.listar(request.user.tenantId, q.data);
      return { total, ...q.data, items: items.map(resumen) };
    },
  );

  app.get(
    "/recibidos/:id",
    { schema: recibidoGetSchema, preHandler: app.requierePermiso(Permiso.Leer) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const doc = await documentosRecibidosService.obtener(request.user.tenantId, id);
      if (!doc) return reply.status(404).send({ error: "Documento no encontrado" });
      return detalle(doc);
    },
  );

  app.delete(
    "/recibidos/:id",
    { schema: recibidoEliminarSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await documentosRecibidosService.eliminar(request.user.tenantId, id);
      if (!ok) return reply.status(404).send({ error: "Documento no encontrado" });
      return { id, eliminado: true };
    },
  );

  app.post(
    "/recibidos/:id/mensaje-receptor",
    { schema: recibidoMensajeReceptorSchema, preHandler: app.requierePermiso(Permiso.Emitir) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = mrSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      try {
        const doc = await documentosRecibidosService.generarMensajeReceptor(
          request.user.tenantId,
          id,
          parsed.data,
        );
        if (!doc) return reply.status(404).send({ error: "Documento no encontrado" });
        return detalle(doc);
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );
}
