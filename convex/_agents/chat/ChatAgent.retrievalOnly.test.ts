import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { ChatAgent } from "./ChatAgent";
import type { ChatAgentContext, ReferenceChunk, StreamChunk } from "./types";

const passage = (i: number): ReferenceChunk => ({
  id: `c${i}`,
  sourceId: "doc-1",
  sourceTitle: "Patterns",
  content: `Passage ${i}: routing sends each request to a specialist.`,
  chunkIndex: i,
  similarity: 0.9,
});

function agentWithGeneration(hits: ReferenceChunk[] = [passage(1), passage(2)]) {
  const generation = {
    generateStructuredResponse: vi.fn(async () => ({
      answer_markdown: "Routing sends requests to specialists [1].",
      confidence: "high",
      citations: [],
    })),
    generateWithStrictGrounding: vi.fn(),
    generateFollowUpQuestions: vi.fn(async () => ["What about parallel work?"]),
    generateDirectResponse: vi.fn(async () => "a general answer"),
  };
  const agent = new ChatAgent({
    vectorSearchHandler: {
      search: vi.fn(async () => hits),
    } as unknown as NonNullable<ConstructorParameters<typeof ChatAgent>[0]>["vectorSearchHandler"],
  });
  agent["llmWrapper"] = {
    generateRetrievalSubqueries: async () => ({ subqueries: ["routing specialists"] }),
    generateHypotheticalDocument: async () => "",
    ...generation,
  } as unknown as ChatAgent["llmWrapper"];
  agent["embeddingService"] = {
    embedText: async () => [0.1, 0.2],
  } as unknown as ChatAgent["embeddingService"];
  return { agent, generation };
}

async function collect(agent: ChatAgent, extra: Partial<ChatAgentContext> = {}) {
  const chunks: StreamChunk[] = [];
  for await (const chunk of agent.streamResponse(
    { userId: "u", noteId: "n", conversationHistory: [], ...extra },
    "Explain how routing picks a specialist for each request."
  )) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("ChatAgent with evalRetrievalOnly", () => {
  it("emits the selected passages and then done, without generating an answer", async () => {
    const { agent, generation } = agentWithGeneration();

    const chunks = await collect(agent, { evalRetrievalOnly: true });

    const references = chunks.find((c) => c.type === "references")?.data as
      | ReferenceChunk[]
      | undefined;
    expect(references?.map((c) => c.content)).toEqual([passage(1).content, passage(2).content]);
    // `done` carries the turn telemetry snapshot. The mocked LLM wrapper records no usage, so the
    // snapshot shows the one embedding call and no LLM calls, with no answer stage.
    expect(chunks.at(-1)).toEqual({
      type: "done",
      data: {
        tokenUsage: undefined,
        callCounters: expect.objectContaining({ llmCalls: 0, embeddingCalls: 1 }),
        stageSpans: [],
      },
    });
    expect(chunks.filter((c) => c.type === "token")).toEqual([]);
    expect(chunks.filter((c) => c.type === "followups")).toEqual([]);
    expect(generation.generateStructuredResponse).not.toHaveBeenCalled();
    expect(generation.generateWithStrictGrounding).not.toHaveBeenCalled();
    expect(generation.generateFollowUpQuestions).not.toHaveBeenCalled();
  });

  it("generates an answer as usual when the flag is not set (control)", async () => {
    const { agent, generation } = agentWithGeneration();

    const chunks = await collect(agent);

    expect(generation.generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(chunks.some((c) => c.type === "token")).toBe(true);
    expect(chunks.at(-1)?.type).toBe("done");
  });

  it("ends with done and no generation when retrieval finds nothing", async () => {
    const { agent, generation } = agentWithGeneration([]);

    const chunks = await collect(agent, { evalRetrievalOnly: true });

    expect(chunks.filter((c) => c.type === "references")).toEqual([]);
    expect(chunks.filter((c) => c.type === "token")).toEqual([]);
    // `done` carries the turn telemetry snapshot. The mocked LLM wrapper records no usage, so the
    // snapshot shows the one embedding call and no LLM calls, with no answer stage.
    expect(chunks.at(-1)).toEqual({
      type: "done",
      data: {
        tokenUsage: undefined,
        callCounters: expect.objectContaining({ llmCalls: 0, embeddingCalls: 1 }),
        stageSpans: [],
      },
    });
    expect(generation.generateDirectResponse).not.toHaveBeenCalled();
    expect(generation.generateStructuredResponse).not.toHaveBeenCalled();
  });

  it("still answers directly when retrieval finds nothing and the flag is not set (control)", async () => {
    const { agent, generation } = agentWithGeneration([]);

    const chunks = await collect(agent);

    expect(generation.generateDirectResponse).toHaveBeenCalledTimes(1);
    expect(chunks.some((c) => c.type === "token")).toBe(true);
  });
});
