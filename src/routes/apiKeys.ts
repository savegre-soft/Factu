/**
 * Gestión de API keys (cuentas de servicio) para aplicaciones externas.
 *
 *   POST   /api-keys        → crea una key (devuelve el secreto UNA vez)
 *   GET    /api-keys        → lista las keys del tenant (sin secretos)
 *   DELETE /api-keys/:id    → revoca una key
 *
 * Solo administradores (Permiso.GestionarIntegraciones). Las apps externas NO
 * usan estas rutas: usan su key contra los endpoints de emisión.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiKeyService } from "../services/apiKeys/index.js";
import { emisorRepository } from "../infra/repos/index.js";
import { Permiso, Rol } from "../domain/auth/roles.js";
import { apiKeyCrearSchema, apiKeyListarSchema, apiKeyRevocarSchema } from "../plugins/schemas.js";

// Una API key nunca es admin: solo emite o lee.
const crearSchema = z.object({
  label: z.string().min(1),
  rol: z.enum(["facturador", "lector"]).default("facturador"),
  emisores: z.array(z.string().regex(/^\d+$/)).optional(),
  expiresAt: z.coerce.date().optional(),
});

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api-keys",
    { schema: apiKeyCrearSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const parsed = crearSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }

      // Si se limita a emisores, deben pertenecer al tenant.
      const emisores = parsed.data.emisores ?? [];
      for (const cedula of emisores) {
        const emisor = await emisorRepository.buscar(cedula);
        if (!emisor || emisor.tenantId !== request.user.tenantId) {
          return reply.status(400).send({ error: `El emisor "${cedula}" no pertenece a tu organización` });
        }
      }

      const { apiKey, secreto } = await apiKeyService.crear(request.user.tenantId, {
        label: parsed.data.label,
        rol: parsed.data.rol as Rol,
        emisoresPermitidos: emisores,
        expiresAt: parsed.data.expiresAt ?? null,
      });

      return reply.status(201).send({
        ...apiKey,
        // El secreto completo se muestra SOLO en esta respuesta.
        apiKey: secreto,
      });
    },
  );

  app.get(
    "/api-keys",
    { schema: apiKeyListarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request) => {
      return apiKeyService.listar(request.user.tenantId);
    },
  );

  app.delete(
    "/api-keys/:id",
    { schema: apiKeyRevocarSchema, preHandler: app.requierePermiso(Permiso.GestionarIntegraciones) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ok = await apiKeyService.revocar(request.user.tenantId, id);
      if (!ok) return reply.status(404).send({ error: "API key no encontrada" });
      return { id, revocada: true };
    },
  );
}
