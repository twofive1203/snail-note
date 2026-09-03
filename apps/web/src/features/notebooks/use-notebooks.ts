import { useCallback, useEffect, useState } from "react";
import type { NotebookSummary } from "@snail-note/shared";
import { notebookApi } from "../file-tree/file-tree-api";

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await notebookApi.list();
      setNotebooks(response.notebooks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "笔记本列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(async (root: string): Promise<NotebookSummary> => {
    const notebook = await notebookApi.add({ root });
    setNotebooks((current) => [...current, notebook]);
    return notebook;
  }, []);

  const remove = useCallback(async (notebookId: string): Promise<void> => {
    await notebookApi.removeNotebook(notebookId);
    setNotebooks((current) => current.filter(({ id }) => id !== notebookId));
  }, []);

  return { notebooks, loading, error, refresh, add, remove };
}
