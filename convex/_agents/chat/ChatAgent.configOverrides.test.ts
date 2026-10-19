import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { ChatAgent } from "./ChatAgent";
import type { ChatConfigOverrides } from "./chatConfigOverrides";
import type { ReferenceChunk } from "./types";

const logger = createServiceLogger("ChatAgent", "test");
const context = {
  userId: "u",
  noteId: "n",
  conversationHistory: [],
  documentIds: ["doc-1"],
};

const passage: ReferenceChunk = {
  id: "doc-1-3",
  sourceId: "chunk-doc-1-3",
  documentId: "doc-1",
  sourceTitle: "Doc",
  content: "Tensor attributes describe their shape, datatype, and device.",
  chunkIndex: 3,
  similarity: 0.6,
};

function agentWith(overrides: ChatConfigOverrides) {
  const search = vi.fn(async () => [passage]);
  const agent = new ChatAgent({
    vectorSearchHandler: { search } as unknown as NonNullable<
      ConstructorParameters<typeof ChatAgent>[0]
    >["vectorSearchHandler"],
    configOverrides: overrides,
  });
  return { agent, search };
}

describe("ChatAgent with hydeEnabled: false", () => {
  it("never calls HyDE and embeds the sub-query alone", async () => {
    const { agent, search } = agentWith({ hydeEnabled: false });
    const generateHypotheticalDocument = vi.fn(async () => "hypothetical");
    const embedText = vi.fn(async (_text: string) => [0.1, 0.2]);
    agent["llmWrapper"] = {
      generateHypotheticalDocument,
    } as unknown as ChatAgent["llmWrapper"];
    agent["embeddingService"] = { embedText } as unknown as ChatAgent["embeddingService"];

    await agent["runSubqueryRetrieval"]("tensor shape", context, logger);

    expect(generateHypotheticalDocument).not.toHaveBeenCalled();
    expect(embedText).toHaveBeenCalledWith("tensor shape");
    expect(search.mock.calls[0]?.[5]).toBe("");
  });
});

describe("ChatAgent with keywordVariants: 0", () => {
  const embeddingOnly = (agent: ChatAgent) => {
    agent["llmWrapper"] = {
      generateHypotheticalDocument: async () => "",
    } as unknown as ChatAgent["llmWrapper"];
    agent["embeddingService"] = {
      embedText: async () => [0.1, 0.2],
    } as unknown as ChatAgent["embeddingService"];
  };

  it("runs one search per sub-query", async () => {
    const { agent, search } = agentWith({ keywordVariants: 0 });
    embeddingOnly(agent);

    await agent["runSubqueryRetrieval"]("compare the difference", context, logger);

    expect(search).toHaveBeenCalledTimes(1);
  });

  it("keeps the keyword variations by default", async () => {
    const { agent, search } = agentWith({});
    embeddingOnly(agent);

    await agent["runSubqueryRetrieval"]("compare the difference", context, logger);

    expect(search.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("ChatAgent with rerankEnabled: false", () => {
  it("does not call the global rerank and keeps the merged hybrid order", async () => {
    const globalRerankFn = vi.fn(async (_q: string, docs: Array<{ id: string; content: string }>) =>
      [...docs].reverse()
    );
    const agent = new ChatAgent({
      globalRerankFn,
      configOverrides: { rerankEnabled: false },
    });
    const chunk = (chunkIndex: number) =>
      ({
        sourceId: "doc-1",
        chunkIndex,
        content: `chunk ${chunkIndex}`,
      }) as unknown as ReferenceChunk;

    const result = await agent["applyGlobalRerank"](
      [chunk(0), chunk(1), chunk(2)],
      undefined,
      "q",
      logger
    );

    expect(globalRerankFn).not.toHaveBeenCalled();
    expect(result.chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2]);
    expect(result.rerankedKeys).toBeUndefined();
  });
});

describe("ChatAgent full-document expansion", () => {
  const WHOLE_DOCUMENT_TOKENS = "word ".repeat(2000);
  const manyPassages = () =>
    Array.from({ length: 10 }, (_, i) => ({
      ...passage,
      id: `doc-1-${i}`,
      sourceId: `chunk-doc-1-${i}`,
      chunkIndex: i,
      content: "a passage",
      metadata: { totalChunks: 20 },
    })) as ReferenceChunk[];
  const fetchDocumentFn = vi.fn(async () => ({ content: WHOLE_DOCUMENT_TOKENS, title: "Doc" }));

  it("is skipped when set to off", async () => {
    fetchDocumentFn.mockClear();
    const agent = new ChatAgent({
      fetchDocumentFn,
      configOverrides: { fullDocumentExpansion: "off" },
    });
    const chunks = manyPassages();

    const result = await agent["expandMultiSectionDocuments"](chunks, logger);

    expect(result).toEqual(chunks);
    expect(fetchDocumentFn).not.toHaveBeenCalled();
  });

  it("expands a document whose whole text fits under the token cap", async () => {
    const agent = new ChatAgent({
      fetchDocumentFn,
      configOverrides: { fullDocumentExpansion: 5000 },
    });

    const result = await agent["expandMultiSectionDocuments"](manyPassages(), logger);

    expect(result).toHaveLength(1);
    expect(result[0]?.chunkIndex).toBe(-1);
  });

  it("keeps the passages when the whole document is over the token cap", async () => {
    const agent = new ChatAgent({
      fetchDocumentFn,
      configOverrides: { fullDocumentExpansion: 500 },
    });
    const chunks = manyPassages();

    const result = await agent["expandMultiSectionDocuments"](chunks, logger);

    expect(result).toEqual(chunks);
  });

  it("keeps the passages and fetches once when the whole document is unavailable", async () => {
    const failingFetch = vi.fn(async () => null);
    const agent = new ChatAgent({ fetchDocumentFn: failingFetch });
    const chunks = manyPassages();

    const result = await agent["expandMultiSectionDocuments"](chunks, logger);

    expect(result).toEqual(chunks);
    expect(failingFetch).toHaveBeenCalledTimes(1);
  });
});
