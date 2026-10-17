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

  it("matches 'tool use' through its own synonyms", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["tool use"], "The agent uses tool calling.")).toBe(1);
    expect(score(["tool use"], "It relies on function calling.")).toBe(1);
    expect(score(["tool use"], "A router picks the route.")).toBe(0);
    expect(score(["routing"], "Agents use tool use to act.")).toBe(0);
  });

  it("does not let one item's synonyms credit another item", () => {
    const pairs: string[] = [];
    for (const i of AGENTIC_20_ITEMS) {
      for (const j of AGENTIC_20_ITEMS) {
        if (i === j) continue;
        const result = expectedItemRecall(
          { ...fixture, expectedItems: [i] },
          artifact({ answer: j })
        );
        if (result.score !== 0) pairs.push(`${i} <- ${j}`);
      }
    }
    expect(pairs).toEqual([]);
  });

  it("matches a plural or possessive of the item's last word", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["routing"], "Routing's role is to pick the path.")).toBe(1);
    expect(score(["reflection"], "Several reflections improve the output.")).toBe(1);
    expect(score(["guardrails and safety patterns"], "Add a guardrail before the tool.")).toBe(1);
  });

  it("does not credit a multi-word item on generic pattern prose", () => {
    const score = (items: string[], answer: string) =>
      expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;
    expect(score(["reasoning techniques"], "Various techniques; reasoning is hard")).toBe(0);
    expect(
      score(["guardrails and safety patterns"], "These design patterns matter for safety")
    ).toBe(0);
  });

  it("does not match a multi-word item on a substring of a word", () => {
    const result = expectedItemRecall(
      fixture,
      artifact({ answer: "Multi-agentic systems use interagentic messaging." })
    );
    expect(result.score).toBe(0);
  });
});

describe("plural and compound matching", () => {
  const score = (items: string[], answer: string) =>
    expectedItemRecall({ ...fixture, expectedItems: items }, artifact({ answer })).score;

  it("matches a singular answer to a plural item, and a plural answer to a singular item", () => {
    expect(score(["neural networks"], "a neural network")).toBe(1);
    expect(score(["neural network"], "neural networks")).toBe(1);
    expect(score(["clinical trials"], "one clinical trial")).toBe(1);
  });

  it("does not strip the s from words whose s belongs to the stem", () => {
    expect(score(["lateral rectus"], "lateral rectus muscle")).toBe(1);
    // "analysis" keeps its s (it ends in "is"), so the plural "analyses" is not matched. This is
    // a known gap, recorded here rather than stemmed around.
    expect(score(["analysis"], "analyses were run")).toBe(0);
  });

  it("matches a hyphenated item written as one word in the answer", () => {
    expect(score(["feed-forward network"], "feedforward network")).toBe(1);
    expect(score(["multi-head attention"], "multihead attention")).toBe(1);
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
