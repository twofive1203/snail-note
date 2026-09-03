import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { mountMermaid } from "./mermaid-render";

function isMermaidCode(code: Element) {
  const lang = (code.className.match(/language-(\S+)/i)?.[1] ?? "").toLowerCase();
  return lang === "mermaid";
}

export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content, { breaks: true }) as string), [content]);
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
