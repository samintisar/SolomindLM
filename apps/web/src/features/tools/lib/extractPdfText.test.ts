import { describe, expect, it } from "vitest";
import { pageItemsToText } from "./extractPdfText";

describe("pageItemsToText", () => {
  it("joins runs with spaces and breaks lines on hasEOL", () => {
    expect(
      pageItemsToText([
        { str: "Cell", hasEOL: false },
        { str: "biology", hasEOL: true },
        { str: "Mitochondria make ATP.", hasEOL: true },
      ])
    ).toBe("Cell biology\nMitochondria make ATP.");
  });

  it("skips marked-content items without str and collapses blank lines", () => {
    expect(
      pageItemsToText([
        { str: "A", hasEOL: true },
        {},
        { str: "", hasEOL: true },
        { str: "", hasEOL: true },
        { str: "B" },
      ])
    ).toBe("A\n\nB");
  });
});
