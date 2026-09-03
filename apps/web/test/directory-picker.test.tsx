import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectoryPicker } from "../src/features/notebooks/DirectoryPicker";

afterEach(() => vi.unstubAllGlobals());

describe("DirectoryPicker", () => {
  it("browses server directories and selects the current directory", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        path: "/",
        parent: null,
        directories: [{ name: "notes", path: "/notes" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        path: "/notes",
        parent: "/",
        directories: [],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(<DirectoryPicker open onClose={vi.fn()} onSelect={onSelect} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /notes/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /notes/ }));
    await waitFor(() => expect(screen.getByText("/notes")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "选择当前目录" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("/notes"));
  });
});
