import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests replace the ones they use.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { ChatAgent } from "./ChatAgent";
import { MAX_PER_SOURCE_DOCUMENTS, PER_SOURCE_PASSAGES_PER_SEARCH } from "./chatConfig";
import { selectedSourceIds, titlesOfSources } from "./chunkContext";
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

const logger = createServiceLogger("ChatAgent", "test");

describe("selectedSourceIds (#450)", () => {
  it("lists two or more selected sources once each, up to the cap", () => {
    expect(selectedSourceIds(["rag", "react", "rag"])).toEqual(["rag", "react"]);
    expect(selectedSourceIds(["rag"])).toEqual([]);
    expect(selectedSourceIds(undefined)).toEqual([]);
    const many = Array.from({ length: MAX_PER_SOURCE_DOCUMENTS + 1 }, (_, i) => `d${i}`);
    expect(selectedSourceIds(many)).toEqual([]);
  });
});

describe("titlesOfSources (#450)", () => {
  it("names every source in selection order, looking up the rest in one call", async () => {
    const pool = [passage("react", 0), passage("rag", 4), passage("react", 2)];
    const lookupTitles = vi.fn(async () => ({ missed: "missed.pdf" }));

    await expect(
      titlesOfSources(["rag", "missed", "react", "unprocessed"], pool, lookupTitles)
    ).resolves.toEqual(["rag.pdf", "missed.pdf", "react.pdf", "Untitled source"]);
    expect(lookupTitles).toHaveBeenCalledTimes(1);
    expect(lookupTitles).toHaveBeenCalledWith(["missed", "unprocessed"]);
  });

  it("looks nothing up when every source has a passage", async () => {
    const lookupTitles = vi.fn(async () => ({}));

    await titlesOfSources(["rag"], [passage("rag", 0)], lookupTitles);

    expect(lookupTitles).not.toHaveBeenCalled();
  });
});

describe("ChatAgent title lookup for selected sources (#450)", () => {
  it("names sources with no retrieved passage from their document records", async () => {
    const fetchDocumentTitlesFn = vi.fn(async () => ({ missed: "missed.pdf" }));
    const agent = new ChatAgent({ fetchDocumentTitlesFn });

    await expect(agent["lookupSourceTitles"](["missed"], logger)).resolves.toEqual({
      missed: "missed.pdf",
    });
    expect(fetchDocumentTitlesFn).toHaveBeenCalledWith(["missed"]);
  });

  it("logs a failed lookup and names none, so the sources still count", async () => {
    const agent = new ChatAgent({
      fetchDocumentTitlesFn: vi.fn(async () => {
        throw new Error("query failed");
      }),
    });
    const warn = vi.spyOn(logger, "warn");

    await expect(agent["lookupSourceTitles"](["missed"], logger)).resolves.toEqual({});
    expect(warn).toHaveBeenCalledWith(
      "Source title lookup failed",
      expect.objectContaining({ error: expect.stringContaining("query failed") })
    );
  });
});

describe("ChatAgent per-source retrieval (#450)", () => {
  function agentWith(
    searchDocument: ReturnType<typeof vi.fn>,
    search = vi.fn(async () => [passage("self-rag", 0), passage("react", 1)])
  ) {
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

  it("starts the per-source searches alongside the hybrid search, not after it", async () => {
    const searchDocument = vi.fn(async () => []);
    const perSourceCallsWhenHybridStarted: number[] = [];
    const search = vi.fn(async () => {
      perSourceCallsWhenHybridStarted.push(searchDocument.mock.calls.length);
      return [passage("react", 1)];
    });
    const agent = agentWith(searchDocument, search);

    await agent["runSubqueryRetrieval"](
      "limitations acknowledged in paper",
      context,
      logger,
      false,
      ["rag", "react"]
    );

    expect(perSourceCallsWhenHybridStarted[0]).toBe(2);
  });

  it("keeps the sources that answered when another one runs out of time", async () => {
    const searchDocument = vi.fn((documentId: string) =>
      documentId === "rag"
        ? new Promise<ReferenceChunk[]>(() => {})
        : Promise.resolve([passage(documentId, 3)])
    );
    const agent = agentWith(searchDocument);

    const found: ReferenceChunk[] = await agent["searchEachSource"](
      ["rag", "react", "self-rag"],
      [0.1],
      () => 20,
      logger
    );

    expect(found.map((c) => c.id).sort()).toEqual(["react-3", "self-rag-3"]);
  });

  it("searches no single source when none are listed", async () => {
    const searchDocument = vi.fn(async () => []);
    const agent = agentWith(searchDocument);

    await agent["runSubqueryRetrieval"]("what is retrieval", context, logger, false);

    expect(searchDocument).not.toHaveBeenCalled();
  });
});

describe("ChatAgent opening passages (#477)", () => {
  it("takes openings retrieval found and fetches only the rest", async () => {
    const fetchOpeningPassagesFn = vi.fn(async () => [passage("react", 0)]);
    const agent = new ChatAgent({ fetchOpeningPassagesFn });
    const passages = [passage("rag", 7), passage("react", 4)];
    const pool = [...passages, passage("rag", 0)];

    const out: ReferenceChunk[] = await agent["withOpeningPassages"](passages, pool, logger);

    expect(fetchOpeningPassagesFn).toHaveBeenCalledWith(["react"]);
    expect(out.map((c) => c.id)).toEqual(["rag-0", "rag-7", "react-0", "react-4"]);
  });

  it("logs a failed fetch and keeps the passages it has", async () => {
    const agent = new ChatAgent({
      fetchOpeningPassagesFn: vi.fn(async () => {
        throw new Error("query failed");
      }),
    });
    const warn = vi.spyOn(logger, "warn");
    const passages = [passage("rag", 7)];

    await expect(agent["withOpeningPassages"](passages, passages, logger)).resolves.toEqual(
      passages
    );
    expect(warn).toHaveBeenCalledWith(
      "Opening passage lookup failed",
      expect.objectContaining({ error: expect.stringContaining("query failed") })
    );
  });
});
