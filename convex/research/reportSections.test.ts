import { describe, expect, it, test } from "vitest";
import {
  applyNumericCitations,
  buildOrderedEvidence,
  isReferencesHeading,
  parseMarkdownSections,
  shortenColumnName,
} from "./reportSections";

describe("parseMarkdownSections", () => {
  test("splits ## headings into sections", () => {
    const md = `## Abstract

Summary here.

## Introduction

Background.

## Conclusion

Final thoughts.`;

    const sections = parseMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual(["Abstract", "Introduction", "Conclusion"]);
    expect(sections[0].content).toContain("Summary here");
    expect(sections[2].content).toContain("Final thoughts");
  });

  test("strips References section from parsed output", () => {
    const md = `## Results

Findings.

## References

Smith (2024).`;

    const sections = parseMarkdownSections(md);
    expect(sections.map((s) => s.heading)).toEqual(["Results"]);
  });

  test("returns empty array when no headings", () => {
    expect(parseMarkdownSections("plain text only")).toEqual([]);
  });
});

describe("isReferencesHeading", () => {
  test("matches references case-insensitively", () => {
    expect(isReferencesHeading("References")).toBe(true);
    expect(isReferencesHeading(" references ")).toBe(true);
    expect(isReferencesHeading("Bibliography")).toBe(false);
  });
});

describe("buildOrderedEvidence", () => {
  test("orders evidence by sub-question plan order", () => {
    const evidence = [
      { subQuestionId: "sq2", sourceTitle: "B" },
      { subQuestionId: "sq1", sourceTitle: "A" },
      { subQuestionId: "sq2", sourceTitle: "C" },
    ];
    const ordered = buildOrderedEvidence(evidence, [
      { id: "sq1", question: "Q1" },
      { id: "sq2", question: "Q2" },
    ]);
    expect(ordered.map((e) => e.sourceTitle)).toEqual(["A", "B", "C"]);
  });
});

describe("applyNumericCitations", () => {
  test("replaces [N] with formatted inline citations", () => {
    const evidence = [
      { subQuestionId: "sq1", sourceTitle: "Paper A", sourceUrl: "https://a" },
      { subQuestionId: "sq1", sourceTitle: "Paper B", sourceUrl: "https://b" },
    ];
    const text = "Finding one [1] and two [2].";
    const result = applyNumericCitations(text, evidence, (key) => `(${key})`);
    expect(result).toBe("Finding one (https://a) and two (https://b).");
  });

  test("leaves unknown citation numbers unchanged", () => {
    const result = applyNumericCitations("See [99].", [], () => "cite");
    expect(result).toBe("See [99].");
  });
});

describe("shortenColumnName", () => {
  it("keeps a short sub-question whole", () => {
    expect(shortenColumnName("What spacing gaps work best?")).toBe("What spacing gaps work best?");
  });

  // #558: headers were cut mid-word at 60 characters ("…intervals co").
  it("shortens a long sub-question at a word boundary with an ellipsis", () => {
    const question =
      "How do optimal spacing intervals compare between laboratory studies and real classroom settings over a semester?";
    const name = shortenColumnName(question);
    expect(name.length).toBeLessThanOrEqual(81);
    expect(name.endsWith("…")).toBe(true);
    expect(question.startsWith(name.slice(0, -1))).toBe(true);
    expect(question[name.length - 1]).toBe(" ");
  });
});
