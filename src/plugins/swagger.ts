/**
 * Registro de Swagger / OpenAPI. La documentación interactiva queda en /docs.
 */
import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import scalarApiReference from "@scalar/fastify-api-reference";
import { env } from "../config/env.js";

export function registrarSwagger(app: FastifyInstance): void {
  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Factu — API de facturación electrónica de Costa Rica",
        description:
          "API para emitir comprobantes electrónicos (v4.4) ante el Ministerio de Hacienda de Costa Rica: " +
          "autenticación, gestión de emisores y certificados, generación y firma XAdES, envío y consulta de estado.",
        version: "0.1.0",
      },
      servers: [{ url: "http://localhost:3000", description: "Local" }],
      tags: [
        { name: "Autenticación", description: "Registro, login y gestión de usuarios (tenants y roles)" },
        { name: "Usuarios", description: "Ciclo de vida de los usuarios de tu organización" },
        { name: "Estadísticas", description: "Métricas agregadas de tu organización" },
        { name: "Hacienda", description: "Sesión con el IDP de Hacienda por emisor" },
        { name: "Emisores", description: "Registro de emisores y carga de certificados" },
        { name: "Comprobantes", description: "Emisión y consulta de comprobantes" },
        { name: "Firma", description: "Firma XAdES (utilidades de prueba)" },
        { name: "Utilidades", description: "Salud y utilidades varias" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Token JWT obtenido en POST /auth/login o /auth/registro",
          },
        },
      },
    },
  });

  // La documentación interactiva expone el mapa completo de la API. En
  // producción se apaga salvo que se pida explícitamente con DOCS_PUBLICAS.
  // Por defecto: encendida en desarrollo, apagada en producción.
  const publicar = env.DOCS_PUBLICAS ?? env.NODE_ENV !== "production";
  if (!publicar) {
    app.log?.info?.("[docs] documentación interactiva desactivada (DOCS_PUBLICAS=false)");
    return;
  }

  // UI clásica de Swagger (queda en /swagger)
  app.register(fastifySwaggerUi, {
    routePrefix: "/swagger",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // UI moderna (Scalar) como documentación principal en /docs
  app.register(scalarApiReference, {
    routePrefix: "/docs",
    configuration: {
      url: "/swagger/json",
      theme: "purple",
      metaData: { title: "Factu · API de facturación electrónica CR" },
    },
  });
}
