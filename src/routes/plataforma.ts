/**
 * Panel interno de plataforma (Savegre Center): datos cross-tenant para que
 * Savegre Soft administre sus clientes de Factu desde un solo lugar — igual
 * espíritu que `/api/platform/*` en RestauCloud-API, pero sin motor de
 * módulos (Factu es un producto único).
 *
 *  GET  /plataforma/tenants                      → lista de tenants
 *  GET  /plataforma/tenants/:id                   → detalle (resumen + suscripción + pagos)
 *  GET  /plataforma/tenants/:id/suscripcion       → detalle de la suscripción
 *  PUT  /plataforma/tenants/:id/suscripcion       → actualiza plan/estado/moneda/ciclo/descuento/fechas
 *  GET  /plataforma/tenants/:id/suscripcion/pagos → historial de cobros
 *  POST /plataforma/tenants/:id/suscripcion/pagos → registra un cobro
 *  GET  /plataforma/summary                       → conteos agregados
 *
 * Todas requieren `app.requierePlataforma` (credencial global `platform_...`,
 * NUNCA un JWT de usuario ni una `ApiKey` de tenant).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { estadisticasService } from "../services/estadisticas/index.js";
import { suscripcionService } from "../services/plataforma/index.js";
import { registrarAuditoria, actorDesde } from "../services/auditoria/index.js";
import { tenantRepository, usuarioRepository, emisorRepository } from "../infra/repos/index.js";
import {
  plataformaTenantsSchema,
  plataformaTenantDetalleSchema,
  plataformaSuscripcionObtenerSchema,
  plataformaSuscripcionActualizarSchema,
  plataformaPagosListarSchema,
  plataformaPagoCrearSchema,
  plataformaSummarySchema,
} from "../plugins/schemas.js";

const suscripcionSchema = z.object({
  plan: z.string().min(1),
  estado: z.enum(["activa", "suspendida", "cancelada"]),
  moneda: z.string().min(1),
  ciclo: z.enum(["mensual", "anual"]),
  descuentoTipo: z.enum(["porcentaje", "monto"]).nullable().optional(),
  descuentoValor: z.number().nonnegative().nullable().optional(),
  descuentoRazon: z.string().nullable().optional(),
  iniciaEn: z.coerce.date(),
  renuevaEn: z.coerce.date().nullable().optional(),
  notas: z.string().nullable().optional(),
});

const pagoSchema = z.object({
  monto: z.number().positive(),
  moneda: z.string().min(1),
  metodo: z.string().min(1),
  referencia: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
});

/** Devuelve el tenant o responde 404. */
async function tenantOId(id: string, reply: { status: (c: number) => { send: (b: unknown) => void } }) {
  const tenant = await tenantRepository.buscar(id);
  if (!tenant) {
    reply.status(404).send({ error: `Tenant "${id}" no encontrado` });
    return null;
  }
  return tenant;
}

