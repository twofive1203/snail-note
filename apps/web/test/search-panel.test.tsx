import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchPanel } from "../src/features/search/SearchPanel";

afterEach(() => vi.unstubAllGlobals());

describe("SearchPanel", () => {
  it("searches and opens the chosen result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: "needle",
      matches: [{ path: "daily/a.md", title: "A note", snippet: "a needle here", line: 3 }],
    }), { status: 200 })));
    const onOpenFile = vi.fn();
    render(<SearchPanel open notebookId="notebook-1" onClose={vi.fn()} onOpenFile={onOpenFile} />);

    fireEvent.change(screen.getByPlaceholderText("搜索笔记内容…"), { target: { value: "needle" } });
    await waitFor(() => expect(screen.getByText("A note")).toBeInTheDocument(), { timeout: 1000 });
    expect(screen.getByText("needle").tagName).toBe("MARK");
    fireEvent.click(screen.getByRole("button", { name: /A note/ }));
    expect(onOpenFile).toHaveBeenCalledWith("daily/a.md");
  });
});
