import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

let base: string;
let root: string;
let notebookId: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "snail-note-api-"));
  root = path.join(base, "notes");
  await mkdir(root);
  await writeFile(path.join(root, "hello.md"), "# Hello\nsearchable text", "utf8");
  app = await buildApp({
    registryFile: path.join(base, "config", "notebooks.json"),
    initialNotebook: { root, name: "Test Notes" },
  });
  const notebooks = (await app.inject({ method: "GET", url: "/api/notebooks" })).json().notebooks;
  notebookId = notebooks[0].id;
});

afterEach(async () => {
  await app.close();
  await rm(base, { recursive: true, force: true });
});

describe("notebook API", () => {
  it("reports health and lists the notebook", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({
      status: "ok",
      notebooks: 1,
    });
    const response = await app.inject({ method: "GET", url: `/api/notebooks/${notebookId}/tree` });
    expect(response.statusCode).toBe(200);
    expect(response.json().notebook.name).toBe("Test Notes");
    expect(response.json().root[0].path).toBe("hello.md");
  });

  it("persists note content through the selected notebook API", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/notebooks/${notebookId}/file`,
      payload: { path: "hello.md", content: "changed" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().content).toBe("changed");
  });

  it("adds and removes a server directory without deleting it", async () => {
    const otherRoot = path.join(base, "other-notes");
    await mkdir(otherRoot);
    const created = await app.inject({ method: "POST", url: "/api/notebooks", payload: { root: otherRoot } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "other-notes", root: otherRoot });

    const removed = await app.inject({ method: "DELETE", url: `/api/notebooks/${created.json().id}` });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/notebooks" })).json().notebooks).toHaveLength(1);
  });

  it("browses server directories", async () => {
    const response = await app.inject({ method: "GET", url: `/api/directories?path=${encodeURIComponent(base)}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().directories).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "notes", path: root }),
    ]));
  });

  it("keeps path errors stable at the route boundary", async () => {
    const response = await app.inject({ method: "GET", url: `/api/notebooks/${notebookId}/file?path=../secret.md` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_PATH");
  });

  it("finds saved Markdown content in the selected notebook", async () => {
    const response = await app.inject({ method: "GET", url: `/api/notebooks/${notebookId}/search?q=SEARCHABLE` });
    expect(response.statusCode).toBe(200);
    expect(response.json().matches[0]).toMatchObject({ path: "hello.md", line: 2 });
  });

  it("stores and serves a notebook image", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const created = await app.inject({
      method: "POST",
      url: `/api/notebooks/${notebookId}/asset`,
      payload: { notePath: "hello.md", data: png.toString("base64") },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().markdownPath).toMatch(/^hello\.assets\/.+\.png$/);
    const served = await app.inject({
      method: "GET",
      url: `/api/notebooks/${notebookId}/asset?path=${encodeURIComponent(created.json().path)}`,
    });
    expect(served.statusCode).toBe(200);
    expect(String(served.headers["content-type"])).toMatch(/image\/png/);
    expect(Buffer.from(served.rawPayload).equals(png)).toBe(true);
  });

  it("rejects fetching a private image URL", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/notebooks/${notebookId}/asset`,
      payload: { notePath: "hello.md", url: "http://127.0.0.1/x.png" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_OPERATION");
  });
});
