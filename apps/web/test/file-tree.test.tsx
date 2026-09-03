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
    render(
      <FileTree
        nodes={nodes}
        currentPath={null}
        activeEntry={null}
        dirty={false}
        filter=""
        collapseSignal={0}
        onOpenFile={onOpenFile}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /会议记录\.md/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /daily/ }));
    fireEvent.click(screen.getByRole("button", { name: /会议记录\.md/ }));
    expect(onOpenFile).toHaveBeenCalledWith("daily/会议记录.md");
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
