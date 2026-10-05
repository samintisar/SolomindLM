import { describe, expect, it, vi } from "vitest";

// ChatAgent builds its LLM clients on construction; these tests never call them.
vi.hoisted(() => {
  process.env.TOGETHER_AI_API_KEY ??= "test-key";
  process.env.OPENAI_API_KEY ??= "test-key";
});

import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import type { ReferenceChunk } from "../../storage/ChatHistoryService";
import { ChatAgent } from "./ChatAgent";
import { CONTEXT_TOKEN_BUDGET } from "./chatConfig";
import { chunkDedupKey, selectChunksByTokenBudgetWithReservation } from "./chunkContext";

// Passages are chunked at up to ~1000 tokens; a full paper is ~20k tokens.
const PASSAGE_TEXT = "word ".repeat(800);
const FULL_PAPER_TEXT = "word ".repeat(16000);

function pooled(documentId: string, chunkIndex: number, similarity: number): ReferenceChunk {
  return {
    id: `${documentId}-${chunkIndex}`,
    sourceId: `src-${documentId}`,
    documentId,
    sourceTitle: `Paper ${documentId}`,
    content: PASSAGE_TEXT,
    chunkIndex,
    similarity,
    metadata: { totalChunks: 60 },
  } as ReferenceChunk;
}

const dominantPaper = () => Array.from({ length: 12 }, (_, i) => pooled("A", i, 0.9 - i * 0.02));

/** A reranked pool where one paper dominates, as for "how does A differ from B and C?". */
function threePaperPool(): ReferenceChunk[] {
  const b = Array.from({ length: 4 }, (_, i) => pooled("B", i, 0.8 - i * 0.05));
  const c = Array.from({ length: 4 }, (_, i) => pooled("C", i, 0.75 - i * 0.05));
  return [...dominantPaper(), ...b, ...c].sort((x, y) => (y.similarity ?? 0) - (x.similarity ?? 0));
}

function agentWithFullText(): ChatAgent {
  return new ChatAgent({
    fetchDocumentFn: async (documentId: string) => ({
      documentId,
      content: FULL_PAPER_TEXT,
      chunkCount: 60,
    }),
  } as ConstructorParameters<typeof ChatAgent>[0]);
}

/** Mirrors ChatAgent.streamRoutedResponse after the global rerank. */
async function assembleContext(
  agent: ChatAgent,
  pool: ReferenceChunk[],
  rerankedKeys: Set<string>
) {
  const logger = createServiceLogger("ChatAgent", "test");
  const expanded: ReferenceChunk[] = await agent["expandMultiSectionDocuments"](
    pool,
    logger,
    rerankedKeys
  );
  return selectChunksByTokenBudgetWithReservation(expanded, [], logger, undefined, {
    maxContextTokens: CONTEXT_TOKEN_BUDGET,
    rerankedKeys,
  });
}

const keysOf = (chunks: ReferenceChunk[]) => new Set(chunks.map(chunkDedupKey));
const documentsIn = (chunks: ReferenceChunk[]) =>
  [...new Set(chunks.map((c) => c.documentId))].sort();

describe("chat context with several selected sources (#347)", () => {
  it("keeps passages from every relevant paper when one paper dominates the pool", async () => {
    const pool = threePaperPool();
    const selected = await assembleContext(agentWithFullText(), pool, keysOf(pool));

    expect(documentsIn(selected)).toEqual(["A", "B", "C"]);
    expect(selected.some((c) => c.chunkIndex === -1)).toBe(false);
  });

  it("still expands a single relevant paper to its full text", async () => {
    const pool = dominantPaper();
    const selected = await assembleContext(agentWithFullText(), pool, keysOf(pool));

    expect(selected.some((c) => c.chunkIndex === -1)).toBe(true);
  });

  it("expands the relevant paper even when other selected sources add unscored strays", async () => {
    const relevant = dominantPaper();
    const strays = ["B", "C", "D"].map((d) => pooled(d, 0, 0.5));
    const selected = await assembleContext(
      agentWithFullText(),
      [...relevant, ...strays],
      keysOf(relevant)
    );

    expect(selected[0]?.chunkIndex).toBe(-1);
    expect(selected[0]?.documentId).toBe("A");
  });
});
