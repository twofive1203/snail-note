import type { FastifyInstance } from "fastify";
import { SearchService } from "./search-service.js";

export async function registerSearchRoutes(app: FastifyInstance, search: SearchService): Promise<void> {
  app.get<{ Querystring: { q?: string } }>("/api/search", async (request) => {
    const query = typeof request.query.q === "string" ? request.query.q : "";
    return { query: query.trim(), matches: await search.search(query) };
  });
}
