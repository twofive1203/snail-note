import type {
  CreateDirectoryRequest,
  CreateNoteRequest,
  MoveEntryRequest,
  SaveNoteRequest,
} from "@snail-note/shared";
import type { FastifyInstance } from "fastify";
import { NotebookError } from "./notebook-errors.js";
import { NotebookService } from "./notebook-service.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new NotebookError("INVALID_OPERATION", `字段 ${field} 必须是字符串`);
  }
  return value;
}

export async function registerNotebookRoutes(app: FastifyInstance, notebook: NotebookService): Promise<void> {
  app.get("/api/notebook/tree", async () => ({ name: notebook.name, root: await notebook.getTree() }));

  app.get<{ Querystring: { path?: string } }>("/api/notebook/file", async (request) => {
    return notebook.readNote(requireString(request.query.path, "path"));
  });

  app.put<{ Body: SaveNoteRequest }>("/api/notebook/file", async (request) => {
    const body = request.body ?? ({} as SaveNoteRequest);
    return notebook.saveNote(requireString(body.path, "path"), requireString(body.content, "content"));
  });

  app.post<{ Body: CreateNoteRequest }>("/api/notebook/file", async (request, reply) => {
    const body = request.body ?? ({} as CreateNoteRequest);
    const note = await notebook.createNote(
      requireString(body.path, "path"),
      body.content === undefined ? "" : requireString(body.content, "content"),
    );
    return reply.code(201).send(note);
  });

  app.post<{ Body: CreateDirectoryRequest }>("/api/notebook/directory", async (request, reply) => {
    const body = request.body ?? ({} as CreateDirectoryRequest);
    const path = await notebook.createDirectory(requireString(body.path, "path"));
    return reply.code(201).send({ path });
  });

  app.patch<{ Body: MoveEntryRequest }>("/api/notebook/entry", async (request) => {
    const body = request.body ?? ({} as MoveEntryRequest);
    const path = await notebook.moveEntry(
      requireString(body.path, "path"),
      requireString(body.newPath, "newPath"),
    );
    return { path };
  });

  app.delete<{ Querystring: { path?: string } }>("/api/notebook/entry", async (request, reply) => {
    await notebook.deleteEntry(requireString(request.query.path, "path"));
    return reply.code(204).send();
  });
}
