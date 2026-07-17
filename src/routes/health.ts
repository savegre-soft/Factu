import type { FastifyInstance } from "fastify";
import { healthSchema } from "../plugins/schemas.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", { schema: healthSchema }, async () => ({ status: "ok", service: "factu" }));
}
