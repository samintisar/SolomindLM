import { describe, expect, it } from "vitest";
import { findPassageRange } from "./passageRange";

describe("findPassageRange", () => {
  it("finds an exact passage inside one text run", () => {
    const text = "Intro. The model retrieves passages before it answers.";
    expect(
      findPassageRange([{ node: "a", text }], "The model retrieves passages before it answers.")
    ).toEqual({
      start: { node: "a", offset: text.indexOf("The") },
      end: { node: "a", offset: text.indexOf("answers") + "answers".length },
    });
  });

  it("ignores markdown symbols, link targets, case and spacing, across text runs", () => {
    const segments = [
      { node: "p1", text: "Before. The " },
      { node: "strong", text: "model" },
      { node: "p2", text: " retrieves passages\nbefore it answers." },
    ];
    const quote = "the **Model** retrieves   passages before it [answers](https://example.org).";
    expect(findPassageRange(segments, quote)).toEqual({
      start: { node: "p1", offset: "Before. ".length },
      end: { node: "p2", offset: " retrieves passages\nbefore it answers".length },
    });
  });

  it("highlights the quote's length from the start when its ending isn't on the page", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";
    const quote = "alpha beta gamma delta epsilon zeta missing words here now ok fine";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: 0 },
      end: { node: "a", offset: text.length },
    });
  });

  it("anchors on a later window when the opening words render differently", () => {
    const text = "Proof sketch. alpha beta gamma delta epsilon zeta follows.";
    const quote = "λ-term zzz yyy xxx www alpha beta gamma delta epsilon zeta";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: text.indexOf("alpha") },
      end: { node: "a", offset: text.indexOf("zeta") + "zeta".length },
    });
  });

  it("returns null when the passage isn't there", () => {
    expect(
      findPassageRange([{ node: "a", text: "Nothing related." }], "Totally different words")
    ).toBeNull();
    expect(findPassageRange([], "anything")).toBeNull();
    expect(findPassageRange([{ node: "a", text: "Some text" }], "  ** ")).toBeNull();
  });
});
