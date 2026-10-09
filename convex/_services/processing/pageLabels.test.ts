import { describe, expect, it } from "vitest";
import {
  hasPageLabels,
  leadingPageBreakLength,
  locateChunkOffset,
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

describe("locateChunkOffset", () => {
  it("finds the chunk text", () => {
    expect(locateChunkOffset(OCR_MARKDOWN, "Beta on page two.", 0)).toBe(
      OCR_MARKDOWN.indexOf("Beta")
    );
  });

  it("picks the occurrence closest to the expected offset", () => {
    const text = "repeat me\n\nmiddle\n\nrepeat me";
    expect(locateChunkOffset(text, "repeat me", text.length)).toBe(text.lastIndexOf("repeat me"));
    expect(locateChunkOffset(text, "repeat me", 0)).toBe(0);
  });

  it("trims the chunk and returns -1 when it is absent or empty", () => {
    expect(locateChunkOffset(OCR_MARKDOWN, "  Gamma on page three.\n", 0)).toBe(
      OCR_MARKDOWN.indexOf("Gamma")
    );
    expect(locateChunkOffset(OCR_MARKDOWN, "not here", 0)).toBe(-1);
    expect(locateChunkOffset(OCR_MARKDOWN, "   ", 0)).toBe(-1);
  });
});
