import { describe, expect, it } from "vitest";
import {
  restoreAngleBracketsAfterDomPurify,
  sanitizeHtml,
  sanitizeMarkdown,
} from "./sanitizeMarkdown";

// Note: DOMPurify under jsdom may not perfectly match browser behavior,
// especially around edge cases in HTML entity encoding. These tests validate
// the primary use case (XSS prevention + math preservation) but don't guarantee
// pixel-perfect parity with Chrome's DOMPurify behavior.

describe("restoreAngleBracketsAfterDomPurify", () => {
  it("restores &lt; to <", () => {
    expect(restoreAngleBracketsAfterDomPurify("x &lt; 5")).toBe("x < 5");
  });

  it("restores &gt; to >", () => {
    expect(restoreAngleBracketsAfterDomPurify("x &gt; 5")).toBe("x > 5");
  });

  it("restores both in same string", () => {
    expect(restoreAngleBracketsAfterDomPurify("0 &lt; x &gt; 1")).toBe("0 < x > 1");
  });

  it("leaves text without entities unchanged", () => {
    expect(restoreAngleBracketsAfterDomPurify("plain text")).toBe("plain text");
  });

  it("handles multiple occurrences", () => {
    expect(restoreAngleBracketsAfterDomPurify("&lt;a&gt;&lt;b&gt;")).toBe("<a><b>");
  });
});

describe("sanitizeMarkdown", () => {
  it("preserves plain text", () => {
    expect(sanitizeMarkdown("Hello world")).toBe("Hello world");
  });

  it("strips script tags (XSS prevention)", () => {
    const result = sanitizeMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("preserves inline math $...$", () => {
    const result = sanitizeMarkdown("The result is $x^2 + y^2$.");
    expect(result).toContain("$x^2 + y^2$");
  });

  it("preserves display math $$...$$", () => {
    const result = sanitizeMarkdown("$$\\frac{1}{2}$$");
    expect(result).toContain("$$\\frac{1}{2}$$");
  });

  it("preserves angle brackets inside math", () => {
    const result = sanitizeMarkdown("$0 < \\theta < 1$");
    expect(result).toContain("$0 < \\theta < 1$");
  });

  it("handles empty string", () => {
    expect(sanitizeMarkdown("")).toBe("");
  });

  it("strips ANSI escape codes", () => {
    // ANSI code: \x1b[31m (red text) followed by \x1b[0m (reset)
    const result = sanitizeMarkdown("hello\x1b[31m world\x1b[0m");
    expect(result).toBe("hello world");
  });

  it("normalizes \\[...\\] to $$...$$ before sanitizing", () => {
    const result = sanitizeMarkdown("text \\[x^2\\] more");
    expect(result).toContain("$$x^2$$");
  });

  it("normalizes \\(...\\) to $...$ before sanitizing", () => {
    const result = sanitizeMarkdown("text \\(x^2\\) more");
    expect(result).toContain("$x^2$");
  });
});

describe("sanitizeHtml", () => {
  it("allows safe HTML tags", () => {
    const result = sanitizeHtml("<p>Hello <strong>world</strong></p>");
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
  });

  it("strips script tags from HTML", () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>Hello</p>");
  });

  it("strips dangerous attributes", () => {
    const result = sanitizeHtml('<p onclick="alert(1)">Hello</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("Hello");
  });

  it("allows href attribute on links", () => {
    const result = sanitizeHtml('<a href="https://example.com">Link</a>');
    expect(result).toContain('href="https://example.com"');
  });
});
