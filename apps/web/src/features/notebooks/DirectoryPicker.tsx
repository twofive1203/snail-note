import { useCallback, useEffect, useState } from "react";
import type { DirectoryBrowserResponse } from "@snail-note/shared";
import { notebookApi } from "../file-tree/file-tree-api";

export function DirectoryPicker({ open, onClose, onSelect }: {
  open: boolean;
  onClose: () => void;
  onSelect: (path: string) => Promise<void>;
}) {
  const [browser, setBrowser] = useState<DirectoryBrowserResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setError("");
    try {
      setBrowser(await notebookApi.browseDirectories(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目录读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setBrowser(null);
    setError("");
    void browse();
  }, [browse, open]);

  if (!open) return null;

  const chooseCurrent = async () => {
    if (!browser?.path) return;
    setSubmitting(true);
    setError("");
    try {
      await onSelect(browser.path);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "添加笔记本失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="directory-picker-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="directory-picker" role="dialog" aria-modal="true" aria-label="选择服务端目录">
        <header>
          <div><strong>添加笔记本</strong><span>选择服务端上的文件夹</span></div>
          <button onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="directory-toolbar">
          <button onClick={() => void browse(browser?.parent ?? undefined)} disabled={!browser?.path || loading} title="返回上一级">←</button>
          <code title={browser?.path ?? "服务器磁盘"}>{browser?.path ?? "服务器磁盘"}</code>
        </div>
        <div className="directory-list">
          {loading ? <div className="panel-message">正在读取目录…</div> : null}
          {error ? <div className="panel-message error">{error}</div> : null}
          {!loading && !error && browser?.directories.length === 0 ? <div className="panel-message">该目录没有子目录</div> : null}
          {!loading && !error && browser?.directories.map((directory) => (
            <button key={directory.path} onClick={() => void browse(directory.path)} title={directory.path}>
              <span>▰</span><strong>{directory.name}</strong><i>›</i>
            </button>
          ))}
        </div>
        <footer>
          <span>{browser?.path ? "当前目录将作为独立笔记本，不会复制文件。" : "请选择一个磁盘或目录。"}</span>
          <button onClick={onClose}>取消</button>
          <button className="primary" disabled={!browser?.path || submitting} onClick={() => void chooseCurrent()}>
            {submitting ? "添加中…" : "选择当前目录"}
          </button>
        </footer>
      </section>
    </div>
  );
}
