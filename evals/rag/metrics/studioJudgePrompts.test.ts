import { describe, expect, it, vi } from "vitest";
import type { EvalFixture, EvalRunArtifact, StudioRunnerKind } from "../types";
import { scoreBinaryJudgeMetrics } from "./binaryJudges";

const fixture = {
  schemaVersion: 1,
  id: "studio-case",
  question: "Make studio output about the sources.",
  runner: "report",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Output grounded in the sources.",
  expectedStructure: { minItems: 3, requiredSections: ["Summary", "Findings"] },
  tags: [],
} as unknown as EvalFixture;

function studioArtifact(
  runner: StudioRunnerKind,
  answer = "Some studio output.",
  withChunks = true
): EvalRunArtifact {
  return {
    caseId: "studio-case",
    runner,
    configHash: "abc",
    answer,
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: withChunks
      ? [{ id: "1", sourceTitle: "Notes", content: "Routing sends each request to a specialist." }]
      : [],
    subQueries: [],
    latencyMs: 1,
    timestamp: "2026-10-17T00:00:00.000Z",
  };
}

/** Runs the studio judges with a stub that returns `verdict`, and returns every prompt sent. */
async function runStudioJudges(
  artifact: EvalRunArtifact,
  verdict = '{"pass": true, "reason": "ok"}',
  sourceTexts?: Array<{ fileName: string; text: string }>
) {
  const prompts: string[] = [];
  const invoke = vi.fn(async (prompt: string) => {
    prompts.push(prompt);
    return verdict;
  });
  const results = await scoreBinaryJudgeMetrics(fixture, artifact, undefined, {
    invoke,
    sourceTexts,
  });
  return { prompts, results };
}

const grounding = (prompts: string[]) =>
  prompts.find(
    (p) => p.includes("against the notebook passages") || p.includes("source text it was made from")
  );
const structure = (prompts: string[]) => prompts.find((p) => p.includes("checking the structure"));

describe("studio grounding criteria by kind", () => {
  const expected: Array<[StudioRunnerKind, string]> = [
    ["flashcards", "every card's front and back are supported by the sources"],
    ["flashcards", "no card contradicts them"],
    ["quiz", "each correct option is supported by the sources"],
    ["quiz", "no distractor is also correct according to the sources"],
    ["quiz", "the explanations do not invent facts"],
    ["report", "substantive claims and figures are supported by the sources (minor phrasing ok)"],
    [
      "audioScript",
      "substantive claims and figures are supported by the sources (minor phrasing ok)",
    ],
    [
      "audioScriptOnly",
      "substantive claims and figures are supported by the sources (minor phrasing ok)",
    ],
    ["mindmap", "the node labels name concepts that are present in the sources"],
    ["spreadsheet", "cell values and categories are traceable to the sources"],
    ["writtenQuestions", "the questions and model answers are supported by the sources"],
  ];

  it.each(expected)("%s grounding prompt carries its criterion (%s)", async (kind, criterion) => {
    const { prompts } = await runStudioJudges(studioArtifact(kind));
    const prompt = grounding(prompts);
    expect(prompt).toBeDefined();
    expect(prompt).toContain(criterion);
  });

  it("gives the source-text path the same per-kind criterion", async () => {
    const { prompts } = await runStudioJudges(studioArtifact("quiz", "Q?", false), undefined, [
      { fileName: "notes.md", text: "The source." },
    ]);
    const prompt = grounding(prompts);
    expect(prompt).toContain("Source text (complete):");
    expect(prompt).toContain("no distractor is also correct according to the sources");
  });

  it("keeps the generic line for infographics, which the vision judge covers", async () => {
    const { prompts } = await runStudioJudges(studioArtifact("infographic"));
    const prompt = grounding(prompts);
    expect(prompt).toContain("Pass only if substantive claims are supported by the evidence");
    expect(prompt).not.toContain("every card's front and back");
  });
});

describe("studio structure criteria by kind", () => {
  const expected: Array<[StudioRunnerKind, string]> = [
    ["flashcards", "non-empty list of cards"],
    ["quiz", "an answer key that names one of its options"],
    ["report", "required section heading"],
    ["audioScript", "every turn has a speaker"],
    ["audioScriptOnly", "every turn has a speaker"],
    ["mindmap", "a root node"],
    ["spreadsheet", "header row"],
    ["writtenQuestions", "every question has a model answer"],
  ];

  it.each(expected)("%s structure prompt carries its expectation (%s)", async (kind, criterion) => {
    const { prompts } = await runStudioJudges(studioArtifact(kind, "Output", false));
    const prompt = structure(prompts);
    expect(prompt).toBeDefined();
    expect(prompt).toContain(criterion);
  });

  it("states the min items, required sections and the truncation note", async () => {
    const long = "x".repeat(12_000);
    const { prompts } = await runStudioJudges(studioArtifact("report", long, false));
    const prompt = structure(prompts);
    expect(prompt).toContain("Min items: 3");
    expect(prompt).toContain("Required sections: Summary, Findings");
    expect(prompt).toMatch(/cut off here for judging/i);
  });
});

describe("studio judge verdict parsing", () => {
  it("still maps pass and fail verdicts onto the metric status", async () => {
    const passing = await runStudioJudges(
      studioArtifact("quiz"),
      '{"pass": true, "reason": "supported"}'
    );
    expect(passing.results.find((r) => r.metric === "binary_judge_studio_grounding")?.status).toBe(
      "pass"
    );
    const failing = await runStudioJudges(
      studioArtifact("quiz"),
      '{"pass": false, "reason": "distractor is also correct"}'
    );
    const grounding = failing.results.find((r) => r.metric === "binary_judge_studio_grounding");
    expect(grounding?.status).toBe("fail");
    expect(grounding?.detail).toBe("distractor is also correct");
  });

  it("still runs the same two judges for a studio artifact with evidence", async () => {
    const { results } = await runStudioJudges(studioArtifact("flashcards"));
    expect(results.map((r) => r.metric).toSorted()).toEqual([
      "binary_judge_studio_grounding",
      "binary_judge_studio_structure",
    ]);
  });
});
