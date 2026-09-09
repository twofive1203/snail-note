import { open, readdir, readFile, rename, rm, rmdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { NoteDocument, NotebookNode, SavedAsset } from "@snail-note/shared";
import { detectImage, fetchRemoteImage, IMAGE_MAX_BYTES } from "./asset-fetch.js";
import { NotebookError, toNotebookError } from "./notebook-errors.js";
import { resolveNotebookPath } from "./notebook-path.js";

export class NotebookService {
  constructor(
    public readonly root: string,
    public readonly name: string,
  ) {}

  async getTree(): Promise<NotebookNode[]> {
    return this.readDirectory(this.root, "");
  }

  async readNote(relativePath: string): Promise<NoteDocument> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "markdown");
    try {
      const [content, metadata] = await Promise.all([
        readFile(resolved.absolutePath, "utf8"),
        stat(resolved.absolutePath),
      ]);
      if (!metadata.isFile()) throw new NotebookError("INVALID_OPERATION", "目标不是 Markdown 文件");
      return { path: resolved.relativePath, content, updatedAt: metadata.mtime.toISOString() };
    } catch (error) {
      throw toNotebookError(error, "读取笔记失败");
    }
  }

  async saveNote(relativePath: string, content: string): Promise<NoteDocument> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "markdown");
    try {
      const metadata = await stat(resolved.absolutePath);
      if (!metadata.isFile()) throw new NotebookError("INVALID_OPERATION", "目标不是 Markdown 文件");
      await writeFile(resolved.absolutePath, content, "utf8");
      return this.readNote(resolved.relativePath);
    } catch (error) {
      throw toNotebookError(error, "保存笔记失败");
    }
  }

  async createNote(relativePath: string, content = ""): Promise<NoteDocument> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "markdown");
    try {
      const parent = await stat(path.dirname(resolved.absolutePath));
      if (!parent.isDirectory()) throw new NotebookError("INVALID_OPERATION", "父路径不是目录");
      const handle = await open(resolved.absolutePath, "wx");
      try {
        await handle.writeFile(content, "utf8");
      } finally {
        await handle.close();
      }
      return this.readNote(resolved.relativePath);
    } catch (error) {
      throw toNotebookError(error, "创建笔记失败");
    }
  }

  async createDirectory(relativePath: string): Promise<string> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "directory");
    if (!resolved.relativePath) throw new NotebookError("INVALID_OPERATION", "不能创建笔记本根目录");
    try {
      await mkdir(resolved.absolutePath);
      return resolved.relativePath;
    } catch (error) {
      throw toNotebookError(error, "创建目录失败");
    }
  }

  async moveEntry(relativePath: string, newRelativePath: string): Promise<string> {
    const source = await resolveNotebookPath(this.root, relativePath, "entry");
    let metadata;
    try {
      metadata = await stat(source.absolutePath);
    } catch (error) {
      throw toNotebookError(error);
    }
    if (source.relativePath === "") throw new NotebookError("INVALID_OPERATION", "不能移动笔记本根目录");

    const destination = await resolveNotebookPath(
      this.root,
      newRelativePath,
      metadata.isDirectory() ? "directory" : "markdown",
    );
    if (!destination.relativePath) throw new NotebookError("INVALID_OPERATION", "目标路径不能为空");

    try {
      try {
        await stat(destination.absolutePath);
        throw new NotebookError("ALREADY_EXISTS", "目标文件或目录已存在", 409);
      } catch (error) {
        if (error instanceof NotebookError || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parent = await stat(path.dirname(destination.absolutePath));
      if (!parent.isDirectory()) throw new NotebookError("INVALID_OPERATION", "目标父路径不是目录");
      await rename(source.absolutePath, destination.absolutePath);
      return destination.relativePath;
    } catch (error) {
      throw toNotebookError(error, "移动或重命名失败");
    }
  }

  async deleteEntry(relativePath: string): Promise<void> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "entry");
    if (!resolved.relativePath) throw new NotebookError("INVALID_OPERATION", "不能删除笔记本根目录");

    try {
      const metadata = await stat(resolved.absolutePath);
      if (metadata.isDirectory()) await rmdir(resolved.absolutePath);
      else if (path.extname(resolved.absolutePath).toLowerCase() === ".md") await rm(resolved.absolutePath);
      else throw new NotebookError("UNSUPPORTED_FILE_TYPE", "只能删除目录或 Markdown 文件");
    } catch (error) {
      throw toNotebookError(error, "删除失败");
    }
  }

  async readAsset(relativePath: string): Promise<{ buffer: Buffer; contentType: string }> {
    const resolved = await resolveNotebookPath(this.root, relativePath, "asset");
    try {
      const metadata = await stat(resolved.absolutePath);
      if (!metadata.isFile()) throw new NotebookError("INVALID_OPERATION", "目标不是图片文件");
      const buffer = await readFile(resolved.absolutePath);
      const kind = detectImage(buffer);
      if (!kind) throw new NotebookError("UNSUPPORTED_FILE_TYPE", "文件不是支持的图片");
      return { buffer, contentType: kind.contentType };
    } catch (error) {
      throw toNotebookError(error, "读取图片失败");
    }
  }

  async saveAssetFromBytes(notePath: string, buffer: Buffer): Promise<SavedAsset> {
    if (buffer.length > IMAGE_MAX_BYTES) throw new NotebookError("INVALID_OPERATION", "图片超过 8MB 限制");
    const kind = detectImage(buffer);
    if (!kind) throw new NotebookError("UNSUPPORTED_FILE_TYPE", "文件不是支持的图片");
    const note = await resolveNotebookPath(this.root, notePath, "markdown");
    const folder = assetFolderForNote(note.relativePath);
    const filename = await this.unusedAssetName(folder, kind.ext);
    const relativePath = `${folder}/${filename}`;
    const resolved = await resolveNotebookPath(this.root, relativePath, "asset");
    try {
      await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
      await writeFile(resolved.absolutePath, buffer);
      return { path: resolved.relativePath, markdownPath: `${path.posix.basename(folder)}/${filename}` };
    } catch (error) {
      throw toNotebookError(error, "保存图片失败");
    }
  }

  async saveAssetFromBase64(notePath: string, data: string): Promise<SavedAsset> {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length) throw new NotebookError("INVALID_OPERATION", "图片数据无效");
    return this.saveAssetFromBytes(notePath, buffer);
  }

  async importRemoteImage(notePath: string, url: string): Promise<SavedAsset> {
    const buffer = await fetchRemoteImage(url);
    return this.saveAssetFromBytes(notePath, buffer);
  }

  async listMarkdownFiles(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (absoluteDirectory: string, relativeDirectory: string): Promise<void> => {
      const entries = await readdir(absoluteDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        const absolute = path.join(absoluteDirectory, entry.name);
        if (entry.isDirectory()) await walk(absolute, relative);
        else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") files.push(relative);
      }
    };
    await walk(this.root, "");
    return files;
  }

  private async unusedAssetName(folder: string, ext: string): Promise<string> {
    const stamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d+Z$/, "Z").replace("T", "-");
    for (let index = 0; index < 50; index += 1) {
      const name = index === 0 ? `${stamp}${ext}` : `${stamp}-${index}${ext}`;
      const resolved = await resolveNotebookPath(this.root, `${folder}/${name}`, "asset");
      try {
        await stat(resolved.absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return name;
        throw toNotebookError(error, "保存图片失败");
      }
    }
    throw new NotebookError("IO_ERROR", "无法生成图片文件名");
  }

  private async readDirectory(absoluteDirectory: string, relativeDirectory: string): Promise<NotebookNode[]> {
    let entries;
    try {
      entries = await readdir(absoluteDirectory, { withFileTypes: true });
    } catch (error) {
      throw toNotebookError(error, "读取文件树失败");
    }

    const nodes: NotebookNode[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && entry.name.endsWith(".assets")) continue;
      if (!entry.isDirectory() && !(entry.isFile() && path.extname(entry.name).toLowerCase() === ".md")) continue;
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(absoluteDirectory, entry.name);
      const metadata = await stat(absolute);
      nodes.push({
        name: entry.name,
        path: relative,
        type: entry.isDirectory() ? "directory" : "file",
        updatedAt: metadata.mtime.toISOString(),
        ...(entry.isDirectory() ? { children: await this.readDirectory(absolute, relative) } : {}),
      });
    }

    return nodes.sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name, "zh-CN");
    });
  }
}

function assetFolderForNote(notePath: string): string {
  if (!notePath.toLowerCase().endsWith(".md")) {
    throw new NotebookError("UNSUPPORTED_FILE_TYPE", "笔记文件必须使用 .md 扩展名");
  }
  return `${notePath.slice(0, -3)}.assets`;
}
