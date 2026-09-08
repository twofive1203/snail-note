import hljs from "highlight.js/lib/common";
import { marked } from "marked";
import { fenceInfoName } from "./code-languages";
import { toDisplayImageSrc } from "./image-url";

const PREVIEW_ALIASES: Record<string, string> = {
  curl: "bash",
  console: "bash",
  terminal: "bash",
  sh: "bash",
  zsh: "bash",
  cmd: "bash",
  ts: "typescript",
  js: "javascript",
  yml: "yaml",
};

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function previewLanguage(info?: string) {
  const name = fenceInfoName(info ?? "");
  if (!name || name === "mermaid") return "";
  const resolved = PREVIEW_ALIASES[name] ?? name;
  return hljs.getLanguage(resolved) ? resolved : "";
}

marked.use({
  breaks: true,
  renderer: {
    image({ href, title, text }) {
      const src = escapeHtml(toDisplayImageSrc(href ?? "") ?? href ?? "");
      const alt = escapeHtml(text ?? "");
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${src}" alt="${alt}" referrerpolicy="no-referrer"${titleAttr}>`;
    },
    code({ text, lang }) {
      const name = fenceInfoName(lang ?? "");
      if (name === "mermaid") {
        return `<pre><code class="language-mermaid">${escapeHtml(text)}</code></pre>\n`;
      }
      const resolved = previewLanguage(lang);
      const body = resolved ? hljs.highlight(text, { language: resolved, ignoreIllegals: true }).value : escapeHtml(text);
      const cls = resolved ? `hljs language-${resolved}` : "hljs";
      return `<pre><code class="${cls}">${body}</code></pre>\n`;
    },
  },
});

export function renderMarkdown(content: string) {
  return marked.parse(content, { breaks: true }) as string;
}
