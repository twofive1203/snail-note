import { describe, expect, it } from "vitest";
import {
  clipboardHtmlToMarkdown,
  extractClipboardHtmlFragment,
  htmlToMarkdown,
  looksLikeRichHtml,
} from "../src/features/editor/html-to-markdown";

describe("extractClipboardHtmlFragment", () => {
  it("extracts the StartFragment slice", () => {
    const html = `<html><body><!--StartFragment--><h1>Title</h1><!--EndFragment--></body></html>`;
    expect(extractClipboardHtmlFragment(html)).toBe("<h1>Title</h1>");
  });

  it("strips the Windows CF_HTML header", () => {
    const html = `Version:0.9
StartHTML:0000000100
EndHTML:0000000200
StartFragment:0000000120
EndFragment:0000000180
<html><body><!--StartFragment--><p>Hi</p><!--EndFragment--></body></html>`;
    expect(extractClipboardHtmlFragment(html)).toBe("<p>Hi</p>");
  });
});

describe("looksLikeRichHtml", () => {
  it("rejects wrapper-only clipboard HTML", () => {
    expect(looksLikeRichHtml("<!--StartFragment-->hello world<!--EndFragment-->")).toBe(false);
    expect(looksLikeRichHtml("<span>hello</span>")).toBe(false);
  });

  it("detects semantic tags and inline emphasis styles", () => {
    expect(looksLikeRichHtml("<h1>Title</h1>")).toBe(true);
    expect(looksLikeRichHtml('<span style="font-weight:700">Bold</span>')).toBe(true);
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings, emphasis, links, and lists", () => {
    const markdown = htmlToMarkdown(
      `<h2>Title</h2><p>A <strong>bold</strong> and <em>italic</em> <a href="https://example.com">link</a>.</p><ul><li>one</li><li>two</li></ul>`,
    );
    expect(markdown).toContain("## Title");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("*italic*");
    expect(markdown).toContain("[link](https://example.com)");
    expect(markdown).toMatch(/-\s+one/);
    expect(markdown).toMatch(/-\s+two/);
  });

  it("converts fenced code with a language class", () => {
    const markdown = htmlToMarkdown(`<pre><code class="language-ts">const n = 1;\n</code></pre>`);
    expect(markdown).toBe("```ts\nconst n = 1;\n```");
  });

  it("converts tables, strikethrough, and task items", () => {
    const markdown = htmlToMarkdown(`
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
      <p><del>old</del></p>
      <ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>
    `);
    expect(markdown).toContain("| A | B |");
    expect(markdown).toContain("| --- | --- |");
    expect(markdown).toContain("| 1 | 2 |");
    expect(markdown).toContain("~~old~~");
    expect(markdown).toContain("[x]");
    expect(markdown).toContain("[ ]");
    expect(markdown).toContain("done");
    expect(markdown).toContain("todo");
  });

  it("converts Google Docs style spans and unwraps dummy bold wrappers", () => {
    const markdown = htmlToMarkdown(
      `<b style="font-weight:normal"><span style="font-weight:700">Bold</span> <span style="font-style:italic">Italic</span></b>`,
    );
    expect(markdown).toContain("**Bold**");
    expect(markdown).toContain("*Italic*");
    expect(markdown).not.toMatch(/\*\*\s*\*\*/);
  });

  it("normalizes protocol-relative images and wraps query pipes", () => {
    const markdown = htmlToMarkdown(
      `<img src="//upload-images.jianshu.io/upload_images/a.png?imageMogr2/auto-orient/strip|imageView2/2/w/1240" alt="cover">`,
    );
    expect(markdown).toBe(
      "![cover](<https://upload-images.jianshu.io/upload_images/a.png?imageMogr2/auto-orient/strip|imageView2/2/w/1240>)",
    );
  });

  it("drops javascript URLs", () => {
    const markdown = htmlToMarkdown(`<p><a href="javascript:alert(1)">click</a></p>`);
    expect(markdown).toContain("click");
    expect(markdown).not.toContain("javascript:");
  });
});

describe("clipboardHtmlToMarkdown", () => {
  it("converts rich clipboard HTML and ignores plain fragments", () => {
    const html = `<html><body><!--StartFragment--><h1>Hello</h1><p>World</p><!--EndFragment--></body></html>`;
    expect(clipboardHtmlToMarkdown(html)).toBe("# Hello\n\nWorld");
    expect(clipboardHtmlToMarkdown("<html><body>plain</body></html>")).toBeNull();
  });
});
