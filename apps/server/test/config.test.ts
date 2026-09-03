import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAppConfig, loadNotebookConfig } from "../src/config/notebook-config.js";

const paths: string[] = [];
afterEach(async () => Promise.all(paths.splice(0).map((target) => rm(target, { recursive: true, force: true }))));

describe("loadNotebookConfig", () => {
  it("starts without requiring a notebook root", async () => {
    const dataDirectory = path.join(await mkdtemp(path.join(os.tmpdir(), "snail-note-data-")), "config");
    paths.push(path.dirname(dataDirectory));
    expect(loadAppConfig({}, dataDirectory)).toEqual({ registryFile: path.join(dataDirectory, "notebooks.json") });
  });

  it("loads an existing directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "snail-note-config-"));
    paths.push(root);
    expect(loadNotebookConfig({ NOTEBOOK_ROOT: root, NOTEBOOK_NAME: "My Notes" })).toMatchObject({ name: "My Notes" });
  });

  it("rejects a missing configured directory", () => {
    expect(() => loadNotebookConfig({ NOTEBOOK_ROOT: path.join(os.tmpdir(), "missing-snail-root") })).toThrow(/不存在/);
  });

  it("rejects a file as notebook root", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "snail-note-config-"));
    paths.push(directory);
    const file = path.join(directory, "file.md");
    await writeFile(file, "content");
    expect(() => loadNotebookConfig({ NOTEBOOK_ROOT: file })).toThrow(/必须是目录/);
  });
});
