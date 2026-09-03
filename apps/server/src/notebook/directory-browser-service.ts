import { access, lstat, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { DirectoryBrowserResponse, ServerDirectory } from "@snail-note/shared";
import { NotebookError, toNotebookError } from "./notebook-errors.js";

async function windowsDriveRoots(): Promise<ServerDirectory[]> {
  const drives = await Promise.all(Array.from({ length: 26 }, async (_, index) => {
    const name = `${String.fromCharCode(65 + index)}:`;
    const drivePath = `${name}\\`;
    try {
      await access(drivePath);
      return { name, path: drivePath };
    } catch {
      return null;
    }
  }));
  return drives.filter((drive): drive is ServerDirectory => drive !== null);
}

export class DirectoryBrowserService {
  async browse(rawPath?: string): Promise<DirectoryBrowserResponse> {
    const requestedPath = rawPath?.trim();
    if (!requestedPath && process.platform === "win32") {
      return { path: null, parent: null, directories: await windowsDriveRoots() };
    }

    const target = requestedPath || path.parse(process.cwd()).root;
    if (!path.isAbsolute(target)) {
      throw new NotebookError("INVALID_PATH", "目录浏览只接受服务端绝对路径");
    }

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(path.resolve(target));
      const metadata = await stat(canonicalPath);
      if (!metadata.isDirectory()) throw new NotebookError("INVALID_PATH", "目标不是目录");
    } catch (error) {
      throw toNotebookError(error, "无法访问该目录");
    }

    let entries;
    try {
      entries = await readdir(canonicalPath, { withFileTypes: true });
    } catch (error) {
      throw toNotebookError(error, "无法读取该目录");
    }

    const directories: ServerDirectory[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const childPath = path.join(canonicalPath, entry.name);
      try {
        const metadata = await lstat(childPath);
        if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
          directories.push({ name: entry.name, path: childPath });
        }
      } catch {
        // Unreadable child directories do not prevent browsing the current directory.
      }
    }

    directories.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    const root = path.parse(canonicalPath).root;
    return {
      path: canonicalPath,
      parent: canonicalPath === root ? (process.platform === "win32" ? null : null) : path.dirname(canonicalPath),
      directories,
    };
  }
}
