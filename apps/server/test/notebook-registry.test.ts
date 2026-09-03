import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NotebookRegistry } from "../src/notebook/notebook-registry.js";

let base = "";
afterEach(async () => base && rm(base, { recursive: true, force: true }));

describe("NotebookRegistry", () => {
  it("persists multiple notebook roots across registry instances", async () => {
    base = await mkdtemp(path.join(os.tmpdir(), "snail-note-registry-"));
    const firstRoot = path.join(base, "first");
    const secondRoot = path.join(base, "second");
    await Promise.all([mkdir(firstRoot), mkdir(secondRoot)]);
    const registryFile = path.join(base, "config", "notebooks.json");
    const registry = await NotebookRegistry.open(registryFile);

    await registry.add({ root: firstRoot, name: "First" });
    await registry.add({ root: secondRoot });

    const restored = await NotebookRegistry.open(registryFile);
    expect(restored.list()).toEqual([
      expect.objectContaining({ name: "First", root: firstRoot }),
      expect.objectContaining({ name: "second", root: secondRoot }),
    ]);
  });

  it("does not restore a legacy initial notebook after the user removes it", async () => {
    base = await mkdtemp(path.join(os.tmpdir(), "snail-note-registry-"));
    const root = path.join(base, "notes");
    await mkdir(root);
    const registryFile = path.join(base, "notebooks.json");
    const registry = await NotebookRegistry.open(registryFile, { root, name: "Legacy" });
    await registry.remove(registry.list()[0]!.id);

    const restored = await NotebookRegistry.open(registryFile, { root, name: "Legacy" });
    expect(restored.list()).toEqual([]);
  });

  it("rejects adding the same canonical directory twice", async () => {
    base = await mkdtemp(path.join(os.tmpdir(), "snail-note-registry-"));
    const root = path.join(base, "notes");
    await mkdir(root);
    const registry = await NotebookRegistry.open(path.join(base, "notebooks.json"));
    await registry.add({ root });
    await expect(registry.add({ root })).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });
});
