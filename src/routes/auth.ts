/**
 * Autenticación de usuarios de la API (tenants, roles, multiusuario).
 *
 *  POST   /auth/registro             → crea un tenant + usuario admin (público)
 *  POST   /auth/login                → devuelve un JWT (público)
 *  GET    /auth/yo                   → perfil del usuario autenticado
 *  POST   /auth/usuarios             → admin crea usuarios en su tenant
 *  GET    /auth/usuarios             → admin lista los usuarios de su tenant
 *  GET    /auth/usuarios/:id         → admin consulta un usuario
 *  PATCH  /auth/usuarios/:id         → admin cambia nombre y/o rol
 *  PUT    /auth/usuarios/:id/password→ admin fija una contraseña nueva
 *  DELETE /auth/usuarios/:id         → admin elimina un usuario
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { usuarioService } from "../services/usuarios/index.js";
import { registrarAuditoria } from "../services/auditoria/index.js";
import { Permiso, Rol } from "../domain/auth/roles.js";
import type { JwtPayload } from "../plugins/auth.js";
import {
  authRegistroSchema,
  authLoginSchema,
  authYoSchema,
  perfilActualizarSchema,
  perfilPasswordSchema,
  crearUsuarioSchema,
  listarUsuariosSchema,
  usuarioGetSchema,
  actualizarUsuarioSchema,
  cambiarPasswordSchema,
  eliminarUsuarioSchema,
} from "../plugins/schemas.js";

const registroSchema = z.object({
  tenantNombre: z.string().min(1),
  email: z.string().email(),
  nombre: z.string().min(1),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const nuevoUsuarioSchema = z.object({
  email: z.string().email(),
  nombre: z.string().min(1),
  password: z.string().min(8),
  rol: z.nativeEnum(Rol),
});

const cambiosUsuarioSchema = z
  .object({
    nombre: z.string().min(1).optional(),
    rol: z.nativeEnum(Rol).optional(),
  })
  .refine((c) => c.nombre !== undefined || c.rol !== undefined, {
    message: "Indica al menos un campo a actualizar (nombre o rol)",
  });

const passwordSchema = z.object({ password: z.string().min(8) });

const perfilSchema = z.object({ nombre: z.string().min(1) });

const passwordPropiaSchema = z.object({
  actual: z.string().min(1),
  nueva: z.string().min(8),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  function firmar(payload: JwtPayload): string {
    return app.jwt.sign(payload, { expiresIn: env.JWT_EXPIRES_IN });
  }

  // --- Público ---
  app.post("/auth/registro", { schema: authRegistroSchema }, async (request, reply) => {
    const parsed = registroSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    try {
      const { tenant, usuario } = await usuarioService.registrar(parsed.data);
      const token = firmar({ sub: usuario.id, tenantId: tenant.id, rol: usuario.rol, email: usuario.email });
      return reply.status(201).send({
        token,
        tenant: { id: tenant.id, nombre: tenant.nombre },
        usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
      });
    } catch (err) {
      return reply.status(409).send({ error: (err as Error).message });
    }
  });

  app.post("/auth/login", { schema: authLoginSchema }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
    }
    const usuario = await usuarioService.login(parsed.data.email, parsed.data.password);
    if (!usuario) {
      return reply.status(401).send({ error: "Credenciales inválidas" });
    }
    const token = firmar({ sub: usuario.id, tenantId: usuario.tenantId, rol: usuario.rol, email: usuario.email });
    registrarAuditoria({
      tenantId: usuario.tenantId,
      actor: { id: usuario.id, nombre: usuario.nombre ?? usuario.email, tipo: "usuario", ip: request.ip },
      accion: "auth.login",
      recurso: "sesion",
      detalle: `Inicio de sesión de ${usuario.email}`,
    });
    return { token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } };
  });

  // --- Autenticado ---
  app.get("/auth/yo", { schema: authYoSchema, preHandler: app.authenticate }, async (request) => {
    // Para usuarios humanos incluimos el nombre; una API key de servicio no lo tiene.
    const usuario = await usuarioService.obtenerUsuario(request.user.tenantId, request.user.sub);
    return {
      id: request.user.sub,
      email: usuario?.email ?? request.user.email,
      nombre: usuario?.nombre ?? null,
      rol: request.user.rol,
      tenantId: request.user.tenantId,
    };
  });

  // Actualizar el propio perfil (nombre).
  app.patch(
    "/auth/yo",
    { schema: perfilActualizarSchema, preHandler: app.authenticate },
    async (request, reply) => {
      if (request.user.kind === "service") {
        return reply.status(403).send({ error: "Solo usuarios pueden editar su perfil" });
      }
      const parsed = perfilSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const usuario = await usuarioService.actualizarPerfil(request.user.sub, parsed.data);
      if (!usuario) return reply.status(404).send({ error: "Usuario no encontrado" });
      return usuario;
    },
  );

  // Cambiar la propia contraseña (verifica la actual).
  app.put(
    "/auth/yo/password",
    { schema: perfilPasswordSchema, preHandler: app.authenticate },
    async (request, reply) => {
      if (request.user.kind === "service") {
        return reply.status(403).send({ error: "Solo usuarios pueden cambiar su contraseña" });
      }
      const parsed = passwordPropiaSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      try {
        const usuario = await usuarioService.cambiarPasswordPropia(
          request.user.sub,
          parsed.data.actual,
          parsed.data.nueva,
        );
        if (!usuario) return reply.status(404).send({ error: "Usuario no encontrado" });
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );

  // --- Solo admin (gestión de usuarios) ---
  app.post(
    "/auth/usuarios",
    { schema: crearUsuarioSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request, reply) => {
      const parsed = nuevoUsuarioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      try {
        const usuario = await usuarioService.crearUsuario(request.user.tenantId, parsed.data);
        return reply.status(201).send({
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          rol: usuario.rol,
        });
      } catch (err) {
        return reply.status(409).send({ error: (err as Error).message });
      }
    },
  );

  app.get(
    "/auth/usuarios",
    { schema: listarUsuariosSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request) => {
      return usuarioService.listarUsuarios(request.user.tenantId);
    },
  );

  app.get(
    "/auth/usuarios/:id",
    { schema: usuarioGetSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const usuario = await usuarioService.obtenerUsuario(request.user.tenantId, id);
      if (!usuario) return reply.status(404).send({ error: "Usuario no encontrado" });
      return usuario;
    },
  );

  app.patch(
    "/auth/usuarios/:id",
    { schema: actualizarUsuarioSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = cambiosUsuarioSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      try {
        const usuario = await usuarioService.actualizarUsuario(
          request.user.tenantId,
          id,
          parsed.data,
        );
        if (!usuario) return reply.status(404).send({ error: "Usuario no encontrado" });
        return usuario;
      } catch (err) {
        return reply.status(409).send({ error: (err as Error).message });
      }
    },
  );

  app.put(
    "/auth/usuarios/:id/password",
    { schema: cambiarPasswordSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = passwordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Entrada inválida", detalles: parsed.error.issues });
      }
      const usuario = await usuarioService.cambiarPassword(
        request.user.tenantId,
        id,
        parsed.data.password,
      );
      if (!usuario) return reply.status(404).send({ error: "Usuario no encontrado" });
      return { id: usuario.id, passwordActualizada: true };
    },
  );

  app.delete(
    "/auth/usuarios/:id",
    { schema: eliminarUsuarioSchema, preHandler: app.requierePermiso(Permiso.GestionarUsuarios) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const eliminado = await usuarioService.eliminarUsuario(request.user.tenantId, id);
        if (!eliminado) return reply.status(404).send({ error: "Usuario no encontrado" });
        return reply.status(204).send();
      } catch (err) {
        return reply.status(409).send({ error: (err as Error).message });
      }
    },
  );
}
