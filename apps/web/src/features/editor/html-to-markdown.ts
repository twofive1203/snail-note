import TurndownService from "turndown";

const START_FRAGMENT = "<!--StartFragment-->";
const END_FRAGMENT = "<!--EndFragment-->";

const SEMANTIC_TAG =
  /<(?:h[1-6]|p|ul|ol|li|table|thead|tbody|tr|th|td|blockquote|pre|code|a|strong|em|b|i|img|hr|del|s|strike|br)\b/i;

const RICH_STYLE =
  /(?:font-weight\s*:\s*(?:bold|[5-9]00)|font-style\s*:\s*italic|text-decoration(?:-line)?\s*:[^;"']*(?:underline|line-through))/i;

const UNSAFE_URL = /^(?:javascript|vbscript):/i;

let converter: TurndownService | null = null;

export function extractClipboardHtmlFragment(html: string): string {
  let source = html;
  const htmlTag = source.search(/<html[\s>]/i);
  if (source.startsWith("Version:") && htmlTag > 0) source = source.slice(htmlTag);

  const start = source.indexOf(START_FRAGMENT);
  const end = source.indexOf(END_FRAGMENT);
  if (start !== -1 && end !== -1 && end > start) {
    return source.slice(start + START_FRAGMENT.length, end).trim();
  }
  return source.trim();
}

export function looksLikeRichHtml(html: string): boolean {
  return SEMANTIC_TAG.test(html) || RICH_STYLE.test(html);
}

export function htmlToMarkdown(html: string): string {
  return normalizePastedMarkdown(getConverter().turndown(html));
}

export function clipboardHtmlToMarkdown(html: string): string | null {
  const fragment = extractClipboardHtmlFragment(html);
  if (!fragment || !looksLikeRichHtml(fragment)) return null;
  try {
    const markdown = htmlToMarkdown(fragment);
    return markdown || null;
  } catch {
    return null;
  }
}

function getConverter(): TurndownService {
  if (converter) return converter;
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
    hr: "---",
    fence: "```",
  });
  service.remove(["script", "noscript", "style", "meta", "link"]);
  service.addRule("unsafeLink", {
    filter: (node) => node.nodeName === "A" && isUnsafeUrl(node.getAttribute("href")),
    replacement: (content) => content,
  });
  service.addRule("unsafeImage", {
    filter: (node) => node.nodeName === "IMG" && isUnsafeUrl(node.getAttribute("src")),
    replacement: () => "",
  });
  service.addRule("unwrapGoogleDocsBold", {
    filter: (node) => (node.nodeName === "B" || node.nodeName === "STRONG") && isNormalWeight(node),
    replacement: (content) => content,
  });
  service.addRule("styledBold", {
    filter: (node) => isStyleSpan(node) && isBold(node) && !hasFormattedAncestor(node, ["STRONG", "B"]),
    replacement: (content) => wrap(content, "**"),
  });
  service.addRule("styledItalic", {
    filter: (node) => isStyleSpan(node) && isItalic(node) && !hasFormattedAncestor(node, ["EM", "I"]),
    replacement: (content) => wrap(content, "*"),
  });
  service.addRule("strikethrough", {
    filter: (node) =>
      node.nodeName === "DEL" ||
      node.nodeName === "S" ||
      node.nodeName === "STRIKE" ||
      (isStyleSpan(node) && hasLineThrough(node)),
    replacement: (content) => wrap(content, "~~"),
  });
  service.addRule("taskListItems", {
    filter: (node) => node.nodeName === "INPUT" && node.getAttribute("type") === "checkbox",
    replacement: (_content, node) => {
      const checked = node.hasAttribute("checked") || (node as HTMLInputElement).checked;
      return `${checked ? "[x]" : "[ ]"} `;
    },
  });
  service.addRule("fencedPre", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => fencedCode(node),
  });
  service.addRule("table", {
    filter: "table",
    replacement: (_content, node) => tableToMarkdown(node, service),
  });
  converter = service;
  return service;
}

function normalizePastedMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isUnsafeUrl(url: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (UNSAFE_URL.test(trimmed)) return true;
  return /^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed);
}

function isStyleSpan(node: HTMLElement): boolean {
  return node.nodeName === "SPAN" || node.nodeName === "FONT";
}

function isBold(node: HTMLElement): boolean {
  const weight = node.style.fontWeight;
  if (weight === "bold" || weight === "bolder") return true;
  const numeric = Number.parseInt(weight, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function isNormalWeight(node: HTMLElement): boolean {
  const weight = node.style.fontWeight;
  return weight === "normal" || weight === "400";
}

function isItalic(node: HTMLElement): boolean {
  const style = node.style.fontStyle;
  return style === "italic" || style === "oblique";
}

function hasLineThrough(node: HTMLElement): boolean {
  return `${node.style.textDecoration} ${node.style.textDecorationLine}`.includes("line-through");
}

function hasFormattedAncestor(node: HTMLElement, tags: string[]): boolean {
  let current = node.parentElement;
  while (current) {
    if (tags.includes(current.nodeName) && !isNormalWeight(current)) return true;
    current = current.parentElement;
  }
  return false;
}

function wrap(content: string, delimiter: string): string {
  const trimmed = content.trim();
  if (!trimmed) return content;
  if (trimmed.startsWith(delimiter) && trimmed.endsWith(delimiter) && trimmed.length >= delimiter.length * 2) {
    return content;
  }
  return `${delimiter}${content}${delimiter}`;
}

function languageFromClass(className: string): string {
  const match = className.match(/(?:language|lang|highlight-source)-(\S+)/i);
  return match?.[1] ?? "";
}

function fencedCode(node: HTMLElement): string {
  const codeNode = node.querySelector("code") ?? node;
  const code = (codeNode.textContent ?? "").replace(/\n$/, "");
  const language = languageFromClass(`${node.getAttribute("class") ?? ""} ${codeNode.getAttribute("class") ?? ""}`);
  let fenceSize = 3;
  const fencePattern = /^`{3,}/gm;
  for (const line of code.match(fencePattern) ?? []) {
    if (line.length >= fenceSize) fenceSize = line.length + 1;
  }
  const fence = "`".repeat(fenceSize);
  return `\n\n${fence}${language}\n${code}\n${fence}\n\n`;
}

function tableToMarkdown(table: HTMLElement, service: TurndownService): string {
  const rows = Array.from(table.querySelectorAll("tr")).filter((row) => row.closest("table") === table);
  const rendered = rows.map((row) => {
    const cells = Array.from(row.children).filter((cell) => cell.nodeName === "TH" || cell.nodeName === "TD");
    return cells.map((cell) => escapeTableCell(service.turndown((cell as HTMLElement).innerHTML)));
  });
  const width = rendered.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0) return "";

  const padded = rendered.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  const header = padded[0];
  if (!header) return "";
  const body = padded.slice(1);
  const separator = header.map(() => "---");
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return `\n\n${[line(header), line(separator), ...body.map(line)].join("\n")}\n\n`;
}

function escapeTableCell(markdown: string): string {
  return markdown.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}
