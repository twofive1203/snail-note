import { useCallback, useEffect, useRef, useState } from "react";
import type { NotebookNode } from "@snail-note/shared";
import { notebookApi } from "./file-tree-api";

export function useFileTree(notebookId: string | null) {
  const [nodes, setNodes] = useState<NotebookNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!notebookId) {
      setNodes([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const tree = await notebookApi.tree(notebookId);
      if (sequence === loadSequence.current) setNodes(tree.root);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setNodes([]);
      setError(cause instanceof Error ? cause.message : "文件树加载失败");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { nodes, loading, error, refresh };
}
