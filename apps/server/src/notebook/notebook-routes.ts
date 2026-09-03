import type {
  CreateDirectoryRequest,
  CreateNoteRequest,
  CreateNotebookRequest,
  MoveEntryRequest,
  SaveNoteRequest,
} from "@snail-note/shared";
import type { FastifyInstance } from "fastify";
import { DirectoryBrowserService } from "./directory-browser-service.js";
import { NotebookError } from "./notebook-errors.js";
import { NotebookRegistry } from "./notebook-registry.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new NotebookError("INVALID_OPERATION", `字段 ${field} 必须是字符串`);
  }
  return value;
}

interface NotebookParams {
  notebookId: string;
}

export async function registerNotebookRoutes(app: FastifyInstance, registry: NotebookRegistry): Promise<void> {
  const directoryBrowser = new DirectoryBrowserService();

  app.get("/api/notebooks", async () => ({ notebooks: registry.list() }));

  app.post<{ Body: CreateNotebookRequest }>("/api/notebooks", async (request, reply) => {
    const body = request.body ?? ({} as CreateNotebookRequest);
    const notebook = await registry.add({
      root: requireString(body.root, "root"),
      ...(body.name === undefined ? {} : { name: requireString(body.name, "name") }),
    });
    return reply.code(201).send(notebook);
  });

  app.delete<{ Params: NotebookParams }>("/api/notebooks/:notebookId", async (request, reply) => {
    await registry.remove(request.params.notebookId);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { path?: string } }>("/api/directories", async (request) => {
    return directoryBrowser.browse(typeof request.query.path === "string" ? request.query.path : undefined);
  });

  app.get<{ Params: NotebookParams }>("/api/notebooks/:notebookId/tree", async (request) => {
    const summary = registry.get(request.params.notebookId);
    return { notebook: summary, root: await registry.service(summary.id).getTree() };
  });

  app.get<{ Params: NotebookParams; Querystring: { path?: string } }>("/api/notebooks/:notebookId/file", async (request) => {
    return registry.service(request.params.notebookId).readNote(requireString(request.query.path, "path"));
  });

  app.put<{ Params: NotebookParams; Body: SaveNoteRequest }>("/api/notebooks/:notebookId/file", async (request) => {
    const body = request.body ?? ({} as SaveNoteRequest);
    return registry.service(request.params.notebookId).saveNote(
      requireString(body.path, "path"),
      requireString(body.content, "content"),
    );
  });

  app.post<{ Params: NotebookParams; Body: CreateNoteRequest }>("/api/notebooks/:notebookId/file", async (request, reply) => {
    const body = request.body ?? ({} as CreateNoteRequest);
    const note = await registry.service(request.params.notebookId).createNote(
      requireString(body.path, "path"),
      body.content === undefined ? "" : requireString(body.content, "content"),
    );
    return reply.code(201).send(note);
  });

  app.post<{ Params: NotebookParams; Body: CreateDirectoryRequest }>("/api/notebooks/:notebookId/directory", async (request, reply) => {
    const body = request.body ?? ({} as CreateDirectoryRequest);
    const path = await registry.service(request.params.notebookId).createDirectory(requireString(body.path, "path"));
    return reply.code(201).send({ path });
  });

  app.patch<{ Params: NotebookParams; Body: MoveEntryRequest }>("/api/notebooks/:notebookId/entry", async (request) => {
    const body = request.body ?? ({} as MoveEntryRequest);
    const path = await registry.service(request.params.notebookId).moveEntry(
      requireString(body.path, "path"),
      requireString(body.newPath, "newPath"),
    );
    return { path };
  });

  app.delete<{ Params: NotebookParams; Querystring: { path?: string } }>("/api/notebooks/:notebookId/entry", async (request, reply) => {
    await registry.service(request.params.notebookId).deleteEntry(requireString(request.query.path, "path"));
    return reply.code(204).send();
  });
}
