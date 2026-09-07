import { useCallback, useEffect, useRef, useState } from "react";
import { editorApi } from "./editor-api";

export const DEFAULT_AUTO_SAVE_MS = 1000;

function normalizeEditorContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function documentKey(notebookId: string | null, path: string | null): string {
  return notebookId && path ? `${notebookId}\n${path}` : "";
}

export function useNoteDocument(
  notebookId: string | null,
  path: string | null,
  { autoSaveMs = DEFAULT_AUTO_SAVE_MS }: { autoSaveMs?: number } = {},
) {
  const requestKey = documentKey(notebookId, path);
  const [content, setContent] = useState("");
  const [persistedContent, setPersistedContent] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const notebookIdRef = useRef(notebookId);
  const pathRef = useRef(path);
  const contentRef = useRef(content);
  const persistedRef = useRef(persistedContent);
  const saveChain = useRef(Promise.resolve(true));
  notebookIdRef.current = notebookId;
  pathRef.current = path;
  contentRef.current = content;
  persistedRef.current = persistedContent;
  const loading = Boolean(requestKey) && loadedKey !== requestKey;

  useEffect(() => {
    const sequence = ++loadSequence.current;
    if (!notebookId || !path) {
      setContent("");
      setPersistedContent("");
      setError("");
      setLoadedKey("");
      return;
    }

    const targetKey = documentKey(notebookId, path);
    setError("");
    void editorApi.read(notebookId, path)
      .then((document) => {
        if (sequence !== loadSequence.current) return;
        const normalizedContent = normalizeEditorContent(document.content);
        setContent(normalizedContent);
        setPersistedContent(normalizedContent);
        setLoadedKey(targetKey);
      })
      .catch((cause) => {
        if (sequence !== loadSequence.current) return;
        setError(cause instanceof Error ? cause.message : "笔记加载失败");
        setContent("");
        setPersistedContent("");
        setLoadedKey(targetKey);
      });
  }, [notebookId, path]);

  const save = useCallback((): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      const targetNotebook = notebookIdRef.current;
      const targetPath = pathRef.current;
      const snapshot = normalizeEditorContent(contentRef.current);
      if (!targetNotebook || !targetPath || snapshot === persistedRef.current) return true;
      setSaving(true);
      setError("");
      try {
        const document = await editorApi.save(targetNotebook, { path: targetPath, content: snapshot });
        if (notebookIdRef.current !== targetNotebook || pathRef.current !== targetPath) return true;
        const normalized = normalizeEditorContent(document.content);
        persistedRef.current = normalized;
        setPersistedContent(normalized);
        return true;
      } catch (cause) {
        if (notebookIdRef.current === targetNotebook && pathRef.current === targetPath) {
          setError(cause instanceof Error ? cause.message : "保存失败，编辑内容仍保留在当前页面");
        }
        return false;
      } finally {
        setSaving(false);
      }
    };
    const next = saveChain.current.then(run, run);
    saveChain.current = next.then(() => true, () => true);
    return next;
  }, []);

  useEffect(() => {
    if (!autoSaveMs || loading || !notebookId || !path || content === persistedContent) return;
    const timer = window.setTimeout(() => {
      void save();
    }, autoSaveMs);
    return () => window.clearTimeout(timer);
  }, [autoSaveMs, content, loading, notebookId, path, persistedContent, save]);

  useEffect(() => {
    const flush = () => {
      if (contentRef.current === persistedRef.current) return;
      void save();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [save]);

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
