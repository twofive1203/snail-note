import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotebookService } from "../src/notebook/notebook-service.js";

let root: string;
let notebook: NotebookService;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "snail-note-service-"));
  await mkdir(path.join(root, "中文 目录"));
  await writeFile(path.join(root, "中文 目录", "旧笔记.md"), "# 原文\n", "utf8");
  await writeFile(path.join(root, "ignored.txt"), "ignore", "utf8");
  notebook = new NotebookService(root, "测试笔记本");
});

afterEach(async () => rm(root, { recursive: true, force: true }));

describe("NotebookService", () => {
  it("lists directories and Markdown files but hides unsupported files", async () => {
    const tree = await notebook.getTree();
    expect(tree).toHaveLength(1);
    expect(tree[0]?.path).toBe("中文 目录");
    expect(tree[0]?.children?.[0]?.path).toBe("中文 目录/旧笔记.md");
  });

  it("completes a note create, read, save and move lifecycle", async () => {
    await notebook.createNote("中文 目录/新笔记.md", "初始");
    expect((await notebook.readNote("中文 目录/新笔记.md")).content).toBe("初始");
    await notebook.saveNote("中文 目录/新笔记.md", "修改后");
    const moved = await notebook.moveEntry("中文 目录/新笔记.md", "移动后.md");
    expect(moved).toBe("移动后.md");
    expect(await readFile(path.join(root, "移动后.md"), "utf8")).toBe("修改后");
  });

  it("does not overwrite an existing move target", async () => {
    await writeFile(path.join(root, "a.md"), "a");
    await writeFile(path.join(root, "b.md"), "b");
    await expect(notebook.moveEntry("a.md", "b.md")).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    expect(await readFile(path.join(root, "b.md"), "utf8")).toBe("b");
  });

  it("refuses to delete a non-empty directory", async () => {
    await expect(notebook.deleteEntry("中文 目录")).rejects.toMatchObject({ code: "DIRECTORY_NOT_EMPTY" });
  });
});
