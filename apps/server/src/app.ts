import { existsSync } from "node:fs";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/notebook-config.js";
import { NotebookError } from "./notebook/notebook-errors.js";
import { NotebookRegistry } from "./notebook/notebook-registry.js";
import { registerNotebookRoutes } from "./notebook/notebook-routes.js";
import { registerSearchRoutes } from "./search/search-routes.js";

export async function buildApp(
  config: AppConfig,
  options: { webRoot?: string } = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const configuredOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configuredOrigins?.length) {
    await app.register(cors, { origin: configuredOrigins });
  } else if (process.env.NODE_ENV !== "production") {
    await app.register(cors, { origin: /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ });
  }

  const registry = await NotebookRegistry.open(config.registryFile, config.initialNotebook);

  app.get("/api/health", async () => ({ status: "ok", notebooks: registry.list().length }));
  await registerNotebookRoutes(app, registry);
  await registerSearchRoutes(app, registry);

  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(fastifyStatic, { root: options.webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "API 接口不存在" } });
      }
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof NotebookError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } });
  });

  return app;
}
