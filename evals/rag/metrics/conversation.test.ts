import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { historyMode, historyTokenShare } from "./conversation";

const fixture = {
  schemaVersion: 1,
  id: "wiring/multi-01",
  question: "Give me two more examples of that.",
  expectedItems: [],
  expectedBehavior: "Uses the earlier topic.",
  runner: "chat",
  tags: [],
} as EvalFixture;

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
    latencyMs: 1,
    timestamp: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

const chunk = (id: string, content: string) => ({ id, sourceTitle: "t", content });

describe("historyTokenShare", () => {
  it("is 0 for a single-turn fixture with no history", () => {
    const result = historyTokenShare(fixture, artifact({ selectedChunks: [chunk("c1", "abcd")] }));
    expect(result.metric).toBe("history_token_share");
    expect(result.status).toBe("info");
    expect(result.score).toBe(0);
  });

  it("divides estimated history tokens by history plus selected-chunk tokens", () => {
    const withTurns = {
      ...fixture,
      turns: [{ role: "user" as const, content: "x".repeat(40) }],
    };
    // history: 40 chars -> 10 tokens; chunks: 120 chars -> 30 tokens
    const result = historyTokenShare(
      withTurns,
      artifact({ selectedChunks: [chunk("c1", "y".repeat(120))] })
    );
    expect(result.score).toBeCloseTo(10 / 40, 5);
    expect(result.breakdown).toMatchObject({ historyTokens: 10, chunkTokens: 30 });
  });

  it("reports the mode that discards history alongside the share", () => {
    const withTurns = { ...fixture, turns: [{ role: "user" as const, content: "x".repeat(40) }] };
    const result = historyTokenShare(withTurns, artifact({ instructionMode: "default" }));
    expect(result.breakdown).toMatchObject({ historyDiscardedByMode: true });
  });
});

describe("historyMode", () => {
  it("records the mode the artifact ran in", () => {
    const result = historyMode(fixture, artifact({ instructionMode: "learningGuide" }));
    expect(result.metric).toBe("history_mode");
    expect(result.status).toBe("info");
    expect(result.score).toBe(1);
    expect(result.breakdown).toMatchObject({ mode: "learningGuide", keepsHistory: true });
  });

  it("falls back to the fixture's requested mode, then to default", () => {
    const learning = { ...fixture, chatSettings: { instructionMode: "learningGuide" as const } };
    expect(historyMode(learning, artifact()).breakdown).toMatchObject({ mode: "learningGuide" });
    expect(historyMode(fixture, artifact()).breakdown).toMatchObject({
      mode: "default",
      keepsHistory: false,
    });
  });
});
