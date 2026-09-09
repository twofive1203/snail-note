import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { NotebookError } from "./notebook-errors.js";

export type NotebookPathKind = "directory" | "markdown" | "asset" | "entry";

const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export function isAssetPath(relativePath: string): boolean {
  return ASSET_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function validateRawRelativePath(relativePath: string): void {
  if (typeof relativePath !== "string" || relativePath.includes("\0")) {
    throw new NotebookError("INVALID_PATH", "路径格式无效");
  }

  const value = relativePath.trim();
  if (
    path.isAbsolute(value) ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith("\\\\") ||
    value.split(/[\\/]+/).includes("..")
  ) {
    throw new NotebookError("INVALID_PATH", "只允许访问笔记本内的相对路径");
  }
}

export function normalizeNotebookPath(relativePath: string): string {
  validateRawRelativePath(relativePath);
  const normalized = relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .join("/");
  return normalized;
}

export async function resolveNotebookPath(
  notebookRoot: string,
  relativePath: string,
  kind: NotebookPathKind = "entry",
): Promise<{ absolutePath: string; relativePath: string }> {
  const normalized = normalizeNotebookPath(relativePath);
  if (kind !== "directory" && normalized === "") {
    throw new NotebookError("INVALID_PATH", "文件路径不能为空");
  }
  if (kind === "markdown" && path.posix.extname(normalized).toLowerCase() !== ".md") {
    throw new NotebookError("UNSUPPORTED_FILE_TYPE", "笔记文件必须使用 .md 扩展名");
  }
  if (kind === "asset" && !isAssetPath(normalized)) {
    throw new NotebookError("UNSUPPORTED_FILE_TYPE", "只支持 png、jpg、gif 或 webp 图片");
  }

  const canonicalRoot = await realpath(notebookRoot);
  const absolutePath = path.resolve(canonicalRoot, ...normalized.split("/").filter(Boolean));
  if (!isWithin(canonicalRoot, absolutePath)) {
    throw new NotebookError("INVALID_PATH", "路径超出笔记本根目录");
  }

  let existingAncestor = absolutePath;
  while (true) {
    try {
      await lstat(existingAncestor);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        throw new NotebookError("INVALID_PATH", "无法解析路径");
      }
      existingAncestor = parent;
    }
  }

  const canonicalAncestor = await realpath(existingAncestor);
  if (!isWithin(canonicalRoot, canonicalAncestor)) {
    throw new NotebookError("INVALID_PATH", "符号链接目标超出笔记本根目录");
  }

  return { absolutePath, relativePath: normalized };
}
