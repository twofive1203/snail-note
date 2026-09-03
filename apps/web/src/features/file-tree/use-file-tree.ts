import { useCallback, useEffect, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import { notebookApi } from "./file-tree-api";

export function useFileTree() {
  const [nodes, setNodes] = useState<NotebookNode[]>([]);
  const [notebookName, setNotebookName] = useState("笔记本");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const tree = await notebookApi.tree();
      setNodes(tree.root);
      setNotebookName(tree.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "文件树加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { nodes, notebookName, loading, error, refresh };
}
