import { afterEach, describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { ChatAgent } from "./ChatAgent";
import { HYDE_TIMEOUT_MS } from "./chatConfig";
import type { ReferenceChunk } from "./types";

const passage: ReferenceChunk = {
  id: "tensors-3",
  sourceId: "chunk-tensors-3",
  documentId: "tensors",
  sourceTitle: "Tensors",
  content: "Tensor attributes describe their shape, datatype, and device.",
  chunkIndex: 3,
  similarity: 0.6,
};

const logger = createServiceLogger("ChatAgent", "test");
const context = { userId: "u", noteId: "n", conversationHistory: [] };

function agentWithHyde(generateHypotheticalDocument: () => Promise<string>) {
  const search = vi.fn(async () => [passage]);
  const embedText = vi.fn(async () => [0.1, 0.2]);
  const agent = new ChatAgent({
    vectorSearchHandler: { search } as unknown as NonNullable<
      ConstructorParameters<typeof ChatAgent>[0]
    >["vectorSearchHandler"],
  });
  agent["llmWrapper"] = { generateHypotheticalDocument } as unknown as ChatAgent["llmWrapper"];
  agent["embeddingService"] = { embedText } as unknown as ChatAgent["embeddingService"];
  return { agent, search, embedText };
}

// A stalled HyDE call used the whole search budget and failed every sub-query, so chat answered
// from no passages at all.
describe("ChatAgent sub-query retrieval when HyDE stalls", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches with the query alone once HyDE passes its deadline", async () => {
    vi.useFakeTimers();
    const { agent, search, embedText } = agentWithHyde(() => new Promise<string>(() => {}));

    const found = agent["runSubqueryRetrieval"]("tensor shape", context, logger);
    await vi.advanceTimersByTimeAsync(HYDE_TIMEOUT_MS);

    await expect(found).resolves.toEqual([passage]);
    expect(embedText).toHaveBeenCalledWith("tensor shape");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("searches with the query alone when HyDE fails", async () => {
    const { agent, embedText } = agentWithHyde(async () => {
      throw new Error("LLM API error: 503");
    });

    await expect(agent["runSubqueryRetrieval"]("tensor shape", context, logger)).resolves.toEqual([
      passage,
    ]);
    expect(embedText).toHaveBeenCalledWith("tensor shape");
  });
});
