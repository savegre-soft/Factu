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
import { ponerCookieSesion, borrarCookieSesion } from "../plugins/sesionCookie.js";
import {
  cuentaService,
  passwordResetService,
  proveedorOAuth,
  proveedoresConfigurados,
  firmarEstado,
  verificarEstado,
} from "../services/cuentas/index.js";
import { Permiso, Rol } from "../domain/auth/roles.js";
import type { JwtPayload } from "../plugins/auth.js";
import {
  authRegistroSchema,
  authLoginSchema,
  authLogoutSchema,
  authYoSchema,
  perfilActualizarSchema,
  perfilPasswordSchema,
  crearUsuarioSchema,
  listarUsuariosSchema,
  usuarioGetSchema,
  actualizarUsuarioSchema,
  cambiarPasswordSchema,
  eliminarUsuarioSchema,
  oauthProveedoresSchema,
  oauthUrlSchema,
  oauthVincularUrlSchema,
  oauthCallbackSchema,
  identidadesListarSchema,
  identidadDesvincularSchema,
  passwordOlvideSchema,
  passwordResetSchema,
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
      // La sesión del navegador va en la cookie httpOnly; el token en el cuerpo
      // se mantiene para clientes que no son un navegador.
      ponerCookieSesion(reply, token);
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
    ponerCookieSesion(reply, token);
    return { token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } };
  });

  /** Cierra la sesión del navegador borrando la cookie. */
  app.post("/auth/logout", { schema: authLogoutSchema }, async (_request, reply) => {
    borrarCookieSesion(reply);
    return { ok: true };
  });

  // --- OAuth (Google / Microsoft) ---
  const redirectUri = (provider: string) => `${env.API_PUBLIC_URL}/auth/oauth/${provider}/callback`;

  app.get("/auth/oauth/proveedores", { schema: oauthProveedoresSchema }, async () =>
    proveedoresConfigurados(),
  );

  // URL de consentimiento para iniciar sesión / registrarse (público).
  app.get("/auth/oauth/:provider/url", { schema: oauthUrlSchema }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const prov = proveedorOAuth(provider);
    if (!prov || !prov.configurado()) {
      return reply.status(400).send({ error: `El proveedor "${provider}" no está disponible` });
    }
    const state = firmarEstado({ intent: "login" });
    return { url: prov.urlAutorizacion(state, redirectUri(provider)) };
  });

  // URL de consentimiento para VINCULAR desde el perfil (autenticado).
  app.post(
    "/auth/oauth/:provider/url",
    { schema: oauthVincularUrlSchema, preHandler: app.authenticate },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };
      const prov = proveedorOAuth(provider);
      if (!prov || !prov.configurado()) {
        return reply.status(400).send({ error: `El proveedor "${provider}" no está disponible` });
      }
      const state = firmarEstado({ intent: "link", userId: request.user.sub });
      return { url: prov.urlAutorizacion(state, redirectUri(provider)) };
    },
  );

  // Callback: canjea el code, resuelve la cuenta y redirige al frontend.
  app.get("/auth/oauth/:provider/callback", { schema: oauthCallbackSchema }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { code, state } = request.query as { code?: string; state?: string };
    const prov = proveedorOAuth(provider);

    const estado = state ? verificarEstado(state) : null;
    const esVinculo = estado?.intent === "link";
    const okBase = esVinculo ? `${env.APP_URL}/perfil` : `${env.APP_URL}/oauth/callback`;
    const fail = (msg: string) =>
      reply.redirect(
        esVinculo
          ? `${okBase}?error=${encodeURIComponent(msg)}`
          : `${okBase}#error=${encodeURIComponent(msg)}`,
      );

    if (!prov) return fail("Proveedor desconocido");
    if (!code || !estado) return fail("Solicitud OAuth inválida o vencida");

    try {
      const perfil = await prov.intercambiar(code, redirectUri(provider));
      const { usuario } = await cuentaService.resolverOAuth(prov.clave, perfil, estado);

      if (esVinculo) {
        registrarAuditoria({
          tenantId: usuario.tenantId,
          actor: { id: usuario.id, nombre: usuario.nombre, tipo: "usuario", ip: request.ip },
          accion: "auth.oauth.vincular",
          recurso: "identidad",
          detalle: `${provider} (${perfil.email})`,
        });
        return reply.redirect(`${okBase}?vinculado=${provider}`);
      }

      const token = firmar({ sub: usuario.id, tenantId: usuario.tenantId, rol: usuario.rol, email: usuario.email });
      registrarAuditoria({
        tenantId: usuario.tenantId,
        actor: { id: usuario.id, nombre: usuario.nombre, tipo: "usuario", ip: request.ip },
        accion: "auth.login",
        recurso: "sesion",
        detalle: `Inicio de sesión con ${provider} (${usuario.email})`,
      });
      // Con la cookie ya no hace falta pasar el token por la URL, donde queda
      // en el historial del navegador.
      ponerCookieSesion(reply, token);
      return reply.redirect(`${okBase}?sesion=iniciada`);
    } catch (err) {
      return fail((err as Error).message);
    }
  });

  // --- Reseteo de contraseña ---
  app.post("/auth/password/olvide", { schema: passwordOlvideSchema }, async (request) => {
    const { email } = request.body as { email: string };
    await passwordResetService.solicitar(email);
    // Respuesta idéntica exista o no el correo (no enumeración).
    return { ok: true };
  });

  app.post("/auth/password/reset", { schema: passwordResetSchema }, async (request, reply) => {
    const { email, codigo, password } = request.body as {
      email: string;
      codigo: string;
      password: string;
    };
    if (password.length < 8) {
      return reply.status(400).send({ error: "La contraseña debe tener al menos 8 caracteres" });
    }
    try {
      await passwordResetService.resetear(email, codigo, password);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // --- Autenticado ---
  // Cuentas OAuth vinculadas del usuario actual.
  app.get("/auth/yo/identidades", { schema: identidadesListarSchema, preHandler: app.authenticate }, async (request) => {
    const identidades = await cuentaService.listarIdentidades(request.user.sub);
    return identidades.map((i) => ({ provider: i.provider, email: i.email, createdAt: i.createdAt }));
  });

  app.delete(
    "/auth/yo/identidades/:provider",
    { schema: identidadDesvincularSchema, preHandler: app.authenticate },
    async (request, reply) => {
      const { provider } = request.params as { provider: string };
      if (provider !== "google" && provider !== "microsoft") {
        return reply.status(400).send({ error: "Proveedor desconocido" });
      }
      try {
        const ok = await cuentaService.desvincular(request.user.sub, provider);
        if (!ok) return reply.status(404).send({ error: "No tienes esa cuenta vinculada" });
        return { provider, desvinculado: true };
      } catch (err) {
        return reply.status(400).send({ error: (err as Error).message });
      }
    },
  );
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
