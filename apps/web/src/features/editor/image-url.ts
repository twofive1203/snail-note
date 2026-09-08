const UNSAFE_SRC = /^(?:javascript|vbscript):/i;

export function unwrapMarkdownDestination(raw: string): string {
  let src = raw.trim();
  if (src.startsWith("<") && src.endsWith(">")) src = src.slice(1, -1).trim();
  return src;
}

export function isUnsafeSrc(src: string): boolean {
  if (UNSAFE_SRC.test(src)) return true;
  return /^data:/i.test(src) && !/^data:image\//i.test(src);
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

export function toDisplayImageSrc(raw: string): string | null {
  const src = unwrapMarkdownDestination(raw);
  if (!src || isUnsafeSrc(src)) return null;
  if (src.startsWith("//") && src.length > 3) return src;
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const url = new URL(src);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
