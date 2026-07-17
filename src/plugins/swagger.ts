/**
 * Registro de Swagger / OpenAPI. La documentación interactiva queda en /docs.
 */
import type { FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";

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
        { name: "Auth", description: "Autenticación contra el IDP de Hacienda" },
        { name: "Emisores", description: "Registro de emisores y carga de certificados" },
        { name: "Comprobantes", description: "Emisión y consulta de comprobantes" },
        { name: "Firma", description: "Firma XAdES (utilidades de prueba)" },
        { name: "Utilidades", description: "Salud y utilidades varias" },
      ],
    },
  });

  app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });
}
