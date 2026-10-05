import { describe, expect, it } from "vitest";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import { LIST_QUERY_MAX_SELECTED_CHUNKS } from "./chatConfig.js";
import {
  chunkDedupKey,
  chunkRankingScore,
  mergeChunkScores,
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

it("keeps a list-query cap large enough for long enumerations", () => {
  expect(LIST_QUERY_MAX_SELECTED_CHUNKS).toBeGreaterThanOrEqual(24);
});

describe("selectChunksByTokenBudget across several documents (#347)", () => {
  // Documents are chunked at up to ~1000 tokens, so an 8000-token budget holds ~8 passages.
  const PASSAGE = "word ".repeat(800);
  const passage = (documentId: string, chunkIndex: number, similarity: number) =>
    chunk({ sourceId: `src-${documentId}`, documentId, chunkIndex, content: PASSAGE, similarity });
  const keysOf = (chunks: ReferenceChunk[]) => new Set(chunks.map(chunkDedupKey));
  const docs = (chunks: ReferenceChunk[]) => new Set(chunks.map((c) => c.documentId));
  const dominant = () => Array.from({ length: 25 }, (_, i) => passage("A", i, 0.95 - i * 0.01));

  it("gives every relevant source a share and widens the budget per extra source", () => {
    const others = [passage("B", 0, 0.6), passage("B", 1, 0.55), passage("C", 0, 0.5)];
    const pool = [...dominant(), ...others];

    const selected = selectChunksByTokenBudget(pool, undefined, 0.35, {
      maxContextTokens: 8000,
      rerankedKeys: keysOf(pool),
    });

    expect(docs(selected)).toEqual(new Set(["A", "B", "C"]));
    expect(selected.filter((c) => c.documentId === "B")).toHaveLength(2);
    // 3 relevant sources: 8000 + 2 × 4000 tokens, about 16 passages.
    expect(selected).toHaveLength(16);
    const scores = selected.map((c) => c.similarity ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("caps the extra budget however many sources are relevant", () => {
    const pool = [...dominant(), ...["B", "C", "D", "E", "F", "G"].map((d) => passage(d, 0, 0.5))];

    const selected = selectChunksByTokenBudget(pool, undefined, 0.35, {
      maxContextTokens: 8000,
      rerankedKeys: keysOf(pool),
    });

    expect(selected).toHaveLength(20);
  });

  it("ignores selected sources whose passages the rerank never scored", () => {
    // 10 sources selected, the question is about A: the others surface one passage each that
    // missed the rerank and still carries its ~0.5 vector similarity.
    const a = dominant();
    const strays = ["B", "C", "D", "E", "F", "G", "H", "I", "J"].map((d) => passage(d, 0, 0.5));

    const selected = selectChunksByTokenBudget([...a, ...strays], undefined, 0.35, {
      maxContextTokens: 8000,
      rerankedKeys: keysOf(a),
    });

    expect(docs(selected)).toEqual(new Set(["A"]));
    expect(selected).toHaveLength(8);
  });

  it("does not count a source whose reranked passages fall below the relevance floor", () => {
    const pool = [...dominant(), passage("B", 0, 0.2)];

    const selected = selectChunksByTokenBudget(pool, undefined, 0.35, {
      maxContextTokens: 8000,
      rerankedKeys: keysOf(pool),
    });

    expect(docs(selected)).toEqual(new Set(["A"]));
  });

  it("falls back to plain score order when there are no rerank scores", () => {
    const pool = [...dominant(), passage("B", 0, 0.6), passage("C", 0, 0.5)];

    const selected = selectChunksByTokenBudget(pool, undefined, 0.35, { maxContextTokens: 8000 });

    expect(docs(selected)).toEqual(new Set(["A"]));
    expect(selected).toHaveLength(8);
  });
});

describe("selectChunksByTokenBudgetWithReservation without external sources", () => {
  it("gives the whole budget to notebook passages", () => {
    const passages = Array.from({ length: 30 }, (_, i) =>
      chunk({
        sourceId: "n1",
        chunkIndex: i,
        content: "retrieved passage text ".repeat(52),
        similarity: 0.9,
      })
    );

    const selected = selectChunksByTokenBudgetWithReservation(passages, [], undefined, 0.35, {
      maxContextTokens: 8000,
    });

    expect(selected.length).toBeGreaterThan(20);
  });
});
