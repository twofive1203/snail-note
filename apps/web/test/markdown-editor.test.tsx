import { fireEvent, render, waitFor } from "@testing-library/react";
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

  it("hides markdown marks on inactive lines in live preview without rewriting source", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value={"hello\n\n# Title\n\n**bold**"} onChange={onChange} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      const text = container.querySelector(".cm-content")?.textContent ?? "";
      expect(text).toContain("hello");
      expect(text).toContain("Title");
      expect(text).toContain("bold");
      expect(text).not.toContain("#");
      expect(text).not.toContain("**");
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector(".markdown-editor")).toHaveClass("is-live");
  });

  it("shows raw markdown in source mode", async () => {
    const { container, rerender } = render(
      <MarkdownEditor livePreview value={"hello\n\n# Title"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".cm-content")?.textContent ?? "").not.toContain("#");
    });
    rerender(<MarkdownEditor livePreview={false} value={"hello\n\n# Title"} onChange={vi.fn()} onSave={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector(".cm-content")).toHaveTextContent("# Title");
    });
    expect(container.querySelector(".markdown-editor")).not.toHaveClass("is-live");
    expect(container.querySelector(".markdown-editor")).toHaveAttribute("aria-label", "Markdown 编辑器");
  });

  it("renders mermaid fences as diagrams in live preview", async () => {
    const { container } = render(
      <MarkdownEditor value={"hello\n\n```mermaid\ngraph TD\n  A --> B\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-mermaid")).toBeInTheDocument();
    });
    expect(container.querySelector(".cm-content")?.textContent ?? "").toContain("hello");
    expect(container.querySelector(".cm-content")?.textContent ?? "").not.toContain("graph TD");
  });
});
