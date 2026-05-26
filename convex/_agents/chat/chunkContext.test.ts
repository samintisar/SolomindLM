import { describe, it, expect } from "vitest";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import {
  chunkDedupKey,
  mergeChunkScores,
  chunkRankingScore,
  selectChunksByTokenBudget,
  selectChunksByTokenBudgetWithReservation,
} from "./chunkContext";

function chunk(
  partial: Partial<ReferenceChunk> & Pick<ReferenceChunk, "sourceId" | "chunkIndex" | "content">
): ReferenceChunk {
  return {
    id: `${partial.sourceId}-${partial.chunkIndex}`,
    documentId: "doc1",
    sourceTitle: "Source",
    ...partial,
  };
}

describe("chunkDedupKey", () => {
  it("combines sourceId and chunkIndex", () => {
    const c = chunk({ sourceId: "s1", chunkIndex: 3, content: "x" });
    expect(chunkDedupKey(c)).toBe("s1:3");
  });
});

describe("mergeChunkScores", () => {
  it("keeps the maximum similarity and rrf scores", () => {
    const a = chunk({ sourceId: "s", chunkIndex: 0, content: "a", similarity: 0.4, rrfScore: 0.1 });
    const b = chunk({ sourceId: "s", chunkIndex: 0, content: "a", similarity: 0.7, rrfScore: 0.3 });
    const merged = mergeChunkScores(a, b);
    expect(merged.similarity).toBe(0.7);
    expect(merged.rrfScore).toBe(0.3);
  });

  it("preserves sourceUrl from either side", () => {
    const a = chunk({ sourceId: "s", chunkIndex: 0, content: "a" });
    const b = chunk({ sourceId: "s", chunkIndex: 0, content: "a", sourceUrl: "https://x.test" });
    expect(mergeChunkScores(a, b).sourceUrl).toBe("https://x.test");
  });
});

describe("chunkRankingScore", () => {
  it("prefers similarity over rrfScore", () => {
    const c = chunk({ sourceId: "s", chunkIndex: 0, content: "a", similarity: 0.9, rrfScore: 0.1 });
    expect(chunkRankingScore(c)).toBe(0.9);
  });

  it("falls back to rrfScore then zero", () => {
    const rrfOnly = chunk({ sourceId: "s", chunkIndex: 0, content: "a", rrfScore: 0.5 });
    const none = chunk({ sourceId: "s", chunkIndex: 0, content: "a" });
    expect(chunkRankingScore(rrfOnly)).toBe(0.5);
    expect(chunkRankingScore(none)).toBe(0);
  });
});

describe("selectChunksByTokenBudget", () => {
  it("filters chunks below relevance threshold", () => {
    const chunks = [
      chunk({ sourceId: "a", chunkIndex: 0, content: "low", similarity: 0.01 }),
      chunk({ sourceId: "b", chunkIndex: 0, content: "high", similarity: 0.9 }),
    ];
    const selected = selectChunksByTokenBudget(chunks, undefined, 0.5);
    expect(selected).toHaveLength(1);
    expect(selected[0].sourceId).toBe("b");
  });

  it("falls back to top chunks when all are below threshold", () => {
    const chunks = [
      chunk({ sourceId: "a", chunkIndex: 0, content: "a", similarity: 0.02 }),
      chunk({ sourceId: "b", chunkIndex: 0, content: "b", similarity: 0.05 }),
    ];
    const selected = selectChunksByTokenBudget(chunks, undefined, 0.9);
    expect(selected.length).toBeGreaterThan(0);
  });

  it("returns empty when no chunks provided", () => {
    expect(selectChunksByTokenBudget([])).toEqual([]);
  });
});

describe("selectChunksByTokenBudgetWithReservation", () => {
  it("includes top external chunks plus notebook selections", () => {
    const notebookChunks = [
      chunk({
        sourceId: "n1",
        chunkIndex: 0,
        content: "notebook hit ".repeat(20),
        similarity: 0.95,
      }),
    ];
    const externalChunks = [
      chunk({ sourceId: "e1", chunkIndex: 0, content: "external", similarity: 0.8 }),
      chunk({ sourceId: "e2", chunkIndex: 0, content: "external2", similarity: 0.7 }),
    ];

    const selected = selectChunksByTokenBudgetWithReservation(
      notebookChunks,
      externalChunks,
      undefined,
      0.1
    );

    expect(selected.some((c) => c.sourceId.startsWith("e"))).toBe(true);
    expect(selected.some((c) => c.sourceId === "n1")).toBe(true);
  });
});
