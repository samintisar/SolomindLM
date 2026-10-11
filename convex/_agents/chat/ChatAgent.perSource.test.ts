import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { ChatAgent } from "./ChatAgent";
import { MAX_PER_SOURCE_DOCUMENTS, PER_SOURCE_PASSAGES_PER_SEARCH } from "./chatConfig";
import { perSourceDocumentIds, titlesOfSources } from "./chunkContext";
import type { ReferenceChunk } from "./types";

const passage = (documentId: string, chunkIndex: number): ReferenceChunk => ({
  id: `${documentId}-${chunkIndex}`,
  sourceId: `chunk-${documentId}-${chunkIndex}`,
  documentId,
  sourceTitle: `${documentId}.pdf`,
  content: `passage ${chunkIndex} of ${documentId}`,
  chunkIndex,
  similarity: 0.5,
});

const QUESTION = "What limitations does each paper acknowledge?";

describe("perSourceDocumentIds (#450)", () => {
  it("returns the selected sources for a question about each of them", () => {
    expect(perSourceDocumentIds(QUESTION, ["rag", "react", "self-rag"])).toEqual([
      "rag",
      "react",
      "self-rag",
    ]);
  });

  it("returns none for a topic question, one source, or more sources than it can cover", () => {
    expect(perSourceDocumentIds("What is retrieval?", ["rag", "react"])).toEqual([]);
    expect(perSourceDocumentIds(QUESTION, ["rag"])).toEqual([]);
    expect(perSourceDocumentIds(QUESTION, undefined)).toEqual([]);
    const many = Array.from({ length: MAX_PER_SOURCE_DOCUMENTS + 1 }, (_, i) => `d${i}`);
    expect(perSourceDocumentIds(QUESTION, many)).toEqual([]);
  });
});

describe("titlesOfSources (#450)", () => {
  it("names each source that has a retrieved passage, in selection order", () => {
    const pool = [passage("react", 0), passage("rag", 4), passage("react", 2)];

    expect(titlesOfSources(["rag", "react", "unprocessed"], pool)).toEqual([
      "rag.pdf",
      "react.pdf",
    ]);
  });
});

describe("ChatAgent per-source retrieval (#450)", () => {
  function agentWith(searchDocument: ReturnType<typeof vi.fn>) {
    const search = vi.fn(async () => [passage("self-rag", 0), passage("react", 1)]);
    const agent = new ChatAgent({
      vectorSearchHandler: { search, searchDocument } as unknown as NonNullable<
        ConstructorParameters<typeof ChatAgent>[0]
      >["vectorSearchHandler"],
    });
    agent["llmWrapper"] = {
      generateHypotheticalDocument: async () => "hypothetical passage",
    } as unknown as ChatAgent["llmWrapper"];
    agent["embeddingService"] = {
      embedText: async () => [0.1, 0.2],
    } as unknown as ChatAgent["embeddingService"];
    return agent;
  }
  const context = {
    userId: "u",
    noteId: "n",
    conversationHistory: [],
    documentIds: ["rag", "react", "self-rag"],
  };
  const logger = createServiceLogger("ChatAgent", "test");

  it("adds each listed source's own best passages to the sub-query's results", async () => {
    const searchDocument = vi.fn(async (documentId: string) =>
      documentId === "rag" ? [passage("rag", 7)] : [passage(documentId, 1)]
    );
    const agent = agentWith(searchDocument);

    const found: ReferenceChunk[] = await agent["runSubqueryRetrieval"](
      "limitations acknowledged in paper",
      context,
      logger,
      false,
      ["rag", "react", "self-rag"]
    );

    expect(searchDocument).toHaveBeenCalledTimes(3);
    expect(searchDocument).toHaveBeenCalledWith("rag", [0.1, 0.2], PER_SOURCE_PASSAGES_PER_SEARCH);
    // react-1 came back from both searches; it is kept once.
    expect(found.map((c) => c.id).sort()).toEqual(["rag-7", "react-1", "self-rag-0", "self-rag-1"]);
  });

  it("keeps the other results when one source's search fails", async () => {
    const searchDocument = vi.fn(async (documentId: string) => {
      if (documentId === "rag") throw new Error("vector search unavailable");
      return [passage(documentId, 9)];
    });
    const agent = agentWith(searchDocument);

    const found: ReferenceChunk[] = await agent["runSubqueryRetrieval"](
      "limitations acknowledged in paper",
      context,
      logger,
      false,
      ["rag", "react", "self-rag"]
    );

    expect(found.map((c) => c.id).sort()).toEqual([
      "react-1",
      "react-9",
      "self-rag-0",
      "self-rag-9",
    ]);
  });

  it("searches no single source when none are listed", async () => {
    const searchDocument = vi.fn(async () => []);
    const agent = agentWith(searchDocument);

    await agent["runSubqueryRetrieval"]("what is retrieval", context, logger, false);

    expect(searchDocument).not.toHaveBeenCalled();
  });
});
