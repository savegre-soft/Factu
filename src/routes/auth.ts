/**
 * Autenticación de usuarios de la API (tenants, roles, multiusuario).
 *
 *  POST /auth/registro   → crea un tenant + usuario admin (público)
 *  POST /auth/login      → devuelve un JWT (público)
 *  GET  /auth/yo         → perfil del usuario autenticado
 *  POST /auth/usuarios   → admin crea usuarios en su tenant
 *  GET  /auth/usuarios   → admin lista los usuarios de su tenant
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { usuarioService } from "../services/usuarios/index.js";
import { Permiso, Rol } from "../domain/auth/roles.js";
import type { JwtPayload } from "../plugins/auth.js";
import {
  authRegistroSchema,
  authLoginSchema,
  authYoSchema,
  crearUsuarioSchema,
  listarUsuariosSchema,
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
    return { token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } };
  });

  // --- Autenticado ---
  app.get("/auth/yo", { schema: authYoSchema, preHandler: app.authenticate }, async (request) => {
    return {
      id: request.user.sub,
      email: request.user.email,
      rol: request.user.rol,
      tenantId: request.user.tenantId,
    };
  });

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
}
