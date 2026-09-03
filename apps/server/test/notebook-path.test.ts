import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveNotebookPath } from "../src/notebook/notebook-path.js";

const roots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "snail-note-path-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resolveNotebookPath", () => {
  it("normalizes a valid Markdown path inside the root", async () => {
    const root = await createRoot();
    await mkdir(path.join(root, "notes"));
    const resolved = await resolveNotebookPath(root, "./notes//a.md", "markdown");
    expect(resolved.relativePath).toBe("notes/a.md");
    expect(resolved.absolutePath).toBe(path.join(root, "notes", "a.md"));
  });

  it.each(["../secret.md", "/etc/passwd", "C:\\secret.md", "notes/../../secret.md"])(
    "rejects unsafe path %s",
    async (candidate) => {
      await expect(resolveNotebookPath(await createRoot(), candidate, "markdown")).rejects.toMatchObject({
        code: "INVALID_PATH",
      });
    },
  );

  it("rejects non-Markdown note paths", async () => {
    await expect(resolveNotebookPath(await createRoot(), "image.png", "markdown")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("rejects a symlink that escapes the notebook", async () => {
    const root = await createRoot();
    const outside = await createRoot();
    await symlink(outside, path.join(root, "outside"), process.platform === "win32" ? "junction" : "dir");
    await expect(resolveNotebookPath(root, "outside/secret.md", "markdown")).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
  });
});
