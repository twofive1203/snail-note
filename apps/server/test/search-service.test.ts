import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NotebookService } from "../src/notebook/notebook-service.js";
import { SearchService } from "../src/search/search-service.js";

let root = "";
afterEach(async () => root && rm(root, { recursive: true, force: true }));

describe("SearchService", () => {
  it("matches case-insensitively and returns a useful title and line", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "snail-note-search-"));
    await writeFile(path.join(root, "note.md"), "# Project Alpha\nfirst\nNeedle here", "utf8");
    const service = new SearchService(new NotebookService(root, "Notes"));
    expect(await service.search("needle")).toEqual([
      expect.objectContaining({ path: "note.md", title: "Project Alpha", line: 3, snippet: "Needle here" }),
    ]);
  });

  it("does not scan for an empty query", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "snail-note-search-"));
    expect(await new SearchService(new NotebookService(root, "Notes")).search("  ")).toEqual([]);
  });
});
