import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { type NoteImageContext, toDisplayImageSrc } from "./image-url";
import { mountMermaid } from "./mermaid-render";
import { renderMarkdown } from "./preview-highlight";

function isMermaidCode(code: Element) {
  const lang = (code.className.match(/language-(\S+)/i)?.[1] ?? "").toLowerCase();
  return lang === "mermaid";
}

function rewriteImageSources(html: string, context?: NoteImageContext | null) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const next = toDisplayImageSrc(img.getAttribute("src") ?? "", context);
    if (next) img.setAttribute("src", next);
    img.setAttribute("referrerpolicy", "no-referrer");
  }
  return doc.body.innerHTML;
}

export function MarkdownPreview({
  content,
  notebookId,
  notePath,
}: {
  content: string;
  notebookId?: string | null;
  notePath?: string | null;
}) {
  const context = notebookId && notePath ? { notebookId, notePath } : null;
  const html = useMemo(
    () => DOMPurify.sanitize(rewriteImageSources(renderMarkdown(content), context), { ADD_ATTR: ["referrerpolicy"] }),
    [content, notebookId, notePath],
  );
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let cancelled = false;
    for (const code of el.querySelectorAll("pre code")) {
      if (!isMermaidCode(code)) continue;
      const pre = code.closest("pre");
      if (!pre) continue;
      const host = document.createElement("div");
      host.className = "sn-mermaid";
      host.setAttribute("role", "img");
      host.setAttribute("aria-label", "Mermaid 图");
      pre.replaceWith(host);
      void mountMermaid(host, code.textContent ?? "", () => cancelled);
    }
    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <article
      ref={root}
      className="markdown-preview"
      aria-label="Markdown 预览"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
