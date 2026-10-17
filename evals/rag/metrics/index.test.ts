import { describe, expect, it } from "vitest";
import { AGENTIC_20_ITEMS } from "../fixtures/agentic-patterns-20";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact } from "../types";
import { expectedItemRecall, retrievalNdcgAtK, retrievalPrecisionAtK } from "./index";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "agentic-patterns-20",
  runner: "chat",
  question: "What are the 20 agentic patterns?",
  notebookId: "nb",
  expectedItems: [...AGENTIC_20_ITEMS],
  expectedBehavior: "Enumerate all 20 patterns",
  tags: [],
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "chat",
    configHash: "h",
    answer: "a",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 10,
    timestamp: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

function chunk(id: string, content: string): ChunkSnapshot {
  return { id, sourceTitle: "Agentic patterns", content, rankingScore: 0.5 };
}

const ALL_VERBATIM = AGENTIC_20_ITEMS.map((item) => `- ${item}`).join("\n");

describe("expectedItemRecall", () => {
  it("scores an abstaining answer that names no items as 0", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({
        answer:
          "I could not find a list of agentic patterns in your sources. Please upload a document that covers this topic.",
      })
    );
    expect(result.score).toBe(0);
  });

  it("does not credit single words or substrings of items in a loose answer", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({
        answer:
          "Agents plan what to do, use tools, remember things, talk to each other and are tested for safety.",
      })
    );
    expect(result.score).toBeLessThanOrEqual(0.05);
  });

  it("scores an answer listing all 20 items verbatim as 1", () => {
    const result = expectedItemRecall(fixture, artifact({ answer: ALL_VERBATIM }));
    expect(result.score).toBe(1);
  });

  it("keeps the explicit 'tool calling' synonym for 'tool use'", () => {
    const answer = ALL_VERBATIM.replace("- tool use", "- tool calling");
    const result = expectedItemRecall(fixture, artifact({ answer }));
    expect(result.score).toBe(1);
  });

  it("does not match a multi-word item on a substring of a word", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({ answer: "Multi-agents collaborate through inter-agents communications." })
    );
    expect(result.score).toBe(0);
  });
});

describe("retrieval metrics on the word 'agent'", () => {
  const agentOnly = [chunk("c1", "Each agent runs one step at a time.")];

  it("does not treat a chunk containing only the word 'agent' as relevant to precision@K", () => {
    const result = retrievalPrecisionAtK(fixture, artifact({ selectedChunks: agentOnly }));
    expect(result.score).toBe(0);
  });

  it("does not treat a chunk containing only the word 'agent' as relevant to nDCG@K", () => {
    const result = retrievalNdcgAtK(fixture, artifact({ selectedChunks: agentOnly }));
    expect(result.score).toBe(0);
  });
});
