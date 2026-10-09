import { describe, expect, it } from "vitest";
import { StructuralChunker } from "./StructuralChunker";

const OCR_DOC = [
  "**Page 1**",
  "",
  "# Intro",
  "",
  "Alpha text on page one.",
  "",
  "---",
  "",
  "**Page 2**",
  "",
  "Beta text on page two.",
  "",
  "## Methods",
  "",
  "Gamma text on page two.",
  "",
  "---",
  "",
  "**Page 3**",
  "",
  "Delta text on page three.",
].join("\n");

async function chunk(text: string) {
  return new StructuralChunker().chunk(text, 1000, 0);
}

describe("StructuralChunker pages", () => {
  it("gives each chunk the page it sits on, keeping the heading path across pages", async () => {
    const chunks = await chunk(OCR_DOC);
    expect(
      chunks.map((c) => [c.content.trim(), c.metadata.pageNumber, c.metadata.sectionTitle])
    ).toEqual([
      ["Alpha text on page one.", 1, "Intro"],
      ["Beta text on page two.", 2, "Intro"],
      ["Gamma text on page two.", 2, "Methods"],
      ["Delta text on page three.", 3, "Methods"],
    ]);
  });

  it("keeps page labels and page separators out of chunk text", async () => {
    const chunks = await chunk(OCR_DOC);
    for (const c of chunks) {
      expect(c.content).not.toMatch(/\*\*Page \d+\*\*/);
      expect(c.content).not.toMatch(/^-{3,}\s*$/m);
    }
  });

  it("keeps a horizontal rule that sits inside a page", async () => {
    const chunks = await chunk("**Page 1**\n\nAbove the rule.\n\n---\n\nBelow the rule.");
    expect(chunks.map((c) => c.content)).toEqual([
      expect.stringMatching(/Above the rule\.\n\n---\n\nBelow the rule\./),
    ]);
  });

  it("stores no page for unpaginated text", async () => {
    const chunks = await chunk("# Notes\n\nPlain text without pages.");
    expect(chunks.map((c) => c.metadata.pageNumber)).toEqual([null]);
  });

  it("still counts form-feed page breaks", async () => {
    const chunks = await chunk("First page text.\n\x0C\nSecond page text.");
    expect(chunks.map((c) => [c.content.trim(), c.metadata.pageNumber])).toEqual([
      ["First page text.", 1],
      ["Second page text.", 2],
    ]);
  });

  it("reads page labels in CRLF text", async () => {
    const chunks = await chunk(
      "**Page 1**\r\n\r\nAlpha.\r\n\r\n---\r\n\r\n**Page 2**\r\n\r\nBeta."
    );
    expect(chunks.map((c) => [c.content.trim(), c.metadata.pageNumber])).toEqual([
      ["Alpha.", 1],
      ["Beta.", 2],
    ]);
  });

  it("drops a page separator that is followed by whitespace-only lines", async () => {
    const chunks = await chunk("**Page 1**\n\nAlpha.\n\n---  \n   \n**Page 2**\n\nBeta.");
    expect(chunks.map((c) => [c.content.trim(), c.metadata.pageNumber])).toEqual([
      ["Alpha.", 1],
      ["Beta.", 2],
    ]);
  });

  it("keeps pagination per chunk() call when calls overlap on one instance", async () => {
    const c = new StructuralChunker();
    const [ocr, plain] = await Promise.all([
      c.chunk(OCR_DOC, 1000, 0),
      c.chunk("Plain text.", 1000, 0),
    ]);
    expect(ocr.map((x) => x.metadata.pageNumber)).toEqual([1, 2, 2, 3]);
    expect(plain.map((x) => x.metadata.pageNumber)).toEqual([null]);
  });
});
