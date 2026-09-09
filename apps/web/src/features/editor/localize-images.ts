import type { SavedAsset } from "@snail-note/shared";
import { notebookApi } from "../file-tree/file-tree-api";
import {
  isRemoteImageSrc,
  markdownLinkDestination,
  type NoteImageContext,
  unwrapMarkdownDestination,
} from "./image-url";

const IMAGE_PATTERN = /!\[([^\]]*)\]\((<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function candidateImageUrls(src: string): string[] {
  const raw = unwrapMarkdownDestination(src);
  const urls: string[] = [];
  const add = (value: string) => {
    if (!value || urls.includes(value)) return;
    urls.push(value);
    const encoded = value.replaceAll("|", "%7C");
    if (encoded !== value) urls.push(encoded);
  };
  if (raw.startsWith("//")) {
    add(`https:${raw}`);
    add(`http:${raw}`);
  } else if (raw.startsWith("https://")) {
    add(raw);
    add(`http://${raw.slice("https://".length)}`);
  } else if (raw.startsWith("http://")) {
    add(raw);
    add(`https://${raw.slice("http://".length)}`);
  }
  return urls;
}

export async function downloadImageAsBase64(src: string): Promise<string | null> {
  for (const url of candidateImageUrls(src)) {
    try {
      const response = await fetch(url, { referrerPolicy: "no-referrer" });
      if (!response.ok) continue;
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.length < 24 || buffer.length > IMAGE_MAX_BYTES || !looksLikeImage(buffer)) continue;
      return bytesToBase64(buffer);
    } catch {
      continue;
    }
  }
  return null;
}

export async function localizeMarkdownImages(markdown: string, context: NoteImageContext): Promise<string> {
  const matches = [...markdown.matchAll(IMAGE_PATTERN)];
  if (!matches.length) return markdown;
  const cached = new Map<string, string>();
  let result = markdown;
  for (const match of matches.reverse()) {
    const raw = match[0];
    const alt = match[1] ?? "";
    const dest = unwrapMarkdownDestination(match[2] ?? "");
    if (!raw || !dest || !isRemoteImageSrc(dest) || match.index == null) continue;
    let local = cached.get(dest);
    if (!local) {
      try {
        local = (await importDestination(dest, context)).markdownPath;
      } catch (error) {
        console.warn("Failed to localize image", dest, error);
        continue;
      }
      cached.set(dest, local);
    }
    result = `${result.slice(0, match.index)}![${alt}](${markdownLinkDestination(local)})${result.slice(match.index + raw.length)}`;
  }
  return result;
}

async function importDestination(dest: string, context: NoteImageContext): Promise<SavedAsset> {
  if (dest.startsWith("data:image/")) {
    const comma = dest.indexOf(",");
    if (comma < 0) throw new Error("invalid data url");
    return notebookApi.saveAsset(context.notebookId, { notePath: context.notePath, data: dest.slice(comma + 1) });
  }
  const data = await downloadImageAsBase64(dest);
  if (data) {
    return notebookApi.saveAsset(context.notebookId, { notePath: context.notePath, data });
  }
  const url = dest.startsWith("//") ? `https:${dest}` : dest;
  return notebookApi.saveAsset(context.notebookId, { notePath: context.notePath, url });
}

export async function fileToBase64(file: File): Promise<string> {
  return bytesToBase64(new Uint8Array(await file.arrayBuffer()));
}

function looksLikeImage(buffer: Uint8Array): boolean {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer.length >= 6) {
    const header = String.fromCharCode(...buffer.slice(0, 6));
    if (header === "GIF87a" || header === "GIF89a") return true;
  }
  if (
    buffer.length >= 12 &&
    String.fromCharCode(...buffer.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...buffer.slice(8, 12)) === "WEBP"
  ) {
    return true;
  }
  return false;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
