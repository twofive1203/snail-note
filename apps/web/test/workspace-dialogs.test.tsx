import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MoveEntryDialog } from "../src/features/dialogs/MoveEntryDialog";
import { PromptDialog } from "../src/features/dialogs/PromptDialog";
import { UnsavedChangesDialog } from "../src/features/dialogs/UnsavedChangesDialog";
import { validateEntryName } from "../src/features/dialogs/entry-name";

describe("workspace dialogs", () => {
  it("validates prompt input before submitting", () => {
    const onSubmit = vi.fn();
    render(
      <PromptDialog
        title="新建笔记"
        defaultValue="未命名.md"
        submitLabel="创建"
        validate={(value) => validateEntryName(value, "file")}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "folder/note.md" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
    expect(screen.getByText("文件名不能包含路径分隔符")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "会议.md" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledWith("会议.md");
  });

  it("offers save, discard and cancel for unsaved changes", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();
    render(<UnsavedChangesDialog fileName="a.md" onSave={onSave} onDiscard={onDiscard} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "不保存" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("picks a move target from the directory tree", () => {
    const onSubmit = vi.fn();
    render(
      <MoveEntryDialog
        entry={{ path: "a.md", type: "file" }}
        nodes={[
          { name: "a.md", path: "a.md", type: "file", updatedAt: "now" },
          { name: "docs", path: "docs", type: "directory", updatedAt: "now", children: [] },
        ]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "移动" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /docs/ }));
    fireEvent.click(screen.getByRole("button", { name: "移动" }));
    expect(onSubmit).toHaveBeenCalledWith("docs/a.md");
  });

  it("does not allow moving a folder into itself", () => {
    render(
      <MoveEntryDialog
        entry={{ path: "docs", type: "directory" }}
        nodes={[
          {
            name: "docs",
            path: "docs",
            type: "directory",
            updatedAt: "now",
            children: [{ name: "nested", path: "docs/nested", type: "directory", updatedAt: "now", children: [] }],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /docs/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "移动" })).toBeDisabled();
    expect(screen.getByText("已在该目录")).toBeInTheDocument();
  });
});
