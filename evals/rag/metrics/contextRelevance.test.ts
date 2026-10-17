import { describe, expect, it, vi } from "vitest";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact } from "../types";
import {
  CONTEXT_RELEVANCE_CHUNK_CHARS,
  clearContextRelevanceCache,
  parseContextRelevance,
  scoreContextRelevance,
} from "./contextRelevance";

const fixture = (partial: Partial<EvalFixture> = {}): EvalFixture => ({
  schemaVersion: 1,
  id: "ref-free-case",
  runner: "chat",
  question: "How does prompt chaining split work into steps?",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Explains prompt chaining",
  tags: [],
  ...partial,
});

const chunk = (id: string, content: string): ChunkSnapshot => ({
  id,
  sourceTitle: "Patterns",
  content,
});

const FOUR = [
  chunk("1", "Prompt chaining feeds the output of one model call into the next step."),
  chunk("2", "Unrelated note about the office coffee machine and its cleaning schedule."),
  chunk("3", "Each link in the chain checks the previous output before it continues."),
  chunk("4", "A list of tools that the agent may call during a long task run."),
];

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "ref-free-case",
    runner: "chat",
    configHash: "h",
    answer: "answer",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: FOUR,
    subQueries: ["prompt chaining steps"],
    latencyMs: 10,
    timestamp: "2026-10-17T00:00:00.000Z",
    ...partial,
  };
}

const reply = (needed: string[], reason = "because") => JSON.stringify({ needed, reason });

function stub(response: string | ((prompt: string) => string) = reply(["1", "3"])) {
  return vi.fn(async (prompt: string) =>
    typeof response === "function" ? response(prompt) : response
  );
}

describe("scoreContextRelevance", () => {
  it("reports the needed share of selected chunks and the tokens spent on unneeded ones", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["1", "3"]));
    const [precision, waste] = await scoreContextRelevance(fixture(), artifact(), {
      invoke,
      model: "judge",
    });

    expect(precision).toMatchObject({
      metric: "llm_context_precision",
      status: "info",
      score: 0.5,
    });
    expect(precision.breakdown).toMatchObject({
      needed: ["1", "3"],
      unneeded: ["2", "4"],
    });

    const unneededChars = FOUR[1].content.length + FOUR[3].content.length;
    expect(waste).toMatchObject({
      metric: "llm_context_waste_tokens",
      status: "info",
      score: Math.ceil(unneededChars / 4),
    });
    expect(waste.breakdown).toMatchObject({ unneeded: ["2", "4"] });
  });

  it("makes one judge call per artifact", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["1"]));
    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("lists each selected chunk as [id] followed by the first 1200 characters of its content", async () => {
    clearContextRelevanceCache();
    const long = `${"x".repeat(CONTEXT_RELEVANCE_CHUNK_CHARS)}TAIL`;
    const invoke = stub(reply([]));
    await scoreContextRelevance(
      fixture(),
      artifact({
        selectedChunks: [{ id: "9", sourceTitle: "s", content: long, contextText: "PREVIEW ..." }],
      }),
      { invoke, model: "judge" }
    );
    const prompt = invoke.mock.calls[0][0];
    expect(prompt).toContain(`[9] ${"x".repeat(CONTEXT_RELEVANCE_CHUNK_CHARS)}`);
    expect(prompt).not.toContain("TAIL");
    expect(prompt).not.toContain("PREVIEW");
    expect(prompt).toContain(fixture().question);
  });

  it("caches so a repeat with the same chunks does not pay for the judge again", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["2"]));
    const first = await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    const second = await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not reuse a verdict when the same ids hold different content", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["1"]));
    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    const otherContent = FOUR.map((c, i) =>
      i === 0 ? { ...c, content: "A different passage that happens to sit at id 1." } : c
    );
    await scoreContextRelevance(fixture(), artifact({ selectedChunks: otherContent }), {
      invoke,
      model: "judge",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a verdict across judge models", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["1"]));
    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge-a" });
    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge-b" });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a verdict for a different question", async () => {
    clearContextRelevanceCache();
    const invoke = stub(reply(["2"]));
    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    await scoreContextRelevance(fixture({ question: "Another question entirely?" }), artifact(), {
      invoke,
      model: "judge",
    });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("reports a malformed judge response as warn with judgeError, and does not cache it", async () => {
    clearContextRelevanceCache();
    const invoke = stub("this is not json at all");
    const rows = await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });

    expect(rows.map((r) => [r.metric, r.status])).toEqual([
      ["llm_context_precision", "warn"],
      ["llm_context_waste_tokens", "warn"],
    ]);
    for (const row of rows) expect(row.breakdown).toMatchObject({ judgeError: true });

    await scoreContextRelevance(fixture(), artifact(), { invoke, model: "judge" });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("drops ids that were not selected and reports them", async () => {
    clearContextRelevanceCache();
    const [precision] = await scoreContextRelevance(fixture(), artifact(), {
      invoke: stub(reply(["1", "99"])),
      model: "judge",
    });
    expect(precision.score).toBe(0.25);
    expect(precision.breakdown).toMatchObject({ needed: ["1"], unknownIds: ["99"] });
  });

  it("is skipped when the fixture has deterministic gold", async () => {
    clearContextRelevanceCache();
    const invoke = stub();
    expect(
      await scoreContextRelevance(fixture({ expectedItems: ["routing"] }), artifact(), {
        invoke,
        model: "judge",
      })
    ).toEqual([]);
    expect(
      await scoreContextRelevance(fixture({ expectedPassages: ["a passage"] }), artifact(), {
        invoke,
        model: "judge",
      })
    ).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is skipped when there are no selected chunks", async () => {
    clearContextRelevanceCache();
    const invoke = stub();
    expect(
      await scoreContextRelevance(fixture(), artifact({ selectedChunks: [] }), {
        invoke,
        model: "judge",
      })
    ).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is skipped for non-chat artifacts", async () => {
    clearContextRelevanceCache();
    const invoke = stub();
    expect(
      await scoreContextRelevance(fixture(), artifact({ runner: "research" }), {
        invoke,
        model: "judge",
      })
    ).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("parseContextRelevance", () => {
  it("reads the JSON object wrapped in prose", () => {
    expect(
      parseContextRelevance('Sure: {"needed": ["1"], "reason": "r"} done', ["1", "2"])
    ).toEqual({
      needed: ["1"],
      unknownIds: [],
      reason: "r",
    });
  });

  it("throws when needed is missing or not a list of strings", () => {
    expect(() => parseContextRelevance('{"reason": "r"}', ["1"])).toThrow(/needed/);
    expect(() => parseContextRelevance('{"needed": [1, 2]}', ["1"])).toThrow(/needed/);
  });
});
