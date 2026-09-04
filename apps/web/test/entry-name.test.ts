import { describe, expect, it } from "vitest";
import { validateEntryName, withMarkdownExtension } from "../src/features/dialogs/entry-name";

describe("entry name helpers", () => {
  it("rejects empty names, path separators and dot names", () => {
    expect(validateEntryName("  ", "file")).toBe("名称不能为空");
    expect(validateEntryName("a/b.md", "file")).toBe("文件名不能包含路径分隔符");
    expect(validateEntryName("a\\b", "directory")).toBe("文件夹名不能包含路径分隔符");
    expect(validateEntryName("..", "directory")).toBe("名称无效");
    expect(validateEntryName("笔记.md", "file")).toBeNull();
  });

  it("appends a markdown extension when missing", () => {
    expect(withMarkdownExtension("未命名")).toBe("未命名.md");
    expect(withMarkdownExtension("Daily.MD")).toBe("Daily.MD");
  });
});
