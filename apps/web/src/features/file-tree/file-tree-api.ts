import type {
  CreateDirectoryRequest,
  CreateNoteRequest,
  CreateNotebookRequest,
  DirectoryBrowserResponse,
  MoveEntryRequest,
  NoteDocument,
  NotebookListResponse,
  NotebookSummary,
  NotebookTreeResponse,
  SaveAssetRequest,
  SavedAsset,
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

function notebookUrl(notebookId: string, suffix = ""): string {
  return `/api/notebooks/${encodeURIComponent(notebookId)}${suffix}`;
}

export const notebookApi = {
  list: () => request<NotebookListResponse>("/api/notebooks"),
  add: (body: CreateNotebookRequest) => request<NotebookSummary>("/api/notebooks", { method: "POST", body: JSON.stringify(body) }),
  removeNotebook: (notebookId: string) => request<void>(notebookUrl(notebookId), { method: "DELETE" }),
  browseDirectories: (path?: string) => request<DirectoryBrowserResponse>(`/api/directories${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  tree: (notebookId: string) => request<NotebookTreeResponse>(notebookUrl(notebookId, "/tree")),
  read: (notebookId: string, path: string) => request<NoteDocument>(`${notebookUrl(notebookId, "/file")}?path=${encodeURIComponent(path)}`),
  save: (notebookId: string, body: SaveNoteRequest) => request<NoteDocument>(notebookUrl(notebookId, "/file"), { method: "PUT", body: JSON.stringify(body) }),
  createNote: (notebookId: string, body: CreateNoteRequest) => request<NoteDocument>(notebookUrl(notebookId, "/file"), { method: "POST", body: JSON.stringify(body) }),
  createDirectory: (notebookId: string, body: CreateDirectoryRequest) => request<{ path: string }>(notebookUrl(notebookId, "/directory"), { method: "POST", body: JSON.stringify(body) }),
  move: (notebookId: string, body: MoveEntryRequest) => request<{ path: string }>(notebookUrl(notebookId, "/entry"), { method: "PATCH", body: JSON.stringify(body) }),
  remove: (notebookId: string, path: string) => request<void>(`${notebookUrl(notebookId, "/entry")}?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  saveAsset: (notebookId: string, body: SaveAssetRequest) =>
    request<SavedAsset>(notebookUrl(notebookId, "/asset"), { method: "POST", body: JSON.stringify(body) }),
};
