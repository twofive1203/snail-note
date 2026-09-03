import type { FastifyInstance } from "fastify";
import { NotebookRegistry } from "../notebook/notebook-registry.js";
import { SearchService } from "./search-service.js";

export async function registerSearchRoutes(app: FastifyInstance, registry: NotebookRegistry): Promise<void> {
  app.get<{ Params: { notebookId: string }; Querystring: { q?: string } }>(
    "/api/notebooks/:notebookId/search",
    async (request) => {
      const query = typeof request.query.q === "string" ? request.query.q : "";
      const search = new SearchService(registry.service(request.params.notebookId));
      return { query: query.trim(), matches: await search.search(query) };
    },
  );
}
