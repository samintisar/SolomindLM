import { describe, expect, it, vi } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { clearContextRelevanceCache } from "./contextRelevance";
import { scoreAllMetrics } from "./scorers";

const QUOTE = "Routing sends each request to the specialist that can answer it best.";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "retrieval-only-case",
  runner: "chat",
  question: "What does routing do?",
  notebookId: "nb",
  expectedItems: ["routing"],
  expectedPassages: [QUOTE],
  expectedBehavior: "Explains routing and cites the notes",
  tags: [],
};

const artifact = (partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact => ({
  caseId: "retrieval-only-case",
  runner: "chat",
  configHash: "h",
  answer: "",
  citations: ["1"],
  preRerankChunks: [{ id: "1", sourceTitle: "Patterns", content: QUOTE }],
  postRerankChunks: [{ id: "1", sourceTitle: "Patterns", content: QUOTE }],
  selectedChunks: [{ id: "1", sourceTitle: "Patterns", content: QUOTE }],
  subQueries: ["routing"],
  latencyMs: 10,
  timestamp: "2026-10-17T00:00:00.000Z",
  ...partial,
});

/** Every judge prompt gets a valid reply, so a judge that runs would show up as a row. */
const judge = vi.fn(async (prompt: string) =>
  prompt.includes('"needed"')
    ? JSON.stringify({ needed: ["1"], reason: "r" })
    : JSON.stringify({ pass: true, reason: "ok" })
);

describe("scoreAllMetrics on a retrieval-only artifact", () => {
  it("runs no judge and no answer metric", async () => {
    clearContextRelevanceCache();
    judge.mockClear();

    const metrics = await scoreAllMetrics(fixture, artifact({ retrievalOnly: true }), undefined, {
      judgeInvoke: judge,
    });

    expect(judge).not.toHaveBeenCalled();
    const names = metrics.map((m) => m.metric);
    for (const skipped of [
      "binary_judge_chat_grounding",
      "binary_judge_citation_valid",
      "citation_validity",
      "abstention_correctness",
      "llm_context_precision",
      "llm_context_waste_tokens",
    ]) {
      expect(names).not.toContain(skipped);
    }
  });

  it("keeps the retrieval-side and budget metrics", async () => {
    const metrics = await scoreAllMetrics(fixture, artifact({ retrievalOnly: true }), undefined, {
      judgeInvoke: judge,
    });

    const names = metrics.map((m) => m.metric);
    for (const kept of [
      "retrieval_nonempty",
      "retrieval_item_recall_pre_rerank",
      "retrieval_item_recall_selected",
      "retrieval_precision_at_k",
      "retrieval_ndcg_at_k",
      "passage_recall_selected",
      "passage_precision_selected",
      "passage_ndcg_selected",
      "latency_cost_budget",
      "context_token_budget_ratio",
    ]) {
      expect(names).toContain(kept);
    }
  });

  it("reports expected_item_recall as info for a retrieval-only run", async () => {
    const metrics = await scoreAllMetrics(fixture, artifact({ retrievalOnly: true }), undefined, {
      judgeInvoke: judge,
    });

    const recall = metrics.find((m) => m.metric === "expected_item_recall");
    expect(recall?.status).toBe("info");
    expect(recall?.detail).toMatch(/^retrieval-only run/);
  });

  it("does run the judges for the same artifact without the flag (control)", async () => {
    clearContextRelevanceCache();
    judge.mockClear();

    const metrics = await scoreAllMetrics(fixture, artifact(), undefined, { judgeInvoke: judge });

    expect(judge).toHaveBeenCalled();
    expect(metrics.map((m) => m.metric)).toContain("binary_judge_chat_grounding");
  });
});
