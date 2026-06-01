import { describe, expect, it } from "vitest";
import { replaceCitationMarkersOutsideMath } from "./citationMarkers";

describe("replaceCitationMarkersOutsideMath", () => {
  it("replaces [1] in plain text", () => {
    expect(replaceCitationMarkersOutsideMath("See [1] here")).toBe("See `CITE:1` here");
  });

  it("replaces multiple citations in text", () => {
    expect(replaceCitationMarkersOutsideMath("[1] [2] [3]")).toBe("`CITE:1` `CITE:2` `CITE:3`");
  });

  it("does not replace [1] inside $...$", () => {
    const result = replaceCitationMarkersOutsideMath("text $[1, 0]$ more [2]");
    expect(result).toContain("$[1, 0]$");
    expect(result).toContain("`CITE:2`");
    expect(result).not.toContain("`CITE:1`");
  });

  it("does not replace [1] inside $$...$$", () => {
    const result = replaceCitationMarkersOutsideMath("before $$[1, 0; 0, 1]$$ after [2]");
    expect(result).toContain("$$[1, 0; 0, 1]$$");
    expect(result).toContain("`CITE:2`");
  });

  it("replaces escaped \\[1\\] citations in text", () => {
    expect(replaceCitationMarkersOutsideMath("See \\[1\\] here")).toBe("See `CITE:1` here");
  });

  it("handles mixed text and math with citations", () => {
    const input = "Result [1] shows $f(x)$ and [2] confirms $$M = [1, 0]$$ while [3] agrees";
    const result = replaceCitationMarkersOutsideMath(input);
    expect(result).toContain("`CITE:1`");
    expect(result).toContain("`CITE:2`");
    expect(result).toContain("`CITE:3`");
    expect(result).toContain("$f(x)$");
    expect(result).toContain("$$M = [1, 0]$$");
  });

  it("handles unclosed $ delimiter", () => {
    // Unclosed $ — rest treated as text, so citations after it get replaced
    const result = replaceCitationMarkersOutsideMath("text $unclosed [1] rest");
    expect(result).toContain("`CITE:1`");
  });

  it("prefers $$ over $ to avoid splitting display math", () => {
    const input = "$$[1, 0]$$ text [2]";
    const result = replaceCitationMarkersOutsideMath(input);
    expect(result).toContain("$$[1, 0]$$");
    expect(result).toContain("`CITE:2`");
  });

  it("returns unchanged text with no citations", () => {
    expect(replaceCitationMarkersOutsideMath("plain text")).toBe("plain text");
  });

  it("handles math with angle brackets (not corrupted)", () => {
    const input = "$0<\\theta<1$ and [1]";
    const result = replaceCitationMarkersOutsideMath(input);
    expect(result).toContain("$0<\\theta<1$");
    expect(result).toContain("`CITE:1`");
  });
});
