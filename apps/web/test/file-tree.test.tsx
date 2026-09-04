import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "../src/features/file-tree/FileTree";

const nodes = [{
  name: "daily",
  path: "daily",
  type: "directory" as const,
  updatedAt: "2026-09-03T00:00:00.000Z",
  children: [{
    name: "会议记录.md",
    path: "daily/会议记录.md",
    type: "file" as const,
    updatedAt: "2026-09-03T00:00:00.000Z",
  }],
}];

describe("FileTree", () => {
  it("shows only the first level until the user expands a directory", () => {
    const onOpenFile = vi.fn();
    const onActivate = vi.fn();
    render(
      <FileTree
        nodes={nodes}
        currentPath={null}
        activeEntry={null}
        dirty={false}
        filter=""
        collapseSignal={0}
        onOpenFile={onOpenFile}
        onActivate={onActivate}
      />,
    );

    expect(screen.queryByRole("button", { name: /会议记录\.md/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /daily/ }));
    expect(onActivate).toHaveBeenCalledWith({ path: "daily", type: "directory" });
    fireEvent.click(screen.getByRole("button", { name: /会议记录\.md/ }));
    expect(onOpenFile).toHaveBeenCalledWith("daily/会议记录.md");
    expect(onActivate).not.toHaveBeenCalledWith({ path: "daily/会议记录.md", type: "file" });
  });

  it("keeps the opened-file highlight on currentPath and ignores clicks while disabled", () => {
    const onOpenFile = vi.fn();
    const onActivate = vi.fn();
    const props = {
      nodes,
      currentPath: "daily/会议记录.md",
      activeEntry: { path: "daily", type: "directory" as const },
      dirty: false,
      filter: "",
      collapseSignal: 0,
      onOpenFile,
      onActivate,
    };
    const { rerender } = render(<FileTree {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /daily/ }));
    onActivate.mockClear();

    rerender(<FileTree {...props} disabled />);
    const file = screen.getByRole("button", { name: /会议记录\.md/ });
    const directory = screen.getByRole("button", { name: /daily/ });
    expect(file).toHaveClass("selected");
    expect(file).not.toHaveClass("active");
    expect(directory).toHaveClass("active");
    fireEvent.click(file);
    fireEvent.click(directory);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("shows an explicit empty search state", () => {
    render(
      <FileTree
        nodes={nodes}
        currentPath={null}
        activeEntry={null}
        dirty={false}
        filter="不存在"
        collapseSignal={0}
        onOpenFile={vi.fn()}
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByText("没有匹配的文件")).toBeInTheDocument();
  });
});
