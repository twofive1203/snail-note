import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/features/editor/MarkdownEditor";

describe("MarkdownEditor", () => {
  it("loads Markdown as plain text and handles the save shortcut", () => {
    const onSave = vi.fn();
    const { container } = render(
      <MarkdownEditor value="# 原始 Markdown" onChange={vi.fn()} onSave={onSave} />,
    );
    expect(container.querySelector(".cm-content")).toHaveTextContent("# 原始 Markdown");
    fireEvent.keyDown(container.querySelector(".cm-content")!, { key: "s", code: "KeyS", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
