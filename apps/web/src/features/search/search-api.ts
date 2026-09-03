import type { SearchResponse } from "@snail-note/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export async function searchNotes(notebookId: string, query: string): Promise<SearchResponse> {
  const response = await fetch(`${API_BASE}/api/notebooks/${encodeURIComponent(notebookId)}/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || "搜索失败");
  }
  return response.json() as Promise<SearchResponse>;
}
