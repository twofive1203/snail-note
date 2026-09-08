import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "../src/features/editor/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders common Markdown elements", () => {
    render(<MarkdownPreview content={"# 标题\n\n- 第一项\n\n`code`"} />);
    expect(screen.getByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByText("第一项").closest("li")).toBeInTheDocument();
    expect(screen.getByText("code").closest("code")).toBeInTheDocument();
  });

  it("renders https images and strips scripts", () => {
    const { container } = render(
      <MarkdownPreview content={'![](https://example.com/pic.png)\n\n<img src="x" onerror="alert(1)">'} />,
    );
    const image = container.querySelector('img[src="//example.com/pic.png"]');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("loads https images with protocol-relative src", () => {
    const { container } = render(
      <MarkdownPreview content={"![](https://upload-images.jianshu.io/a.png?x|y)"} />,
    );
    expect(container.querySelector("img")).toHaveAttribute("src", "//upload-images.jianshu.io/a.png?x|y");
  });

  it("sanitizes executable HTML", () => {
    const { container } = render(<MarkdownPreview content={'<img src="x" onerror="alert(1)"><script>alert(1)</script>'} />);
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });

  it("highlights fenced javascript in preview", () => {
    const { container } = render(<MarkdownPreview content={"```js\nconst value = 1;\n```"} />);
    const code = container.querySelector("pre code.hljs");
    expect(code).toBeInTheDocument();
    expect(code?.querySelector(".hljs-keyword")).toHaveTextContent("const");
  });

  it("renders mermaid fences as diagrams", async () => {
    const { container } = render(<MarkdownPreview content={"```mermaid\ngraph TD\nA-->B\n```"} />);
    await waitFor(() => {
      expect(container.querySelector(".sn-mermaid")).toBeInTheDocument();
      expect(container.querySelector(".sn-mermaid-svg")).toBeInTheDocument();
    });
  });
});
