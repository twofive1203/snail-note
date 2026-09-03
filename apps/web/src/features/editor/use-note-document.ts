import { useCallback, useEffect, useRef, useState } from "react";
import { editorApi } from "./editor-api";

function normalizeEditorContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

export function useNoteDocument(notebookId: string | null, path: string | null) {
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    if (!notebookId || !path) {
      setContent("");
      setPersistedContent("");
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    void editorApi.read(notebookId, path)
      .then((document) => {
        if (sequence !== loadSequence.current) return;
        const normalizedContent = normalizeEditorContent(document.content);
        setContent(normalizedContent);
        setPersistedContent(normalizedContent);
      })
      .catch((cause) => {
        if (sequence !== loadSequence.current) return;
        setError(cause instanceof Error ? cause.message : "笔记加载失败");
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false);
      });
  }, [notebookId, path]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!notebookId || !path || content === persistedContent) return true;
    setSaving(true);
    setError("");
    try {
      const document = await editorApi.save(notebookId, { path, content });
      setPersistedContent(normalizeEditorContent(document.content));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，编辑内容仍保留在当前页面");
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, notebookId, path, persistedContent]);

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
