import { readFileSync } from "node:fs";
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

  it("does not use vertical CSS margin on live-preview block chrome", () => {
    const css = readFileSync("src/styles.css", "utf8");
    for (const selector of [
      ".markdown-editor.is-live .sn-md-codeblock",
      ".markdown-editor.is-live .sn-md-mermaid",
      ".markdown-editor.is-live .sn-md-hr",
    ]) {
      const start = css.lastIndexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThan(-1);
      const body = css.slice(start, css.indexOf("}", start));
      expect(body, selector).toMatch(/margin:\s*0\s*;/);
      expect(body, selector).not.toMatch(/margin:\s*(?:\.|[1-9])/);
    }
  });

  it("keeps fence marks hidden and shows a language switcher when the cursor is inside the block", async () => {
    const { container } = render(
      <MarkdownEditor value={"hello\n\n```\ngood\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
      expect(container.querySelector(".sn-md-code-lang")).toHaveTextContent("纯文本");
      expect(container.querySelector(".cm-content")?.textContent ?? "").not.toContain("```");
    });
    const view = editorView(container);
    const body = view.state.doc.toString().indexOf("good");
    view.dispatch({ selection: { anchor: body } });
    await waitFor(() => {
      expect(view.contentDOM.textContent).not.toContain("```");
      expect(view.contentDOM.textContent).toContain("good");
      expect(container.querySelector(".sn-md-codeblock")).toHaveClass("is-active");
      expect(container.querySelector(".sn-md-code-lang")).toBeInTheDocument();
    });
  });

  it("keeps a one-line code block cursor on the code line instead of the closing fence", async () => {
    const { container } = render(
      <MarkdownEditor value={"```\nnice\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    fireEvent.mouseDown(container.querySelector(".sn-md-codeblock")!);
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("nice");
    expect(view.contentDOM.textContent).not.toContain("```");
    expect(container.querySelector(".sn-md-codeblock")?.textContent).toContain("nice");
  });

  it("puts the cursor inside an empty live-preview code block on click", async () => {
    const { container } = render(
      <MarkdownEditor value={"asdfasdf\n\n```\n\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    view.contentDOM.blur();
    fireEvent.mouseDown(container.querySelector(".sn-md-codeblock")!);
    const head = view.state.selection.main.head;
    expect(view.state.doc.lineAt(head).text).toBe("");
    expect(view.state.doc.lineAt(head).number).toBe(4);
    expect(view.hasFocus).toBe(true);
  });

  it("inserts a line after a trailing code block when clicking below it", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value={"```\nnice\n```"} onChange={onChange} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    const block = container.querySelector(".sn-md-codeblock")!;
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 10,
      top: 10,
      left: 10,
      bottom: 40,
      right: 200,
      width: 190,
      height: 30,
      toJSON() {
        return {};
      },
    });
    fireEvent.mouseDown(view.contentDOM, { button: 0, clientX: 40, clientY: 80 });
    expect(view.state.doc.toString()).toBe("```\nnice\n```\n");
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(onChange).toHaveBeenCalled();
  });

  it("does not insert another line when a trailing code block already has a blank line after it", async () => {
    const { container } = render(
      <MarkdownEditor value={"```\nnice\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    const before = view.state.doc.toString();
    const block = container.querySelector(".sn-md-codeblock")!;
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 10,
      top: 10,
      left: 10,
      bottom: 40,
      right: 200,
      width: 190,
      height: 30,
      toJSON() {
        return {};
      },
    });
    fireEvent.mouseDown(view.contentDOM, { button: 0, clientX: 40, clientY: 80 });
    expect(view.state.doc.toString()).toBe(before);
  });

  it("does not pull the cursor into a code block when clicking below it", async () => {
    const { container } = render(
      <MarkdownEditor value={"```\nnice\n```\n\nbelow\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    const block = container.querySelector(".sn-md-codeblock")!;
    const line = block.querySelector(".cm-line")!;
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 10, top: 10, left: 10, bottom: 60, right: 200, width: 190, height: 50,
      toJSON() { return {}; },
    });
    vi.spyOn(line, "getBoundingClientRect").mockReturnValue({
      x: 20, y: 16, top: 16, left: 20, bottom: 30, right: 180, width: 160, height: 14,
      toJSON() { return {}; },
    });
    fireEvent.mouseDown(block, { button: 0, clientX: 40, clientY: 48 });
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).not.toBe("nice");
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("");
  });

  it("leaves a trailing code block on ArrowDown from the last code line", async () => {
    const { container } = render(
      <MarkdownEditor value={"```\nnice\n```"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    const view = editorView(container);
    view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf("nice") } });
    fireEvent.keyDown(view.contentDOM, { key: "ArrowDown" });
    expect(view.state.doc.toString()).toBe("```\nnice\n```\n");
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("");
  });

  it("does not pull the cursor into a neighboring code block when clicking the gap", async () => {
    const doc = "```\npublic void\n```\n\n\n\n```js\nconst value = 1;\n```\n";
    const { container } = render(<MarkdownEditor value={doc} onChange={vi.fn()} onSave={vi.fn()} />);
    await waitFor(() => {
      expect(container.querySelectorAll(".sn-md-codeblock")).toHaveLength(2);
    });
    const view = editorView(container);
    const blank = view.state.doc.line(5);
    expect(blank.text).toBe("");
    view.dispatch({ selection: { anchor: blank.from }, userEvent: "select.pointer" });
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("");
    const openLower = view.state.doc.toString().indexOf("```js");
    view.dispatch({ selection: { anchor: openLower }, userEvent: "select.pointer" });
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).toBe("");
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).not.toBe("const value = 1;");
    expect(view.state.doc.lineAt(view.state.selection.main.head).text).not.toBe("public void");
  });

  it("changes the fenced language from the corner switcher", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownEditor value={"```\nconst value = 1;\n```\n"} onChange={onChange} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      expect(container.querySelector(".sn-md-code-lang")).toHaveTextContent("纯文本");
    });
    fireEvent.mouseDown(container.querySelector(".sn-md-code-lang")!);
    const option = [...document.body.querySelectorAll(".sn-md-code-lang-options button")].find(
      (el) => el.textContent === "TypeScript",
    );
    expect(option).toBeTruthy();
    fireEvent.click(option!);
    const view = editorView(container);
    expect(view.state.doc.toString().startsWith("```typescript\n")).toBe(true);
    expect(onChange).toHaveBeenCalled();
    await waitFor(() => {
      expect(container.querySelector(".sn-md-code-lang")).toHaveTextContent("TypeScript");
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

  it("highlights javascript fences in live preview", async () => {
    await fenceCodeLanguage("js")?.load();
    const { container } = render(
      <MarkdownEditor value={"```js\nconst value = 1;\n```\n"} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    await waitFor(() => {
      const keyword = container.querySelector(".sn-md-codeblock .sn-md-tok-keyword");
      expect(keyword).toHaveTextContent("const");
    });
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

  it("hides auto-closed fence marks and does not keep extra space after the closer", async () => {
    const { container } = render(
      <MarkdownEditor value="```" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(completeFencedCodeOnEnter(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("```\n\n```");
    expect(view.state.doc.line(view.state.doc.lines).text).toBe("```");
    await waitFor(() => {
      const block = container.querySelector(".sn-md-codeblock");
      expect(block).toBeInTheDocument();
      expect(view.contentDOM.textContent).not.toContain("```");
      expect(block!.querySelector(".cm-line")).toBeInTheDocument();
      expect(block!.querySelector(".cm-line .sn-md-code-lang")).toBeNull();
    });
  });

  it("does not wrap an incomplete ``` line as a live-preview code block", async () => {
    const { container } = render(
      <MarkdownEditor value="```" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    expect(container.querySelector(".sn-md-codeblock")).not.toBeInTheDocument();
    expect(editorView(container).contentDOM.textContent).toContain("```");
  });

  it("allows typing after ``` + Enter + Enter in live preview", async () => {
    const { container } = render(
      <MarkdownEditor value="" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ changes: { from: 0, insert: "```" }, selection: { anchor: 3 } });
    view.contentDOM.focus();
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });
    expect(view.state.doc.toString()).toBe("```\n\n```");
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
    });
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: head, insert: "hello" },
      selection: { anchor: head + 5 },
    });
    expect(view.state.doc.toString()).toContain("hello");
    expect(view.state.doc.toString()).toMatch(/^```\n[\s\S]*hello[\s\S]*```/);
    const block = container.querySelector(".sn-md-codeblock");
    expect(block).toBeInTheDocument();
    fireEvent.mouseDown(block!);
    expect(view.hasFocus).toBe(true);
    expect(view.state.doc.toString()).toContain("hello");
  });

  it("keeps ``` + Enter as plaintext so typing goes into the block body", async () => {
    const { container } = render(
      <MarkdownEditor value="```" onChange={vi.fn()} onSave={vi.fn()} />,
    );
    const view = editorView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.contentDOM.focus();
    fireEvent.keyDown(view.contentDOM, { key: "Enter" });
    expect(view.state.doc.toString()).toBe("```\n\n```");
    expect(view.state.selection.main.head).toBe(4);
    expect(document.querySelector(".sn-md-code-lang-menu")).toBeNull();
    expect(document.activeElement).not.toEqual(container.querySelector(".sn-md-code-lang"));
    const head = view.state.selection.main.head;
    view.dispatch({
      changes: { from: head, insert: "hello" },
      selection: { anchor: head + 5 },
    });
    expect(view.state.doc.toString()).toBe("```\nhello\n```");
    await waitFor(() => {
      expect(container.querySelector(".sn-md-codeblock")).toBeInTheDocument();
      expect(container.querySelector(".sn-md-code-lang")).toHaveTextContent("纯文本");
    });
    expect(document.querySelector(".sn-md-code-lang-menu")).toBeNull();
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

  it("replaces content when switching files after a loading gap", async () => {
    const { container, rerender } = render(
      <MarkdownEditor value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="a.md" />,
    );
    expect(editorView(container).state.doc.toString()).toBe("# A");

    rerender(
      <MarkdownEditor disabled value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="b.md" />,
    );
    expect(editorView(container).state.doc.toString()).toBe("# A");

    rerender(
      <MarkdownEditor value="# B" onChange={vi.fn()} onSave={vi.fn()} syncKey="b.md" />,
    );
    await waitFor(() => {
      expect(editorView(container).state.doc.toString()).toBe("# B");
    });
  });

  it("replaces content when the new file arrives after a stale same-text frame", async () => {
    const { container, rerender } = render(
      <MarkdownEditor value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="a.md" />,
    );

    rerender(
      <MarkdownEditor value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="b.md" />,
    );
    expect(editorView(container).state.doc.toString()).toBe("# A");

    rerender(
      <MarkdownEditor value="# B" onChange={vi.fn()} onSave={vi.fn()} syncKey="b.md" />,
    );
    await waitFor(() => {
      expect(editorView(container).state.doc.toString()).toBe("# B");
    });
  });

  it("does not clobber in-progress edits for the same file", async () => {
    const { container, rerender } = render(
      <MarkdownEditor value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="a.md" />,
    );
    const view = editorView(container);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "typed" } });
    rerender(
      <MarkdownEditor value="# A" onChange={vi.fn()} onSave={vi.fn()} syncKey="a.md" />,
    );
    expect(editorView(container).state.doc.toString()).toBe("typed");
  });
});