export async function plataformaRoutes(app: FastifyInstance): Promise<void> {
  const gate = { preHandler: app.requierePlataforma };

  app.get("/plataforma/tenants", { schema: plataformaTenantsSchema, ...gate }, async () => {
    const [tenants, suscripciones] = await Promise.all([
      tenantRepository.listarTodos(),
      suscripcionService.mapaPorTenant(),
    ]);
    return Promise.all(
      tenants.map(async (tenant) => {
        const [usuarios, emisores] = await Promise.all([
          usuarioRepository.listarPorTenant(tenant.id),
          emisorRepository.listarPorTenant(tenant.id),
        ]);
        const suscripcion = suscripciones.get(tenant.id);
        return {
          id: tenant.id,
          nombre: tenant.nombre,
          createdAt: tenant.createdAt,
          usuarios: usuarios.length,
          emisores: emisores.length,
          suscripcion: { plan: suscripcion?.plan ?? "sin definir", estado: suscripcion?.estado ?? "activa" },
        };
      }),
    );
  });

  app.get(
    "/plataforma/tenants/:id",
    { schema: plataformaTenantDetalleSchema, ...gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tenant = await tenantOId(id, reply);
      if (!tenant) return;

      const [resumen, suscripcion, pagos] = await Promise.all([
        estadisticasService.resumen(id, {}),
        suscripcionService.obtener(id),
        suscripcionService.listarPagos(id),
      ]);

      return { tenant, resumen, suscripcion, pagos };
    },
  );

  app.get(
    "/plataforma/tenants/:id/suscripcion",
    { schema: plataformaSuscripcionObtenerSchema, ...gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await tenantOId(id, reply))) return;
      return suscripcionService.obtener(id);
    },
  );

  app.put(
    "/plataforma/tenants/:id/suscripcion",
    { schema: plataformaSuscripcionActualizarSchema, ...gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await tenantOId(id, reply))) return;

      const parsed = suscripcionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }

      const suscripcion = await suscripcionService.actualizar(id, {
        plan: parsed.data.plan,
        estado: parsed.data.estado,
        moneda: parsed.data.moneda,
        ciclo: parsed.data.ciclo,
        descuentoTipo: parsed.data.descuentoTipo ?? null,
        descuentoValor: parsed.data.descuentoValor ?? null,
        descuentoRazon: parsed.data.descuentoRazon ?? null,
        iniciaEn: parsed.data.iniciaEn,
        renuevaEn: parsed.data.renuevaEn ?? null,
        notas: parsed.data.notas ?? null,
      });

      registrarAuditoria({
        tenantId: id,
        actor: actorDesde(request.plataforma, request.ip),
        accion: "suscripcion.actualizar",
        recurso: "suscripcion",
        recursoId: suscripcion.id,
        detalle: `${suscripcion.plan} (${suscripcion.estado})`,
      });

      return suscripcion;
    },
  );

  app.get(
    "/plataforma/tenants/:id/suscripcion/pagos",
    { schema: plataformaPagosListarSchema, ...gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await tenantOId(id, reply))) return;
      return suscripcionService.listarPagos(id);
    },
  );

  app.post(
    "/plataforma/tenants/:id/suscripcion/pagos",
    { schema: plataformaPagoCrearSchema, ...gate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!(await tenantOId(id, reply))) return;

      const parsed = pagoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }

      const pago = await suscripcionService.registrarPago(id, {
        ...parsed.data,
        registradoPor: request.plataforma.label,
      });

      registrarAuditoria({
        tenantId: id,
        actor: actorDesde(request.plataforma, request.ip),
        accion: "suscripcion.pago.registrar",
        recurso: "pagoSuscripcion",
        recursoId: pago.id,
        detalle: `${pago.monto} ${pago.moneda} (${pago.metodo})`,
      });

      return reply.status(201).send(pago);
    },
  );

  app.get("/plataforma/summary", { schema: plataformaSummarySchema, ...gate }, async () => {
    const [tenants, suscripciones] = await Promise.all([
      tenantRepository.listarTodos(),
      suscripcionService.mapaPorTenant(),
    ]);

    let usuariosTotal = 0;
    let emisoresTotal = 0;
    const porEstado: Record<string, number> = { activa: 0, suspendida: 0, cancelada: 0 };

    for (const tenant of tenants) {
      const [usuarios, emisores] = await Promise.all([
        usuarioRepository.listarPorTenant(tenant.id),
        emisorRepository.listarPorTenant(tenant.id),
      ]);
      usuariosTotal += usuarios.length;
      emisoresTotal += emisores.length;
      const estado = suscripciones.get(tenant.id)?.estado ?? "activa";
      porEstado[estado] = (porEstado[estado] ?? 0) + 1;
    }

    return {
      tenants: { total: tenants.length, porEstado },
      usuarios: usuariosTotal,
      emisores: emisoresTotal,
    };
  });
}
