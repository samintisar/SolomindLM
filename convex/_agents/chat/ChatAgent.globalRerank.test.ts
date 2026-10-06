import { afterEach, describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests never call them.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import { ChatAgent } from "./ChatAgent";
import { GLOBAL_RERANK_TIMEOUT_MS } from "./chatConfig";

const chunk = (chunkIndex: number) =>
  ({ sourceId: "doc-1", chunkIndex, content: `chunk ${chunkIndex}` }) as unknown as ReferenceChunk;

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatAgent global rerank time budget", () => {
  it("gives up on a rerank that never answers once the budget is spent", async () => {
    vi.useFakeTimers();
    const agent = new ChatAgent({ globalRerankFn: () => new Promise(() => {}) });
    const logger = createServiceLogger("ChatAgent", "test");

    const pending = agent["applyGlobalRerank"]([chunk(0), chunk(1)], undefined, "q", logger);
    const outcome = expect(pending).rejects.toThrow(/global_rerank timed out/);
    await vi.advanceTimersByTimeAsync(GLOBAL_RERANK_TIMEOUT_MS);
    await outcome;
  });

  it("keeps the reranked order when the rerank answers in time", async () => {
    const agent = new ChatAgent({
      globalRerankFn: async (_q, docs) =>
        [...docs].reverse().map((d, i) => ({ ...d, score: 1 - i / 10 })),
    });
    const logger = createServiceLogger("ChatAgent", "test");

    const result = await agent["applyGlobalRerank"]([chunk(0), chunk(1)], undefined, "q", logger);
    expect(result.chunks.map((c) => c.chunkIndex)).toEqual([1, 0]);
    expect(result.rerankedKeys).toEqual(new Set(["doc-1:0", "doc-1:1"]));
  });
});
