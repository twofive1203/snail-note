import { describe, expect, it } from "vitest";
import { markdownLinkDestination, toDisplayImageSrc, toMarkdownImageSrc } from "../src/features/editor/image-url";

describe("toMarkdownImageSrc", () => {
  it("promotes protocol-relative URLs to https for storage", () => {
    expect(toMarkdownImageSrc("//upload-images.jianshu.io/a.png")).toBe("https://upload-images.jianshu.io/a.png");
  });

  it("keeps absolute http(s) URLs", () => {
    expect(toMarkdownImageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("drops javascript URLs", () => {
    expect(toMarkdownImageSrc("javascript:alert(1)")).toBeNull();
  });
});

describe("toDisplayImageSrc", () => {
  it("uses protocol-relative URLs so HTTP pages can load HTTP CDNs", () => {
    expect(toDisplayImageSrc("https://example.com/a.png")).toBe("//example.com/a.png");
    expect(toDisplayImageSrc("//upload-images.jianshu.io/a.png")).toBe("//upload-images.jianshu.io/a.png");
  });

  it("unwraps angle-bracket markdown destinations", () => {
    const src = "<https://upload-images.jianshu.io/a.png?x|y>";
    expect(toDisplayImageSrc(src)).toBe("//upload-images.jianshu.io/a.png?x|y");
  });
});

describe("markdownLinkDestination", () => {
  it("wraps destinations that contain markdown-special characters", () => {
    const src = "https://upload-images.jianshu.io/a.png?imageMogr2/auto-orient/strip|imageView2/2/w/1240";
    expect(markdownLinkDestination(src)).toBe(`<${src}>`);
  });
});
