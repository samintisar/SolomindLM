import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import type { UseCasePack } from "../usecases/types";
import {
  buildRubricPrompt,
  formatSourceTexts,
  rubricMetricName,
  scoreRubricMetrics,
} from "./rubric";

const pack: UseCasePack = {
  id: "professionals",
  title: "Professionals",
  notebookTitle: "Professionals",
  advertisedClaim: "Summarize industry reports",
  features: ["report", "quiz"],
  sources: ["q3.pdf"],
  rubric: [
    {
      id: "figures-match",
      question: "Does every figure match the source?",
      appliesTo: ["report"],
      evidence: "sources",
    },
    {
      id: "conclusion-first",
      question: "Does it lead with the conclusion?",
      appliesTo: ["report"],
      evidence: "output",
    },
    { id: "quiz-only", question: "Quiz check?", appliesTo: ["quiz"], evidence: "output" },
  ],
};

const fixture = {
  id: "professionals/report-01",
  question: "Summarize the Q3 report",
} as EvalFixture;

function artifact(overrides: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: "professionals/report-01",
    runner: "report",
    configHash: "h",
    answer: "Revenue grew 12%.",
    selectedChunks: [],
    ...overrides,
  } as EvalRunArtifact;
}

describe("rubric prompts", () => {
  it("names metrics rubric:<pack>:<check>", () => {
    expect(rubricMetricName("professionals", "figures-match")).toBe(
      "rubric:professionals:figures-match"
    );
  });

  it("splits the source budget evenly across documents", () => {
    const text = formatSourceTexts(
      [
        { fileName: "a.pdf", text: "x".repeat(100) },
        { fileName: "b.pdf", text: "y".repeat(100) },
      ],
      20
    );
    expect(text).toBe(`[a.pdf]\n${"x".repeat(10)}\n\n---\n\n[b.pdf]\n${"y".repeat(10)}`);
  });

  it("includes source text only for evidence: sources, preferring retrieved chunks", () => {
    const sources = [{ fileName: "q3.pdf", text: "Revenue grew 12% in Q3." }];
    const withSources = buildRubricPrompt(pack, pack.rubric[0], fixture, artifact(), sources);
    expect(withSources).toContain("Does every figure match the source?");
    expect(withSources).toContain("[q3.pdf]\nRevenue grew 12% in Q3.");
    expect(withSources).toContain("Revenue grew 12%.");

    const withChunks = buildRubricPrompt(
      pack,
      pack.rubric[0],
      fixture,
      artifact({
        selectedChunks: [{ id: "c", sourceTitle: "chunk-src", content: "chunk text" }],
      } as Partial<EvalRunArtifact>),
      sources
    );
    expect(withChunks).toContain("[chunk-src]\nchunk text");
    expect(withChunks).not.toContain("[q3.pdf]");

    const outputOnly = buildRubricPrompt(pack, pack.rubric[1], fixture, artifact(), sources);
    expect(outputOnly).not.toContain("Source excerpts:");
  });
});

describe("scoreRubricMetrics", () => {
  it("runs only checks for the artifact's runner and maps verdicts", async () => {
    const verdicts = [
      '{"pass": true, "reason": "all figures match"}',
      '{"pass": false, "reason": "buries the conclusion"}',
    ];
    const results = await scoreRubricMetrics(fixture, artifact(), pack, {
      invoke: async () => verdicts.shift() ?? "",
      model: "judge-model",
    });
    expect(results.map((r) => [r.metric, r.status, r.detail])).toEqual([
      ["rubric:professionals:figures-match", "pass", "all figures match"],
      ["rubric:professionals:conclusion-first", "fail", "buries the conclusion"],
    ]);
    expect(results[0]).toMatchObject({
      caseId: "professionals/report-01",
      runner: "report",
      score: 1,
    });
  });

  it("tags judge failures as judgeError instead of a quality verdict", async () => {
    const [result] = await scoreRubricMetrics(
      fixture,
      artifact(),
      { ...pack, rubric: [pack.rubric[1]] },
      {
        invoke: async () => "We need to think about this…",
        model: "judge-model",
      }
    );
    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/^Rubric judge failed:/);
    expect(result.breakdown).toMatchObject({ judgeError: true });
  });
});
