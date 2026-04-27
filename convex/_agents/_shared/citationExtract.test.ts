import { describe, it, expect } from "vitest";
import {
  INLINE_CITATION_MARKER_RE,
  matchAllInlineCitations,
  extractUniqueSortedCitationIndices,
  stripInlineCitationMarkers,
  replaceCitationMarkersWithPlaceholders,
} from "./citationExtract";

describe("INLINE_CITATION_MARKER_RE", () => {
  it("matches [1] style citations", () => {
    expect("[1]".match(INLINE_CITATION_MARKER_RE)).not.toBeNull();
    expect("[42]".match(INLINE_CITATION_MARKER_RE)).not.toBeNull();
  });

  it("matches escaped \\[1\\] style citations", () => {
    expect("\\[1\\]".match(INLINE_CITATION_MARKER_RE)).not.toBeNull();
  });

  it("does not match empty brackets", () => {
    expect("[]".match(INLINE_CITATION_MARKER_RE)).toBeNull();
  });

  it("does not match non-numeric brackets", () => {
    expect("[abc]".match(INLINE_CITATION_MARKER_RE)).toBeNull();
  });
});

describe("matchAllInlineCitations", () => {
  it("finds single citation [1]", () => {
    const matches = matchAllInlineCitations("Some text [1] here");
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe("1");
  });

  it("finds multiple citations", () => {
    const matches = matchAllInlineCitations("See [1] and [2] and [10]");
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m[1])).toEqual(["1", "2", "10"]);
  });

  it("finds escaped citations \\[1\\]", () => {
    const matches = matchAllInlineCitations("Result \\[3\\] shows");
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe("3");
  });

  it("returns empty array when no citations", () => {
    const matches = matchAllInlineCitations("No citations here");
    expect(matches).toHaveLength(0);
  });

  it("handles mixed escaped and unescaped", () => {
    const matches = matchAllInlineCitations("[1] \\[2\\] [3]");
    expect(matches).toHaveLength(3);
  });
});

describe("extractUniqueSortedCitationIndices", () => {
  it("returns unique sorted indices", () => {
    const result = extractUniqueSortedCitationIndices("[3] [1] [2] [1]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("returns single index", () => {
    expect(extractUniqueSortedCitationIndices("[5]")).toEqual([5]);
  });

  it("returns empty array for no citations", () => {
    expect(extractUniqueSortedCitationIndices("no citations")).toEqual([]);
  });

  it("handles escaped citations", () => {
    const result = extractUniqueSortedCitationIndices("\\[2\\] \\[1\\]");
    expect(result).toEqual([1, 2]);
  });
});

describe("stripInlineCitationMarkers", () => {
  it("removes [1] from text (leaves surrounding spaces)", () => {
    expect(stripInlineCitationMarkers("See [1] for details")).toBe("See  for details");
  });

  it("removes multiple citations (trims result)", () => {
    expect(stripInlineCitationMarkers("[1] [2] [3] results")).toBe("results");
  });

  it("removes escaped citations", () => {
    expect(stripInlineCitationMarkers("Text \\[5\\] end")).toBe("Text  end");
  });

  it("returns trimmed result", () => {
    expect(stripInlineCitationMarkers("[1] ")).toBe("");
  });

  it("leaves text without citations unchanged", () => {
    expect(stripInlineCitationMarkers("Hello world")).toBe("Hello world");
  });
});

describe("replaceCitationMarkersWithPlaceholders", () => {
  it("replaces [1] with CITE placeholder", () => {
    expect(replaceCitationMarkersWithPlaceholders("See [1] here")).toBe("See `CITE:1` here");
  });

  it("replaces escaped \\[2\\] with CITE placeholder", () => {
    expect(replaceCitationMarkersWithPlaceholders("Result \\[2\\] shows")).toBe(
      "Result `CITE:2` shows"
    );
  });

  it("replaces multiple citations", () => {
    expect(replaceCitationMarkersWithPlaceholders("[1] [2] [3]")).toBe(
      "`CITE:1` `CITE:2` `CITE:3`"
    );
  });

  it("leaves text without citations unchanged", () => {
    expect(replaceCitationMarkersWithPlaceholders("No citations")).toBe("No citations");
  });
});
