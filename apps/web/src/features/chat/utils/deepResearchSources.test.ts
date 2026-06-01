import { describe, expect, test } from "vitest";
import {
  buildDeepResearchDisplaySources,
  parseCitationNumbers,
  sourceKeyFromEvidence,
} from "./deepResearchSources";

describe("parseCitationNumbers", () => {
  test("extracts unique citation ids", () => {
    expect([...parseCitationNumbers("Claim [1] and [2], repeat [1].")].sort()).toEqual([1, 2]);
  });
});

describe("sourceKeyFromEvidence", () => {
  test("prefers documentId over url", () => {
    expect(
      sourceKeyFromEvidence({
        subQuestionId: "sq1",
        sourceType: "notebook",
        sourceTitle: "T",
        sourceUrl: "https://example.com",
        content: "c",
        metadata: { documentId: "doc123" },
      })
    ).toBe("doc:doc123");
  });
});

describe("buildDeepResearchDisplaySources", () => {
  const evidence = [
    {
      subQuestionId: "sq1",
      sourceType: "web",
      sourceTitle: "Paper A",
      sourceUrl: "https://a.example",
      content: "Finding A",
      relevanceScore: 0.9,
    },
    {
      subQuestionId: "sq1",
      sourceType: "web",
      sourceTitle: "Paper A",
      sourceUrl: "https://a.example",
      content: "Duplicate chunk for A",
      relevanceScore: 0.8,
    },
    {
      subQuestionId: "sq2",
      sourceType: "academic",
      sourceTitle: "Paper B",
      sourceUrl: "https://b.example",
      content: "Finding B",
      relevanceScore: 0.7,
    },
  ];

  test("dedupes sources and marks used vs searched only", () => {
    const sources = buildDeepResearchDisplaySources(evidence, "Summary cites [1] only.", [
      { id: "sq1" },
      { id: "sq2" },
    ]);
    expect(sources).toHaveLength(2);
    const used = sources.find((s) => s.sourceTitle === "Paper A");
    const searched = sources.find((s) => s.sourceTitle === "Paper B");
    expect(used?.status).toBe("usedInAnswer");
    expect(searched?.status).toBe("searchedOnly");
    expect(used?.citationIndices).toContain(1);
  });

  test("marks second unique source used when its citation index is cited", () => {
    const sources = buildDeepResearchDisplaySources(evidence, "See [3] for detail.");
    const paperB = sources.find((s) => s.sourceTitle === "Paper B");
    expect(paperB?.status).toBe("usedInAnswer");
    expect(paperB?.citationIndices).toContain(3);
  });
});
