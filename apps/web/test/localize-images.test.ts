import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateImageUrls, localizeMarkdownImages } from "../src/features/editor/localize-images";

const saveAsset = vi.fn();

vi.mock("../src/features/file-tree/file-tree-api", () => ({
  notebookApi: {
    saveAsset: (...args: unknown[]) => saveAsset(...args),
  },
}));

describe("localizeMarkdownImages", () => {
  beforeEach(() => {
    saveAsset.mockReset();
    saveAsset.mockImplementation(async (_id: string, body: { url?: string; data?: string }) => ({
      path: "notes/hello.assets/pic.png",
      markdownPath: "hello.assets/pic.png",
      url: body.url,
      data: body.data,
    }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("cors")));
  });

  it("replaces remote image URLs with note-relative asset paths", async () => {
    const markdown = localizeMarkdownImages(
      "See ![](https://example.com/a.png) and ![](<https://example.com/a.png>)",
      { notebookId: "nb1", notePath: "notes/hello.md" },
    );
    await expect(markdown).resolves.toBe("See ![](hello.assets/pic.png) and ![](hello.assets/pic.png)");
    expect(saveAsset).toHaveBeenCalledTimes(1);
    expect(saveAsset).toHaveBeenCalledWith("nb1", { notePath: "notes/hello.md", url: "https://example.com/a.png" });
  });

  it("localizes jianshu destinations that contain query pipes", async () => {
    const markdown =
      "![](<https://upload-images.jianshu.io/upload_images/15405075-c28328eb5b91bc95.jpg?imageMogr2/auto-orient/strip|imageView2/2/w/1200/format/webp>)";
    await expect(localizeMarkdownImages(markdown, { notebookId: "nb1", notePath: "56ggg.md" })).resolves.toBe(
      "![](hello.assets/pic.png)",
    );
    expect(saveAsset).toHaveBeenCalledWith("nb1", {
      notePath: "56ggg.md",
      url: "https://upload-images.jianshu.io/upload_images/15405075-c28328eb5b91bc95.jpg?imageMogr2/auto-orient/strip|imageView2/2/w/1200/format/webp",
    });
  });

  it("uploads browser-downloaded bytes when CORS is not blocking", async () => {
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="),
      (char) => char.charCodeAt(0),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => png.buffer,
      }),
    );
    await localizeMarkdownImages("![](https://example.com/a.png)", { notebookId: "nb1", notePath: "hello.md" });
    expect(saveAsset).toHaveBeenCalledWith("nb1", expect.objectContaining({ notePath: "hello.md", data: expect.any(String) }));
  });

  it("keeps a remote URL when download fails", async () => {
    saveAsset.mockRejectedValueOnce(new Error("nope"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const markdown = await localizeMarkdownImages("![](https://example.com/missing.png)", {
      notebookId: "nb1",
      notePath: "hello.md",
    });
    warn.mockRestore();
    expect(markdown).toBe("![](https://example.com/missing.png)");
  });
});

describe("candidateImageUrls", () => {
  it("tries http, https and pipe-encoded variants", () => {
    expect(candidateImageUrls("https://cdn.example/a.jpg?x|y")).toEqual([
      "https://cdn.example/a.jpg?x|y",
      "https://cdn.example/a.jpg?x%7Cy",
      "http://cdn.example/a.jpg?x|y",
      "http://cdn.example/a.jpg?x%7Cy",
    ]);
  });
});
