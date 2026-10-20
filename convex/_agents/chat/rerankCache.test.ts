import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../_services/cache/cachedAgent", () => ({
  createCachedAction: () => ({ fetch: fetchMock }),
}));

import { internal } from "../../_generated/api";
import { RERANK_TIMEOUT_MS } from "../../_lib/rerankConfig";
import { cachedRerank } from "./rerankCache";

const docs = [
  { id: "a", content: "alpha" },
  { id: "b", content: "beta" },
];

describe("cachedRerank", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects instead of hanging when the rerank provider never answers", async () => {
    // A provider outage that stalls the call (the previous provider answered 503 with
    // `Retry-After: 86400`, which its SDK waited out) must not stall the chat reply.
    fetchMock.mockReturnValue(new Promise(() => {}));

    const settled = cachedRerank({}, "query", docs).then(
      () => "resolved",
      (e: Error) => e.message
    );
    // The cache key is hashed (real async crypto) before the call, so wait for it to start.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(RERANK_TIMEOUT_MS * 2);

    expect(await settled).toMatch(/timed out/);
  });

  it("maps provider results back to the original document ids", async () => {
    fetchMock.mockResolvedValue([
      { index: 1, relevance_score: 0.9 },
      { index: 0, relevance_score: 0.1 },
    ]);

    const result = await cachedRerank({}, "query", docs);

    // sortedDocs orders by content, so index 1 = "beta"
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result[0].score).toBe(0.9);
  });

  it("bypassCache calls the uncached rerank action and never touches the cache", async () => {
    const runAction = vi.fn(async () => [
      { index: 1, relevance_score: 0.9 },
      { index: 0, relevance_score: 0.1 },
    ]);

    const result = await cachedRerank({ runAction }, "Query", docs, 2, { bypassCache: true });

    expect(fetchMock).not.toHaveBeenCalled();
    // Same normalisation, content sort and topN as the cached path.
    expect(runAction).toHaveBeenCalledWith(internal._agents.chat.rerankCache.rerankInternal, {
      query: "query",
      documents: ["alpha", "beta"],
      topN: 2,
    });
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result[0].score).toBe(0.9);
  });

  it("bypassCache keeps the timeout: a stalled uncached action rejects", async () => {
    const runAction = vi.fn(() => new Promise(() => {}));

    const settled = cachedRerank({ runAction }, "query", docs, 2, { bypassCache: true }).then(
      () => "resolved",
      (e: Error) => e.message
    );
    await vi.advanceTimersByTimeAsync(RERANK_TIMEOUT_MS * 2);

    expect(runAction).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await settled).toMatch(/timed out/);
  });
});
