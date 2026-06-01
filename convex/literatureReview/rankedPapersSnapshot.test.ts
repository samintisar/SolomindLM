import { describe, expect, test } from "vitest";
import {
  compactPaperForSnapshot,
  compactPapersForSnapshot,
  compactPapersForWorkflow,
  RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS,
  RANKED_PAPERS_SNAPSHOT_MAX_COUNT,
  truncateAbstractForSnapshot,
  truncateAbstractForWorkflow,
  WORKFLOW_PAPER_ABSTRACT_MAX_CHARS,
} from "./rankedPapersSnapshot";

const basePaper = {
  title: "Example Paper",
  authors: ["Smith, J.", "Jones, A."],
  year: 2024,
  abstract: "Short abstract.",
  url: "https://example.com/paper",
  source: "arxiv" as const,
  score: 0.9,
};

describe("truncateAbstractForSnapshot", () => {
  test("leaves short abstracts unchanged", () => {
    expect(truncateAbstractForSnapshot("Hello world")).toBe("Hello world");
  });

  test("truncates long abstracts with ellipsis", () => {
    const long = "a".repeat(RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS + 50);
    const result = truncateAbstractForSnapshot(long);
    expect(result.length).toBeLessThanOrEqual(RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("compactPapersForSnapshot", () => {
  test("caps paper count", () => {
    const papers = Array.from({ length: RANKED_PAPERS_SNAPSHOT_MAX_COUNT + 50 }, (_, i) => ({
      ...basePaper,
      title: `Paper ${i}`,
      score: 1 - i * 0.001,
    }));
    const compacted = compactPapersForSnapshot(papers);
    expect(compacted).toHaveLength(RANKED_PAPERS_SNAPSHOT_MAX_COUNT);
    expect(compacted[0]?.title).toBe("Paper 0");
    expect(compacted.at(-1)?.title).toBe(`Paper ${RANKED_PAPERS_SNAPSHOT_MAX_COUNT - 1}`);
  });

  test("compacts abstracts on each paper", () => {
    const longAbstract = "x".repeat(RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS + 100);
    const compacted = compactPapersForSnapshot([{ ...basePaper, abstract: longAbstract }]);
    expect(compacted[0]?.abstract.length).toBeLessThanOrEqual(
      RANKED_PAPER_SNAPSHOT_ABSTRACT_MAX_CHARS
    );
  });
});

describe("truncateAbstractForWorkflow", () => {
  test("truncates to workflow limit", () => {
    const long = "b".repeat(WORKFLOW_PAPER_ABSTRACT_MAX_CHARS + 20);
    const result = truncateAbstractForWorkflow(long);
    expect(result.length).toBeLessThanOrEqual(WORKFLOW_PAPER_ABSTRACT_MAX_CHARS);
  });
});

describe("compactPapersForWorkflow", () => {
  test("does not cap paper count", () => {
    const papers = Array.from({ length: 150 }, (_, i) => ({
      ...basePaper,
      title: `Paper ${i}`,
    }));
    expect(compactPapersForWorkflow(papers)).toHaveLength(150);
  });
});

describe("compactPaperForSnapshot", () => {
  test("limits author count and length", () => {
    const authors = Array.from({ length: 40 }, (_, i) => "A".repeat(200) + i);
    const compacted = compactPaperForSnapshot({ ...basePaper, authors });
    expect(compacted.authors.length).toBeLessThanOrEqual(25);
    expect(compacted.authors[0]?.length).toBeLessThanOrEqual(120);
  });
});
