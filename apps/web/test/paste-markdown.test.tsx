import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/features/editor/MarkdownEditor";
import { pasteMarkdownExtension } from "../src/features/editor/paste-markdown";

const views: EditorView[] = [];

afterEach(() => {
  while (views.length) {
    const view = views.pop();
    view?.destroy();
    view?.dom.parentElement?.remove();
  }
});

function createView(doc = "") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [pasteMarkdownExtension()],
    }),
  });
  views.push(view);
  return view;
}

function paste(target: HTMLElement, data: { html?: string; plain?: string; shiftKey?: boolean }) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "shiftKey", { value: data.shiftKey ?? false });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData(type: string) {
        if (type === "text/html") return data.html ?? "";
        if (type === "text/plain") return data.plain ?? "";
        return "";
      },
    },
  });
  target.dispatchEvent(event);
}

describe("pasteMarkdownExtension", () => {
  it("inserts Markdown converted from clipboard HTML", () => {
    const view = createView();
    paste(view.contentDOM, {
      html: "<h2>Title</h2><p>A <strong>bold</strong> word</p>",
      plain: "Title\nA bold word",
    });
    expect(view.state.doc.toString()).toBe("## Title\n\nA **bold** word");
  });

  it("pastes clipboard plain text when Shift is held", () => {
    const view = createView("keep ");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    paste(view.contentDOM, {
      html: "<h1>Hello</h1>",
      plain: "plain",
      shiftKey: true,
    });
    expect(view.state.doc.toString()).toBe("keep plain");
  });

  it("falls back to plain text when HTML has no formatting", () => {
    const view = createView();
    paste(view.contentDOM, {
      html: "<html><body>plain</body></html>",
      plain: "plain",
    });
    expect(view.state.doc.toString()).toBe("plain");
  });
});

describe("MarkdownEditor paste", () => {
  it("converts rich HTML in the live editor", () => {
    const onChange = vi.fn();
    const { container } = render(<MarkdownEditor value="" onChange={onChange} onSave={vi.fn()} />);
    const content = container.querySelector(".cm-content");
    if (!content) throw new Error("editor content not found");
    paste(content as HTMLElement, {
      html: "<!--StartFragment--><p>Hello <em>world</em></p><!--EndFragment-->",
      plain: "Hello world",
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("Hello *world*");
  });
});
