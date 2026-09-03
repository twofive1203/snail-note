import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CreateNotebookRequest, NotebookSummary } from "@snail-note/shared";
import type { NotebookConfig } from "../config/notebook-config.js";
import { NotebookError, toNotebookError } from "./notebook-errors.js";
import { NotebookService } from "./notebook-service.js";

interface StoredNotebook extends NotebookSummary {
  createdAt: string;
}

interface RegistryDocument {
  version: 1;
  notebooks: StoredNotebook[];
}

function isStoredNotebook(value: unknown): value is StoredNotebook {
  if (!value || typeof value !== "object") return false;
  const notebook = value as Partial<StoredNotebook>;
  return typeof notebook.id === "string"
    && typeof notebook.name === "string"
    && typeof notebook.root === "string"
    && typeof notebook.createdAt === "string";
}

export class NotebookRegistry {
  private constructor(
    private readonly registryFile: string,
    private notebooks: StoredNotebook[],
  ) {}

  static async open(registryFile: string, initialNotebook?: NotebookConfig): Promise<NotebookRegistry> {
    let notebooks: StoredNotebook[] = [];
    let registryExists = true;
    try {
      const document = JSON.parse(await readFile(registryFile, "utf8")) as Partial<RegistryDocument>;
      if (document.version !== 1 || !Array.isArray(document.notebooks) || !document.notebooks.every(isStoredNotebook)) {
        throw new Error("invalid registry document");
      }
      notebooks = document.notebooks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") registryExists = false;
      else throw new NotebookError("INVALID_CONFIG", `笔记本配置文件无效：${registryFile}`, 500);
    }

    const registry = new NotebookRegistry(registryFile, notebooks);
    if (!registryExists && initialNotebook) {
      await registry.add(initialNotebook);
    }
    return registry;
  }

  list(): NotebookSummary[] {
    return this.notebooks.map(({ id, name, root }) => ({ id, name, root }));
  }

  get(notebookId: string): NotebookSummary {
    const notebook = this.notebooks.find(({ id }) => id === notebookId);
    if (!notebook) throw new NotebookError("NOT_FOUND", "笔记本不存在或已被移除", 404);
    return { id: notebook.id, name: notebook.name, root: notebook.root };
  }

  service(notebookId: string): NotebookService {
    const notebook = this.get(notebookId);
    return new NotebookService(notebook.root, notebook.name);
  }

  async add(request: CreateNotebookRequest | NotebookConfig): Promise<NotebookSummary> {
    if (typeof request.root !== "string" || !request.root.trim()) {
      throw new NotebookError("INVALID_PATH", "请选择有效的笔记本目录");
    }
    if (!path.isAbsolute(request.root.trim())) {
      throw new NotebookError("INVALID_PATH", "笔记本目录必须是服务端绝对路径");
    }

    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(path.resolve(request.root.trim()));
      const metadata = await stat(canonicalRoot);
      if (!metadata.isDirectory()) throw new NotebookError("INVALID_PATH", "笔记本根路径必须是目录");
    } catch (error) {
      throw toNotebookError(error, "无法访问所选笔记本目录");
    }

    if (this.notebooks.some(({ root }) => root === canonicalRoot)) {
      throw new NotebookError("ALREADY_EXISTS", "该目录已经添加为笔记本", 409);
    }

    const name = request.name?.trim() || path.basename(canonicalRoot) || canonicalRoot;
    const notebook: StoredNotebook = {
      id: randomUUID(),
      name,
      root: canonicalRoot,
      createdAt: new Date().toISOString(),
    };
    const nextNotebooks = [...this.notebooks, notebook];
    await this.persist(nextNotebooks);
    this.notebooks = nextNotebooks;
    return { id: notebook.id, name: notebook.name, root: notebook.root };
  }

  async remove(notebookId: string): Promise<void> {
    this.get(notebookId);
    const nextNotebooks = this.notebooks.filter(({ id }) => id !== notebookId);
    await this.persist(nextNotebooks);
    this.notebooks = nextNotebooks;
  }

  private async persist(notebooks: StoredNotebook[]): Promise<void> {
    await mkdir(path.dirname(this.registryFile), { recursive: true });
    const temporaryFile = `${this.registryFile}.${process.pid}.tmp`;
    await writeFile(temporaryFile, `${JSON.stringify({ version: 1, notebooks }, null, 2)}\n`, "utf8");
    await rename(temporaryFile, this.registryFile);
  }
}
