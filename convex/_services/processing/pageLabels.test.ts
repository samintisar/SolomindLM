import { describe, expect, it } from "vitest";
import {
  chunkPage,
  hasPageLabels,
  leadingPageBreakLength,
  maxPageLabel,
  PAGE_LABEL_LINE,
  pageAtOffset,
} from "./pageLabels";

const OCR_MARKDOWN = [
  "**Page 1**",
  "",
  "Alpha on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Gamma on page three.",
].join("\n");

describe("PAGE_LABEL_LINE", () => {
  it("matches a whole label line and captures the page", () => {
    expect("**Page 12**".match(PAGE_LABEL_LINE)?.[1]).toBe("12");
    expect("**Page 12**  ".match(PAGE_LABEL_LINE)?.[1]).toBe("12");
    expect("**Page 4**\r".match(PAGE_LABEL_LINE)?.[1]).toBe("4");
  });

  it("ignores a label inside a sentence", () => {
    expect("See **Page 12** for details".match(PAGE_LABEL_LINE)).toBeNull();
  });
});

describe("hasPageLabels / maxPageLabel", () => {
  it("finds labels in OCR markdown", () => {
    expect(hasPageLabels(OCR_MARKDOWN)).toBe(true);
    expect(maxPageLabel(OCR_MARKDOWN)).toBe(3);
  });

  it("reports none for unpaginated text", () => {
    expect(hasPageLabels("Plain text.\n\nMore text.")).toBe(false);
    expect(maxPageLabel("Plain text.")).toBeNull();
  });
});

describe("pageAtOffset", () => {
  it("returns the page of the nearest label at or before the offset", () => {
    const lookup = pageAtOffset(OCR_MARKDOWN);
    expect(lookup(OCR_MARKDOWN.indexOf("Alpha"))).toBe(1);
    expect(lookup(OCR_MARKDOWN.indexOf("Beta"))).toBe(2);
    expect(lookup(OCR_MARKDOWN.indexOf("**Page 3**"))).toBe(3);
    expect(lookup(OCR_MARKDOWN.indexOf("Gamma"))).toBe(3);
  });

  it("reads labels in CRLF text", () => {
    const md = "**Page 1**\r\n\r\nA\r\n---\r\n**Page 2**\r\n\r\nB";
    expect(pageAtOffset(md)(md.indexOf("B"))).toBe(2);
  });

  it("returns null before the first label and for unpaginated text", () => {
    expect(pageAtOffset("intro\n\n**Page 1**\n\nbody")(0)).toBeNull();
    expect(pageAtOffset("no labels")(3)).toBeNull();
  });
});

describe("leadingPageBreakLength", () => {
  it("measures separator and label lines that open a chunk", () => {
    const chunk = "---\n\n**Page 3**\n\nGamma on page three.";
    expect(chunk.slice(leadingPageBreakLength(chunk))).toBe("Gamma on page three.");
    expect(leadingPageBreakLength("**Page 1**\n\nAlpha")).toBe("**Page 1**\n\n".length);
    expect(leadingPageBreakLength("Plain start")).toBe(0);
    const crlf = "---\r\n\r\n**Page 2**\r\n\r\nX";
    expect(crlf.slice(leadingPageBreakLength(crlf))).toBe("X");
  });
});

describe("chunkPage", () => {
  it("returns the page the chunk text sits on", () => {
    expect(chunkPage(OCR_MARKDOWN, "Beta on page two.")).toBe(2);
    expect(chunkPage(OCR_MARKDOWN, "  Gamma on page three.\n")).toBe(3);
  });

  it("uses the page the text starts on when the chunk opens on a page break", () => {
    expect(chunkPage(OCR_MARKDOWN, "---\n\n**Page 3**\n\nGamma on page three.")).toBe(3);
  });

  it("returns null when repeated text sits on different pages, however long the pages are", () => {
    const uneven = [
      "**Page 1**",
      "",
      `${"Long first page. ".repeat(200)}`,
      "",
      "Figure caption repeated.",
      "",
      "---",
      "",
      "**Page 2**",
      "",
      "Figure caption repeated.",
    ].join("\n");
    expect(chunkPage(uneven, "Figure caption repeated.")).toBeNull();
  });

  it("returns the page when repeated text stays on one page", () => {
    const samePage = "**Page 4**\n\nrepeat me\n\nmiddle\n\nrepeat me";
    expect(chunkPage(samePage, "repeat me")).toBe(4);
  });

  it("returns null when the chunk is absent or empty", () => {
    expect(chunkPage(OCR_MARKDOWN, "not here")).toBeNull();
    expect(chunkPage(OCR_MARKDOWN, "   ")).toBeNull();
  });
});
