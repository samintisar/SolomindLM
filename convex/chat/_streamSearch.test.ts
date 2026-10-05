import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../_generated/server";

const { cachedRerank } = vi.hoisted(() => ({ cachedRerank: vi.fn(async () => []) }));
vi.mock("../_agents/chat/rerankCache.js", () => ({ cachedRerank }));

import { createRerankFn } from "./_streamSearch";

describe("createRerankFn", () => {
  it("asks the reranker to score every candidate, so no chunk keeps a different score scale", async () => {
    const docs = Array.from({ length: 37 }, (_, i) => ({ id: `d${i}`, content: `chunk ${i}` }));

    await createRerankFn({} as ActionCtx)("query", docs);

    expect(cachedRerank).toHaveBeenCalledWith(expect.anything(), "query", docs, 37);
  });
});
