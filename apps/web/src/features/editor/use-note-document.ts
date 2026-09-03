import { useCallback, useEffect, useRef, useState } from "react";
import { editorApi } from "./editor-api";

export function useNoteDocument(path: string | null) {
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    if (!path) {
      setContent("");
      setPersistedContent("");
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    void editorApi.read(path)
      .then((document) => {
        if (sequence !== loadSequence.current) return;
        setContent(document.content);
        setPersistedContent(document.content);
      })
      .catch((cause) => {
        if (sequence !== loadSequence.current) return;
        setError(cause instanceof Error ? cause.message : "笔记加载失败");
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false);
      });
  }, [path]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!path || content === persistedContent) return true;
    setSaving(true);
    setError("");
    try {
      const document = await editorApi.save({ path, content });
      setPersistedContent(document.content);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，编辑内容仍保留在当前页面");
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, path, persistedContent]);

  return {
    content,
    setContent,
    dirty: content !== persistedContent,
    loading,
    saving,
    error,
    save,
  };
}
