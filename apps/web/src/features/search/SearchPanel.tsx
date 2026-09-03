import { useEffect, useRef, useState } from "react";
import type { SearchMatch } from "@snail-note/shared";
import { searchNotes } from "./search-api";

function highlightedSnippet(snippet: string, query: string) {
  if (!query) return snippet;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return snippet.split(new RegExp(`(${escaped})`, "gi")).map((part, index) =>
    part.toLocaleLowerCase() === query.toLocaleLowerCase()
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part,
  );
}

export function SearchPanel({ open, notebookId, onClose, onOpenFile }: {
  open: boolean;
  notebookId: string | null;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || !notebookId || !query.trim()) {
      setMatches([]);
      setError("");
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void searchNotes(notebookId, query)
        .then((response) => current && setMatches(response.matches))
        .catch((cause) => current && setError(cause instanceof Error ? cause.message : "搜索失败"))
        .finally(() => current && setLoading(false));
    }, 220);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [notebookId, open, query]);

  if (!open) return null;
  return (
    <div className="search-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="search-dialog" role="dialog" aria-modal="true" aria-label="搜索笔记">
        <div className="search-input-row">
          <span aria-hidden="true">⌕</span>
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记内容…" />
          <kbd>ESC</kbd>
        </div>
        <div className="search-results">
          {!query.trim() ? <div className="panel-message">输入关键词开始搜索…</div> : null}
          {loading ? <div className="panel-message">正在搜索…</div> : null}
          {error ? <div className="panel-message error">{error}</div> : null}
          {!loading && !error && query.trim() && matches.length === 0 ? <div className="panel-message">没有找到“{query}”</div> : null}
          {!loading && matches.map((match) => (
            <button key={match.path} className="search-result" onClick={() => { onOpenFile(match.path); onClose(); }}>
              <strong><span className="search-file-icon">◇</span>{match.title}</strong>
              <span className="search-path">{match.path} · 第 {match.line} 行</span>
              <span className="search-snippet">{highlightedSnippet(match.snippet, query.trim())}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
