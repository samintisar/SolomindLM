import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; every client it uses is replaced below.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

// The selection call is wrapped, not replaced: the real selection still runs, and the test can
// read the options ChatAgent passed in.
vi.mock("./chunkContext.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chunkContext.js")>();
  return {
    ...actual,
    selectChunksByTokenBudgetWithReservation: vi.fn(
      actual.selectChunksByTokenBudgetWithReservation
    ),
  };
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { ChatAgent } from "./ChatAgent";
import { CONTEXT_TOKEN_BUDGET, MULTI_SOURCE_MAX_EXTRA_TOKENS } from "./chatConfig";
import type { ChatConfigOverrides } from "./chatConfigOverrides";
import { selectChunksByTokenBudgetWithReservation } from "./chunkContext.js";
import type { ReferenceChunk } from "./types";

const passage: ReferenceChunk = {
  id: "doc-1-3",
  sourceId: "chunk-doc-1-3",
  documentId: "doc-1",
  sourceTitle: "Doc",
  content: "Tensor attributes describe their shape, datatype, and device.",
  chunkIndex: 3,
  similarity: 0.6,
};

const QUESTION = "How are tensor attributes described in the notes?";

/** Runs one retrieval turn with the given overrides and returns what the selection saw. */
async function runTurn(overrides?: ChatConfigOverrides) {
  vi.mocked(selectChunksByTokenBudgetWithReservation).mockClear();
  const agent = new ChatAgent({
    vectorSearchHandler: {
      search: vi.fn(async () => [passage]),
    } as unknown as NonNullable<ConstructorParameters<typeof ChatAgent>[0]>["vectorSearchHandler"],
    configOverrides: overrides,
  });
  const generateRetrievalSubqueries = vi.fn(async () => ({ subqueries: ["tensor attributes"] }));
  agent["llmWrapper"] = {
    generateRetrievalSubqueries,
    generateHypotheticalDocument: async () => "",
    generateStructuredResponse: async () => ({
      answer_markdown: "Tensors have a shape [1].",
      confidence: "high",
    }),
    generateFollowUpQuestions: async () => [],
  } as unknown as ChatAgent["llmWrapper"];
  agent["embeddingService"] = {
    embedText: async () => [0.1, 0.2],
  } as unknown as ChatAgent["embeddingService"];

  const logger = createServiceLogger("ChatAgent", "test");
  const context = {
    userId: "u",
    noteId: "n",
    conversationHistory: [],
    documentIds: ["doc-1"],
    groundingMode: "off" as const,
  };
  for await (const chunk of agent["streamRoutedResponse"](context, QUESTION, [], logger)) {
    void chunk;
  }

  const selection = vi.mocked(selectChunksByTokenBudgetWithReservation).mock.calls[0];
  return {
    planOptions: generateRetrievalSubqueries.mock.calls[0]?.[2],
    selectionOptions: selection?.[4],
  };
}

describe("ChatAgent passes its resolved budgets, production values", () => {
  it("uses the production constants when no overrides are set", async () => {
    const { planOptions, selectionOptions } = await runTurn();
    expect(selectionOptions?.maxContextTokens).toBe(CONTEXT_TOKEN_BUDGET);
    expect(selectionOptions?.multiSourceMaxExtraTokens).toBe(MULTI_SOURCE_MAX_EXTRA_TOKENS);
    expect(planOptions).toMatchObject({ maxSubqueries: 6 });
  });
});

describe("ChatAgent passes its resolved budgets, with overrides", () => {
  it("passes the overridden budget, extra-token cap and sub-query cap", async () => {
    const { planOptions, selectionOptions } = await runTurn({
      contextTokenBudget: 3000,
      multiSourceMaxExtraTokens: 500,
      maxSubqueries: 2,
    });
    expect(selectionOptions?.maxContextTokens).toBe(3000);
    expect(selectionOptions?.multiSourceMaxExtraTokens).toBe(500);
    expect(planOptions).toMatchObject({ maxSubqueries: 2 });
  });
});
