import { describe, expect, it, vi } from "vitest";
import { VectorSearchHandler } from "./vector_search";

type Row = { _id: string; chunkIndex: number; content: string; similarity?: number };

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `c${i}`,
    chunkIndex: i,
    content: `chunk ${i}`,
    similarity: 0.5,
  }));

/** `rerankResults` is protected; tests drive it directly. */
function rerank(handler: VectorSearchHandler, results: Row[]) {
  return (
    handler as unknown as {
      rerankResults: (q: string, r: Row[], quiet?: boolean) => Promise<Row[]>;
    }
  ).rerankResults("query", results, true);
}

describe("VectorSearchHandler.rerankResults", () => {
  it("returns the results untouched when no rerank function is configured", async () => {
    const handler = new VectorSearchHandler();
    const input = rows(10);

    expect(await rerank(handler, input)).toBe(input);
  });

  it("skips the rerank call when there are no more results than the threshold", async () => {
    const rerankFn = vi.fn();
    const handler = new VectorSearchHandler({ rerankThreshold: 5 }, undefined, undefined, rerankFn);
    const input = rows(5);

    expect(await rerank(handler, input)).toBe(input);
    expect(rerankFn).not.toHaveBeenCalled();
  });

  it("orders by the reranker, adopts its scores, and appends unranked results in original order", async () => {
    const rerankFn = vi.fn(async () => [
      { id: "c3", content: "chunk 3", score: 0.9 },
      { id: "c1", content: "chunk 1", score: 0.6 },
    ]);
    const handler = new VectorSearchHandler({ rerankThreshold: 2 }, undefined, undefined, rerankFn);

    const out = await rerank(handler, rows(5));

    expect(out.map((r) => r._id)).toEqual(["c3", "c1", "c0", "c2", "c4"]);
    expect(out[0].similarity).toBe(0.9);
    expect(out[1].similarity).toBe(0.6);
    // Not reranked: keeps its original score.
    expect(out[2].similarity).toBe(0.5);
  });

  it("falls back to the original results when the rerank function fails", async () => {
    const rerankFn = vi.fn(async () => {
      throw new Error("voyage HTTP 503");
    });
    const handler = new VectorSearchHandler({ rerankThreshold: 2 }, undefined, undefined, rerankFn);
    const input = rows(5);

    expect(await rerank(handler, input)).toBe(input);
    expect(rerankFn).toHaveBeenCalledTimes(1);
  });
});
