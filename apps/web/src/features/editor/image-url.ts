const UNSAFE_SRC = /^(?:javascript|vbscript):/i;

export interface NoteImageContext {
  notebookId: string;
  notePath: string;
}

export function unwrapMarkdownDestination(raw: string): string {
  let src = raw.trim();
  if (src.startsWith("<") && src.endsWith(">")) src = src.slice(1, -1).trim();
  return src;
}

export function isUnsafeSrc(src: string): boolean {
  if (UNSAFE_SRC.test(src)) return true;
  return /^data:/i.test(src) && !/^data:image\//i.test(src);
}

export function isRemoteImageSrc(src: string): boolean {
  const value = unwrapMarkdownDestination(src);
  return value.startsWith("//") || /^https?:\/\//i.test(value) || value.startsWith("data:image/");
}

export function toMarkdownImageSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let src = unwrapMarkdownDestination(raw);
  if (!src || isUnsafeSrc(src)) return null;
  if (src.startsWith("//") && src.length > 3) src = `https:${src}`;
  return src;
}

export function markdownLinkDestination(src: string): string {
  if (/[\s<>()|]/.test(src)) return `<${src.replace(/[<>]/g, "")}>`;
  return src;
}

export function resolveNoteAssetPath(notePath: string, src: string): string | null {
  const dest = unwrapMarkdownDestination(src);
  if (!dest || dest.startsWith("#") || dest.includes("://") || dest.startsWith("//") || dest.startsWith("data:")) {
    return null;
  }
  const directory = notePath.split("/").slice(0, -1).join("/");
  const joined = directory ? `${directory}/${dest}` : dest;
  const parts: string[] = [];
  for (const part of joined.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return parts.join("/") || null;
}

export function assetApiUrl(notebookId: string, assetPath: string): string {
  return `/api/notebooks/${encodeURIComponent(notebookId)}/asset?path=${encodeURIComponent(assetPath)}`;
}

export function toDisplayImageSrc(raw: string, context?: NoteImageContext | null): string | null {
  const src = unwrapMarkdownDestination(raw);
  if (!src || isUnsafeSrc(src)) return null;
  if (src.startsWith("//") && src.length > 3) return src;
  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return `//${url.host}${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  if (!context) return null;
  const resolved = resolveNoteAssetPath(context.notePath, src);
  return resolved ? assetApiUrl(context.notebookId, resolved) : null;
}
