import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app/App";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function stubApi(options?: { saveFails?: boolean }) {
  const files = new Map<string, string>([["a.md", "# A"], ["b.md", "# B"]]);
  const extra: Array<{ name: string; path: string; type: "file" | "directory"; updatedAt: string; children?: [] }> = [];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === "/api/notebooks" && method === "GET") {
      return json({ notebooks: [{ id: "nb1", name: "Notes", root: "/notes" }] });
    }
    if (url.includes("/tree")) {
      return json({
        notebook: { id: "nb1", name: "Notes", root: "/notes" },
        root: [
          { name: "a.md", path: "a.md", type: "file", updatedAt: "now" },
          { name: "b.md", path: "b.md", type: "file", updatedAt: "now" },
          { name: "docs", path: "docs", type: "directory", updatedAt: "now", children: [] },
          ...extra,
        ],
      });
    }
    if (url.includes("/file") && method === "GET") {
      const path = new URL(url, "http://local").searchParams.get("path") ?? "";
      return json({ path, content: files.get(path) ?? "", updatedAt: "now" });
    }
    if (url.includes("/file") && method === "PUT") {
      if (options?.saveFails) return json({ error: { code: "IO", message: "磁盘只读" } }, 500);
      const body = JSON.parse(String(init?.body)) as { path: string; content: string };
      files.set(body.path, body.content);
      return json({ path: body.path, content: body.content, updatedAt: "later" });
    }
    if (url.includes("/file") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { path: string; content?: string };
      files.set(body.path, body.content ?? "");
      extra.push({ name: body.path.split("/").at(-1) ?? body.path, path: body.path, type: "file", updatedAt: "now" });
      return json({ path: body.path, content: body.content ?? "", updatedAt: "now" });
    }
    if (url.includes("/entry") && method === "PATCH") {
      const body = JSON.parse(String(init?.body)) as { path: string; newPath: string };
      return json({ path: body.newPath });
    }
    return json({ error: { message: `unhandled ${method} ${url}` } }, 404);
  });
}

function editorView(container: HTMLElement) {
  const dom = container.querySelector(".cm-editor");
  const view = dom ? EditorView.findFromDOM(dom as HTMLElement) : null;
  if (!view) throw new Error("CodeMirror view not found");
  return view;
}

async function renderLoadedApp() {
  const view = render(<App />);
  await waitFor(() => expect(screen.getByRole("button", { name: /a\.md/ })).toHaveClass("selected"));
  await waitFor(() => expect(screen.getByText("已保存")).toBeInTheDocument());
  return view;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App workspace navigation", () => {
  it("switches editor content when clicking another file", async () => {
    vi.stubGlobal("fetch", stubApi());
    const { container } = await renderLoadedApp();
    await waitFor(() => expect(editorView(container).state.doc.toString()).toBe("# A"));

    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    await waitFor(() => {
      expect(container.querySelector(".document-title")?.textContent).toBe("b.md");
      expect(editorView(container).state.doc.toString()).toBe("# B");
    });
    expect(screen.getByRole("button", { name: /b\.md/ })).toHaveClass("selected");
  });

  it("keeps the opened-file highlight until unsaved changes are resolved", async () => {
    vi.stubGlobal("fetch", stubApi());
    const promptSpy = vi.spyOn(window, "prompt");
    const { container } = await renderLoadedApp();

    const view = editorView(container);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "dirty A" } });
    await waitFor(() => expect(screen.getByText("未保存")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    expect(await screen.findByRole("dialog", { name: "未保存的修改" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /a\.md/ })).toHaveClass("selected");
    expect(screen.getByRole("button", { name: /b\.md/ })).not.toHaveClass("selected");
    expect(screen.getByRole("button", { name: /b\.md/ })).not.toHaveClass("active");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "未保存的修改" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /a\.md/ })).toHaveClass("selected");
    expect(screen.getByText("未保存")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    fireEvent.click(await screen.findByRole("button", { name: "不保存" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /b\.md/ })).toHaveClass("selected"));
    expect(screen.getByRole("button", { name: /a\.md/ })).not.toHaveClass("selected");
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("saves dirty notes when the user chooses save, and stays put if save fails", async () => {
    const fetchMock = stubApi({ saveFails: true });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = await renderLoadedApp();

    const view = editorView(container);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "dirty A" } });
    await waitFor(() => expect(screen.getByText("未保存")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /b\.md/ }));
    const dialog = await screen.findByRole("dialog", { name: "未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("磁盘只读")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /a\.md/ })).toHaveClass("selected");
    expect(screen.getByRole("button", { name: /b\.md/ })).not.toHaveClass("selected");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(true);
  });

  it("creates notes through an in-app prompt instead of window.prompt", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("fetch", fetchMock);
    const promptSpy = vi.spyOn(window, "prompt");
    await renderLoadedApp();

    fireEvent.click(screen.getByTitle("新建笔记 (Ctrl/Cmd+N)"));
    const dialog = await screen.findByRole("dialog", { name: "新建笔记" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "会议" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));

    await waitFor(() => expect(screen.getByText("已创建 会议.md")).toBeInTheDocument());
    expect(promptSpy).not.toHaveBeenCalled();
    const createCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toEqual({ path: "会议.md" });
  });

  it("moves an entry by picking a folder instead of typing a path", async () => {
    const fetchMock = stubApi();
    vi.stubGlobal("fetch", fetchMock);
    const promptSpy = vi.spyOn(window, "prompt");
    await renderLoadedApp();

    fireEvent.click(screen.getByRole("button", { name: "移动" }));
    const dialog = await screen.findByRole("dialog", { name: "移动" });
    fireEvent.click(within(dialog).getByRole("button", { name: /docs/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "移动" }));

    await waitFor(() => expect(screen.getByText("已移动到 docs/a.md")).toBeInTheDocument());
    expect(promptSpy).not.toHaveBeenCalled();
    const moveCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PATCH");
    expect(JSON.parse(String((moveCall?.[1] as RequestInit).body))).toEqual({ path: "a.md", newPath: "docs/a.md" });
  });
});
