import { describe, expect, it, vi } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { clearContextRelevanceCache } from "./contextRelevance";
import { scoreAllMetrics } from "./scorers";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "no-gold-case",
  runner: "chat",
  question: "What does routing do?",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Explains routing",
  tags: [],
};

const artifact: EvalRunArtifact = {
  caseId: "no-gold-case",
  runner: "chat",
  configHash: "h",
  answer: "Routing sends each request to a specialist [1].",
  citations: [],
  preRerankChunks: [],
  postRerankChunks: [],
  selectedChunks: [
    { id: "1", sourceTitle: "Patterns", content: "Routing sends requests to specialists." },
    { id: "2", sourceTitle: "Patterns", content: "Coffee machines need descaling monthly." },
  ],
  subQueries: ["routing"],
  latencyMs: 10,
  timestamp: "2026-10-17T00:00:00.000Z",
};

/** Context-relevance prompts ask for "needed"; binary judge prompts ask for "pass". */
const judge = vi.fn(async (prompt: string) =>
  prompt.includes('"needed"')
    ? JSON.stringify({ needed: ["1"], reason: "only the routing passage" })
    : JSON.stringify({ pass: true, reason: "supported" })
);

describe("scoreAllMetrics with no deterministic gold", () => {
  it("adds the reference-free context rows after the binary judges, on the same invoker", async () => {
    clearContextRelevanceCache();
    judge.mockClear();

    const metrics = await scoreAllMetrics(fixture, artifact, undefined, { judgeInvoke: judge });

    const names = metrics.map((m) => m.metric);
    const binaryAt = names.indexOf("binary_judge_chat_grounding");
    const precisionAt = names.indexOf("llm_context_precision");
    expect(binaryAt).toBeGreaterThanOrEqual(0);
    expect(precisionAt).toBeGreaterThan(binaryAt);
    expect(metrics[precisionAt]).toMatchObject({ status: "info", score: 0.5 });
    expect(names).toContain("llm_context_waste_tokens");
    expect(judge).toHaveBeenCalledTimes(2);
  });

  it("does not call a judge on a dry run", async () => {
    clearContextRelevanceCache();
    judge.mockClear();

    const metrics = await scoreAllMetrics(fixture, artifact, undefined, {
      judgeInvoke: judge,
      dryRun: true,
    });

    expect(judge).not.toHaveBeenCalled();
    expect(metrics.map((m) => m.metric)).not.toContain("llm_context_precision");
  });

  it("skips the context rows when the fixture has expectedItems", async () => {
    clearContextRelevanceCache();
    judge.mockClear();

    const metrics = await scoreAllMetrics(
      { ...fixture, expectedItems: ["routing"] },
      artifact,
      undefined,
      { judgeInvoke: judge }
    );

    expect(metrics.map((m) => m.metric)).not.toContain("llm_context_precision");
    expect(judge.mock.calls.some(([p]) => p.includes('"needed"'))).toBe(false);
  });
});
