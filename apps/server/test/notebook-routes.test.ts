import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

let root: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "snail-note-api-"));
  await writeFile(path.join(root, "hello.md"), "# Hello\nsearchable text", "utf8");
  app = await buildApp({ root, name: "Test Notes" });
});

afterEach(async () => {
  await app.close();
  await rm(root, { recursive: true, force: true });
});

describe("notebook API", () => {
  it("reports health and lists the notebook", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({
      status: "ok",
      notebook: "Test Notes",
    });
    const response = await app.inject({ method: "GET", url: "/api/notebook/tree" });
    expect(response.statusCode).toBe(200);
    expect(response.json().root[0].path).toBe("hello.md");
  });

  it("persists note content through the API", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/notebook/file",
      payload: { path: "hello.md", content: "changed" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().content).toBe("changed");
  });

  it("keeps path errors stable at the route boundary", async () => {
    const response = await app.inject({ method: "GET", url: "/api/notebook/file?path=../secret.md" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_PATH");
  });

  it("finds saved Markdown content", async () => {
    const response = await app.inject({ method: "GET", url: "/api/search?q=SEARCHABLE" });
    expect(response.statusCode).toBe(200);
    expect(response.json().matches[0]).toMatchObject({ path: "hello.md", line: 2 });
  });
});
