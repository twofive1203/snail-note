import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileTree } from "../src/features/file-tree/FileTree";

describe("web application shell", () => {
  it("provides the file explorer's empty notebook state", () => {
    render(
      <FileTree
        nodes={[]}
        currentPath={null}
        activeEntry={null}
        dirty={false}
        filter=""
        collapseSignal={0}
        onOpenFile={vi.fn()}
        onActivate={vi.fn()}
      />,
    );
    expect(screen.getByText(/创建第一篇笔记/)).toBeInTheDocument();
  });
});
