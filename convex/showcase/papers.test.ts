import { describe, expect, test } from "vitest";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import { paperFileName, paperKey, pickDiscoveredPapers, type ResolvedPaper } from "./papers";

const paper = (title: string, doi?: string, license?: string): ResolvedPaper => ({
  title,
  paperRecord: { abstract: "…", authors: ["A. Author"], doi, isOa: true, license },
});

describe("paperKey", () => {
  test("uses the DOI, normalised, else the title", () => {
    expect(paperKey(paper("X", "https://doi.org/10.1371/Journal.pone.1"))).toBe(
      "doi:10.1371/journal.pone.1"
    );
    expect(paperKey(paper("  A Title "))).toBe("title:a title");
  });

  test("keys a DOI-less paper by the title its source is stored under", () => {
    const long = `A ${"very ".repeat(60)}long   title`;
    const stored = paperFileName(long);
    expect(stored.length).toBeLessThanOrEqual(TEXT_TITLE_MAX_LENGTH);
    expect(paperKey(paper(stored))).toBe(paperKey(paper(long)));
    expect(paperKey(paper("A  spaced\nTitle"))).toBe("title:a spaced title");
  });
});

describe("pickDiscoveredPapers", () => {
  test("prefers openly licensed papers, keeps discovery order otherwise, skips ones already added", () => {
    const picked = pickDiscoveredPapers(
      [
        paper("Closed 1", "10.1/c1"),
        paper("Open 1", "10.1/o1", "https://creativecommons.org/licenses/by/4.0/"),
        paper("Already added", "10.1/old", "cc-by"),
        paper("NC", "10.1/nc", "cc-by-nc"),
        paper("Open 2", "10.1/o2", "cc-by"),
        paper("Closed 1 again", "10.1/C1"),
      ],
      new Set(["doi:10.1/old"]),
      3
    );
    expect(picked.map((p) => p.title)).toEqual(["Open 1", "Open 2", "Closed 1"]);
  });

  test("returns nothing when nothing is needed", () => {
    expect(pickDiscoveredPapers([paper("A", "10.1/a")], new Set(), 0)).toEqual([]);
  });
});
