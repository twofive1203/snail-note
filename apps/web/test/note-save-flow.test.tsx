import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNoteDocument } from "../src/features/editor/use-note-document";

function SaveHarness() {
  const [path] = useState("daily/a.md");
  const note = useNoteDocument(path);
  return (
    <div>
      <textarea aria-label="content" value={note.content} onChange={(event) => note.setContent(event.target.value)} />
      <span>{note.dirty ? "未保存" : "已保存"}</span>
      <button onClick={() => void note.save()}>保存</button>
      {note.error ? <div>{note.error}</div> : null}
    </div>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("note save flow", () => {
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
