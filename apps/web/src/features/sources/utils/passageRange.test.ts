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

  it("starts at the occurrence whose ending is also on the page when the opening repeats", () => {
    const text =
      "Journal of Machine Learning Research 23. Intro text here. Journal of Machine Learning Research 23 shows that retrieval improves factual answers a lot.";
    const quote =
      "Journal of Machine Learning Research 23 shows that retrieval improves factual answers a lot.";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: text.lastIndexOf("Journal") },
      end: { node: "a", offset: text.lastIndexOf("lot") + "lot".length },
    });
  });

  it("ignores maths in the quote, which the page renders separately", () => {
    const text = "Let  be given so  then the function f grows quickly here";
    const quote = "Let $a_1$ be given so $c^3 = d$ then the function f grows quickly here";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: 0 },
      end: { node: "a", offset: text.length },
    });
    const display =
      "Let $$a_1 + b$$ be given so \\(c\\) then \\[d\\] the function f grows quickly here";
    expect(findPassageRange([{ node: "a", text }], display)).toEqual({
      start: { node: "a", offset: 0 },
      end: { node: "a", offset: text.length },
    });
  });

  it("drops images and decodes entities in the quote", () => {
    const text = "Smith & Jones found that rates rose sharply in 2020 overall";
    const quote =
      "![chart](https://example.org/c.png) Smith &amp; Jones found that rates rose sharply in 2020 overall";
    expect(findPassageRange([{ node: "a", text }], quote)).toEqual({
      start: { node: "a", offset: 0 },
      end: { node: "a", offset: text.length },
    });
  });
});
