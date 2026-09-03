import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../src/features/editor/MarkdownEditor";
import { useNoteDocument } from "../src/features/editor/use-note-document";

function SaveHarness({ codeMirror = false, autoSaveMs = 0 }: { codeMirror?: boolean; autoSaveMs?: number }) {
  const [path] = useState("daily/a.md");
  const note = useNoteDocument("notebook-1", path, { autoSaveMs });
  return (
    <div>
      {codeMirror ? (
        <MarkdownEditor value={note.content} onChange={note.setContent} onSave={() => void note.save()} />
      ) : (
        <textarea aria-label="content" value={note.content} onChange={(event) => note.setContent(event.target.value)} />
      )}
      <span>{note.dirty ? "未保存" : "已保存"}</span>
      <button onClick={() => void note.save()}>保存</button>
      {note.error ? <div>{note.error}</div> : null}
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("note save flow", () => {
  it("does not mark an untouched CRLF document as dirty after CodeMirror normalizes it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      path: "daily/a.md",
      content: "first\r\nsecond",
      updatedAt: "now",
    }), { status: 200 })));
    const { container } = render(<SaveHarness codeMirror />);

    await waitFor(() => expect(container.querySelector(".cm-content")).toHaveTextContent("firstsecond"));
    expect(screen.getByText("已保存")).toBeInTheDocument();
    expect(screen.queryByText("未保存")).not.toBeInTheDocument();
  });

  it("loads original Markdown, saves the full text and clears dirty state", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "daily/a.md", content: "# old", updatedAt: "now" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "daily/a.md", content: "# changed", updatedAt: "later" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SaveHarness />);

    await waitFor(() => expect(screen.getByLabelText("content")).toHaveValue("# old"));
    fireEvent.change(screen.getByLabelText("content"), { target: { value: "# changed" } });
    expect(screen.getByText("未保存")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("已保存")).toBeInTheDocument());
    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(request.method).toBe("PUT");
    expect(JSON.parse(request.body as string)).toEqual({ path: "daily/a.md", content: "# changed" });
  });

  it("auto-saves the latest edits after idle", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "daily/a.md", content: "# old", updatedAt: "now" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "daily/a.md", content: "# latest", updatedAt: "later" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SaveHarness autoSaveMs={20} />);

    await waitFor(() => expect(screen.getByLabelText("content")).toHaveValue("# old"));
    fireEvent.change(screen.getByLabelText("content"), { target: { value: "# changed" } });
    fireEvent.change(screen.getByLabelText("content"), { target: { value: "# latest" } });

    await waitFor(() => expect(screen.getByText("已保存")).toBeInTheDocument());
    const puts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(puts).toHaveLength(1);
    const [, request] = puts[0] as [string, RequestInit];
    expect(JSON.parse(request.body as string)).toEqual({ path: "daily/a.md", content: "# latest" });
  });

  it("does not auto-save after unmount", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(new Response(JSON.stringify({ path: "daily/a.md", content: "old", updatedAt: "now" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<SaveHarness autoSaveMs={30} />);

    await waitFor(() => expect(screen.getByLabelText("content")).toHaveValue("old"));
    fireEvent.change(screen.getByLabelText("content"), { target: { value: "unsaved" } });
    unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });

  it("keeps edited content when saving fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ path: "daily/a.md", content: "old", updatedAt: "now" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "磁盘只读" } }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SaveHarness />);

    await waitFor(() => expect(screen.getByLabelText("content")).toHaveValue("old"));
    fireEvent.change(screen.getByLabelText("content"), { target: { value: "unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("磁盘只读")).toBeInTheDocument());
    expect(screen.getByLabelText("content")).toHaveValue("unsaved");
    expect(screen.getByText("未保存")).toBeInTheDocument();
  });
});
