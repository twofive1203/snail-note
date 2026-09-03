import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "../src/features/editor/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders common Markdown elements", () => {
    render(<MarkdownPreview content={"# 标题\n\n- 第一项\n\n`code`"} />);
    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("第一项").closest("li")).toBeInTheDocument();
    expect(screen.getByText("code").closest("code")).toBeInTheDocument();
  });

  it("sanitizes executable HTML", () => {
    const { container } = render(<MarkdownPreview content={'<img src="x" onerror="alert(1)"><script>alert(1)</script>'} />);
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });
});
