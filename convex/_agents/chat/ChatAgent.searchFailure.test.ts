import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { ChatAgent, SEARCH_FAILED_MESSAGE } from "./ChatAgent";
import type { StreamChunk } from "./types";

function agentWhoseSearch(
  search: (userId: string, noteId: string, query: string) => Promise<unknown[]>
) {
  const generateDirectResponse = vi.fn(async () => "a general answer from no sources");
  const agent = new ChatAgent({
    vectorSearchHandler: { search: vi.fn(search) } as unknown as NonNullable<
      ConstructorParameters<typeof ChatAgent>[0]
    >["vectorSearchHandler"],
  });
  agent["llmWrapper"] = {
    generateRetrievalSubqueries: async () => ({
      subqueries: ["Tensor shape definition", "Tensor shape properties"],
    }),
    generateHypotheticalDocument: async () => "",
    generateDirectResponse,
    consumeTokenUsage: () => undefined,
  } as unknown as ChatAgent["llmWrapper"];
  agent["embeddingService"] = {
    embedText: async () => [0.1, 0.2],
  } as unknown as ChatAgent["embeddingService"];
  return { agent, generateDirectResponse };
}

async function collect(agent: ChatAgent): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of agent.streamResponse(
    { userId: "u", noteId: "n", conversationHistory: [] },
    "Discuss what these sources say about shape, in the context of Tensors."
  )) {
    chunks.push(chunk);
  }
  return chunks;
}

const doneSearches = (chunks: StreamChunk[]) =>
  chunks.filter((c) => c.type === "tool_call" && c.data?.status === "done").map((c) => c.data);

const answerText = (chunks: StreamChunk[]) =>
  chunks
    .filter((c) => c.type === "token")
    .map((c) => c.data)
    .join("")
    .trim();

const errors = (chunks: StreamChunk[]) =>
  chunks.filter((c) => c.type === "error").map((c) => c.data);

// A search that threw was reported as finding nothing, and chat then answered from general
// knowledge as if the sources had nothing on the question.
describe("ChatAgent when sub-query searches fail", () => {
  it("marks each failed search as failed rather than empty", async () => {
    const { agent } = agentWhoseSearch(async () => {
      throw new Error("vector_hybrid_search timed out after 70000ms");
    });

    const searches = doneSearches(await collect(agent));

    expect(searches).toHaveLength(2);
    for (const search of searches) {
      expect(search).toMatchObject({ resultCount: 0, failed: true });
    }
  });

  it("says the sources could not be searched instead of answering without them", async () => {
    const { agent, generateDirectResponse } = agentWhoseSearch(async () => {
      throw new Error("vector_hybrid_search timed out after 70000ms");
    });

    const chunks = await collect(agent);

    // An error, so the turn is saved as a failed one rather than as an answer.
    expect(errors(chunks)).toEqual([{ message: SEARCH_FAILED_MESSAGE, type: "search_failed" }]);
    expect(answerText(chunks)).toBe("");
    expect(generateDirectResponse).not.toHaveBeenCalled();
  });

  it("does not answer without sources when some searches failed and the rest found nothing", async () => {
    const { agent, generateDirectResponse } = agentWhoseSearch(async (_userId, _noteId, query) => {
      if (query === "Tensor shape definition") throw new Error("hyde_embedding timed out");
      return [];
    });

    const chunks = await collect(agent);

    expect(errors(chunks)).toEqual([{ message: SEARCH_FAILED_MESSAGE, type: "search_failed" }]);
    expect(generateDirectResponse).not.toHaveBeenCalled();
  });

  it("leaves a search that ran and found nothing unmarked", async () => {
    const { agent } = agentWhoseSearch(async () => []);

    const searches = doneSearches(await collect(agent));

    expect(searches).toHaveLength(2);
    for (const search of searches) {
      expect(search).not.toHaveProperty("failed");
    }
  });
});
