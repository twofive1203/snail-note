import type {
  CreateDirectoryRequest,
  CreateNoteRequest,
  MoveEntryRequest,
  NoteDocument,
  NotebookTreeResponse,
  SaveNoteRequest,
} from "@snail-note/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(body?.error?.message || `请求失败 (${response.status})`, body?.error?.code);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const notebookApi = {
  tree: () => request<NotebookTreeResponse>("/api/notebook/tree"),
  read: (path: string) => request<NoteDocument>(`/api/notebook/file?path=${encodeURIComponent(path)}`),
  save: (body: SaveNoteRequest) => request<NoteDocument>("/api/notebook/file", { method: "PUT", body: JSON.stringify(body) }),
  createNote: (body: CreateNoteRequest) => request<NoteDocument>("/api/notebook/file", { method: "POST", body: JSON.stringify(body) }),
  createDirectory: (body: CreateDirectoryRequest) => request<{ path: string }>("/api/notebook/directory", { method: "POST", body: JSON.stringify(body) }),
  move: (body: MoveEntryRequest) => request<{ path: string }>("/api/notebook/entry", { method: "PATCH", body: JSON.stringify(body) }),
  remove: (path: string) => request<void>(`/api/notebook/entry?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
};
