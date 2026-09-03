import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

export function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content, { breaks: true }) as string), [content]);
  return (
    <article
      className="markdown-preview"
      aria-label="Markdown 预览"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
