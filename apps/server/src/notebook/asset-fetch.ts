import { lookup } from "node:dns/promises";
import { NotebookError } from "./notebook-errors.js";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function isBlockedIp(address: string): boolean {
  let ip = address.toLowerCase();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  if (ip.includes(":")) {
    return ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "0.0.0.0") return true;
  return isBlockedIp(host);
}

export function detectImage(buffer: Buffer): { ext: string; contentType: string } | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: ".png", contentType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: ".jpg", contentType: "image/jpeg" };
  }
  if (buffer.length >= 6) {
    const header = buffer.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return { ext: ".gif", contentType: "image/gif" };
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: ".webp", contentType: "image/webp" };
  }
  return null;
}

export async function assertSafeImageUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NotebookError("INVALID_OPERATION", "只允许抓取 http(s) 图片");
  }
  if (url.username || url.password) {
    throw new NotebookError("INVALID_OPERATION", "不允许抓取带凭据的地址");
  }
  if (isBlockedHost(url.hostname)) {
    throw new NotebookError("INVALID_OPERATION", "不允许抓取内网或本机地址");
  }
  const { address } = await lookup(url.hostname);
  if (isBlockedIp(address)) {
    throw new NotebookError("INVALID_OPERATION", "不允许抓取内网或本机地址");
  }
}

export async function fetchRemoteImage(rawUrl: string): Promise<Buffer> {
  const primary = parseHttpUrl(rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl);
  const candidates = [primary];
  const swapped = new URL(primary.toString());
  swapped.protocol = primary.protocol === "https:" ? "http:" : "https:";
  if (swapped.toString() !== primary.toString()) candidates.push(swapped);

  let lastError: unknown;
  for (const candidate of candidates) {
    for (const referer of referersFor(candidate)) {
      try {
        return await fetchImageFollowingRedirects(candidate, referer);
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError instanceof NotebookError) throw lastError;
  throw new NotebookError("IO_ERROR", "下载图片失败", 502);
}

async function fetchImageFollowingRedirects(start: URL, referer: string | undefined): Promise<Buffer> {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertSafeImageUrl(current);
    const headers: Record<string, string> = {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": BROWSER_UA,
    };
    if (referer) headers.Referer = referer;
    const requestUrl = current.href.replaceAll("|", "%7C");
    const response = await fetch(requestUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new NotebookError("IO_ERROR", "图片地址重定向无效", 502);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new NotebookError("IO_ERROR", `下载图片失败 (${response.status})`, 502);
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > IMAGE_MAX_BYTES) throw new NotebookError("INVALID_OPERATION", "图片超过 8MB 限制");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > IMAGE_MAX_BYTES) throw new NotebookError("INVALID_OPERATION", "图片超过 8MB 限制");
    if (!detectImage(buffer)) throw new NotebookError("UNSUPPORTED_FILE_TYPE", "远程文件不是支持的图片");
    return buffer;
  }
  throw new NotebookError("IO_ERROR", "图片地址重定向过多", 502);
}

function referersFor(url: URL): Array<string | undefined> {
  const origin = `${url.protocol}//${url.host}/`;
  const labels = url.hostname.split(".").filter(Boolean);
  const root = labels.length >= 2 ? labels.slice(-2).join(".") : url.hostname;
  const site = `${url.protocol}//www.${root}/`;
  return [...new Set([undefined, origin, site])];
}

function parseHttpUrl(rawUrl: string): URL {
  try {
    return new URL(rawUrl);
  } catch {
    throw new NotebookError("INVALID_OPERATION", "图片地址无效");
  }
}
