import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fenceCodeLanguage } from "../src/features/editor/code-languages";
import { completeFencedCodeOnEnter } from "../src/features/editor/fence-complete";
import { MarkdownEditor } from "../src/features/editor/MarkdownEditor";

function editorView(container: HTMLElement) {
  const dom = container.querySelector(".cm-editor");
  const view = dom ? EditorView.findFromDOM(dom as HTMLElement) : null;
  if (!view) throw new Error("CodeMirror view not found");
  return view;
}

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

  it("renders fenced code like preview in live mode", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value={"hello\n\n```\ngood\n```\n\n```\nnice\n```\n"} onChange={onChange} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      const blocks = container.querySelectorAll(".sn-md-codeblock");
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toHaveTextContent("good");
      expect(blocks[1]).toHaveTextContent("nice");
    });
    const text = container.querySelector(".cm-content")?.textContent ?? "";
    expect(text).toContain("good");
    expect(text).toContain("nice");
    expect(text).not.toContain("```");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reveals fenced code marks when the cursor is inside the block", async () => {
    const { container } = render(
      <MarkdownEditor value={"hello\n\n```\ngood\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
      expect(container.querySelector(".cm-content")?.textContent ?? "").not.toContain("```");
    });
    const view = editorView(container);
    const body = view.state.doc.toString().indexOf("good");
    view.dispatch({ selection: { anchor: body } });
    await waitFor(() => {
      expect(view.contentDOM.textContent).toContain("```");
      expect(view.contentDOM.textContent).toContain("good");
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
  });

  it("maps fenced code languages including curl and skips mermaid", () => {
    expect(fenceCodeLanguage("js")?.name).toBe("JavaScript");
    expect(fenceCodeLanguage("ts")?.name).toBe("TypeScript");
    expect(fenceCodeLanguage("java")?.name).toBe("Java");
    expect(fenceCodeLanguage("bash")?.name).toBe("Shell");
    expect(fenceCodeLanguage("curl")?.name).toBe("Shell");
    expect(fenceCodeLanguage("mermaid")).toBeNull();
  });

  it("parses javascript fences with a nested language", async () => {
    await fenceCodeLanguage("js")?.load();
    const state = EditorState.create({
      doc: "```js\nconst value = 1;\n```\n",
      extensions: [markdown({ base: markdownLanguage, codeLanguages: fenceCodeLanguage })],
    });
    const tree = syntaxTree(state);
    const tagged: string[] = [];
    highlightTree(tree, classHighlighter, (from, to, classes) => {
      tagged.push(`${state.sliceDoc(from, to)}:${classes}`);
    });
    expect(tagged.some((entry) => entry.includes("const") && entry.includes("keyword"))).toBe(true);
  });

  it("keeps source edits when switching back to live even if React passes a stale value", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <MarkdownEditor livePreview={false} value="hello" onChange={onChange} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ changes: { from: 5, insert: " 世界" } });
    expect(onChange).toHaveBeenCalledWith("hello 世界");
    expect(view.state.doc.toString()).toBe("hello 世界");

    onChange.mockClear();
    rerender(<MarkdownEditor livePreview value="hello" onChange={onChange} onSave={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector(".markdown-editor")).toHaveClass("is-live");
    });
    expect(view.state.doc.toString()).toBe("hello 世界");
    expect(view.contentDOM.textContent).toContain("世界");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("restores live preview after editing markdown in source mode", async () => {
    const onChange = vi.fn();
    const source = "# Title\n\n- [ ] task\n\n[link](https://example.com)\n\n```mermaid\ngraph TD\n  A --> B\n```\n";
    const { container, rerender } = render(
      <MarkdownEditor livePreview value={source} onChange={onChange} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-mermaid")).toBeInTheDocument();
    });

    rerender(<MarkdownEditor livePreview={false} value={source} onChange={onChange} onSave={vi.fn()} />);
    const view = editorView(container);
    await waitFor(() => {
      expect(view.state.doc.toString()).toContain("# Title");
      expect(container.querySelector(".markdown-editor")).not.toHaveClass("is-live");
    });

    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nadded" } });
    const edited = `${source}\nadded`;
    expect(view.state.doc.toString()).toBe(edited);

    rerender(<MarkdownEditor livePreview value={edited} onChange={onChange} onSave={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelector(".markdown-editor")).toHaveClass("is-live");
      expect(view.state.doc.toString()).toBe(edited);
      expect(view.contentDOM.textContent).toContain("added");
    });
  });

  it("completes a closing fence when pressing Enter after ```", () => {
    const { container } = render(
      <MarkdownEditor livePreview={false} value="```" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(completeFencedCodeOnEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("```\n\n```");
    expect(view.state.selection.main.head).toBe(4);
  });

  it("completes a language fence and leaves the cursor inside the block", () => {
    const { container } = render(
      <MarkdownEditor livePreview={false} value="```ts" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });
    expect(view.state.doc.toString()).toBe("```ts\n\n```");
    expect(view.state.sliceDoc(0, view.state.selection.main.head)).toBe("```ts\n");
  });

  it("does not insert another closer for an already closed fence", () => {
    const doc = "```\ncode\n```";
    const { container } = render(
      <MarkdownEditor livePreview={false} value={doc} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ selection: { anchor: 3 } });
    expect(completeFencedCodeOnEnter(view)).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it("applies loaded document content after the initial empty editor", async () => {
    const { container, rerender } = render(
      <MarkdownEditor disabled value="" onChange={vi.fn()} onSave={vi.fn()} syncKey="notes/a.md" />,
    );
    expect(editorView(container).state.doc.toString()).toBe("");
    rerender(
      <MarkdownEditor value="# loaded" onChange={vi.fn()} onSave={vi.fn()} syncKey="notes/a.md" />,
    );
    await waitFor(() => {
      expect(editorView(container).state.doc.toString()).toBe("# loaded");
    });
  });
});
