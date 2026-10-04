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

  it("shows documents that fit the budget in full, without a cut label", () => {
    const result = formatSourceTexts(
      [
        { fileName: "a.pdf", text: "x".repeat(10) },
        { fileName: "b.pdf", text: "y".repeat(10) },
      ],
      20
    );
    expect(result).toEqual({
      text: `[a.pdf]\n${"x".repeat(10)}\n\n---\n\n[b.pdf]\n${"y".repeat(10)}`,
      truncated: false,
    });
  });

  it("splits the source budget evenly and labels each cut document", () => {
    const result = formatSourceTexts(
      [
        { fileName: "a.pdf", text: "x".repeat(100) },
        { fileName: "b.pdf", text: "y".repeat(100) },
      ],
      20
    );
    expect(result).toEqual({
      text:
        `[a.pdf] (first 10 of 100 characters shown)\n${"x".repeat(10)}\n\n---\n\n` +
        `[b.pdf] (first 10 of 100 characters shown)\n${"y".repeat(10)}`,
      truncated: true,
    });
  });

  it("gives budget a short document leaves unused to the longer ones", () => {
    const { text } = formatSourceTexts(
      [
        { fileName: "a.pdf", text: "x".repeat(100) },
        { fileName: "b.pdf", text: "y".repeat(4) },
        { fileName: "c.pdf", text: "z".repeat(100) },
      ],
      30
    );
    expect(text).toBe(
      `[a.pdf] (first 13 of 100 characters shown)\n${"x".repeat(13)}\n\n---\n\n` +
        `[b.pdf]\nyyyy\n\n---\n\n` +
        `[c.pdf] (first 13 of 100 characters shown)\n${"z".repeat(13)}`
    );
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
    expect(withChunks).toContain("[c] chunk-src\nchunk text");
    expect(withChunks).not.toContain("[q3.pdf]");

    const outputOnly = buildRubricPrompt(pack, pack.rubric[1], fixture, artifact(), sources);
    expect(outputOnly).not.toContain("Source text");
    expect(outputOnly).not.toContain("[q3.pdf]");
  });

  it("gives a multi-paper pack its whole source text and says it is complete", () => {
    // Four papers the size of the Researchers pack (46K–78K characters each).
    const sources = [46_000, 51_000, 50_000, 78_000].map((n, i) => ({
      fileName: `paper-${i}.pdf`,
      text: `${"p".repeat(n - 4)}END${i}`,
    }));
    const prompt = buildRubricPrompt(pack, pack.rubric[0], fixture, artifact(), sources);
    for (let i = 0; i < 4; i++) expect(prompt).toContain(`END${i}`);
    expect(prompt).toContain("Source text (complete):");
    expect(prompt).not.toContain("characters shown");
  });

  it("tells the judge when documents were cut, so a missing value is not a failure on its own", () => {
    const sources = [0, 1].map((i) => ({ fileName: `big-${i}.pdf`, text: "q".repeat(200_000) }));
    const prompt = buildRubricPrompt(pack, pack.rubric[0], fixture, artifact(), sources);
    expect(prompt).toContain("(first 120000 of 200000 characters shown)");
    expect(prompt).toContain(
      "Do not fail the check only because a value is missing from a document that was cut off."
    );
    expect(prompt).not.toContain("Source text (complete):");
  });

  it("shows every retrieved chunk of a typical chat answer", () => {
    const selectedChunks = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      sourceTitle: "paper.pdf",
      content: `${"c".repeat(990)}CHUNK${i}`,
    }));
    const prompt = buildRubricPrompt(
      pack,
      pack.rubric[0],
      fixture,
      artifact({ selectedChunks } as Partial<EvalRunArtifact>),
      []
    );
    for (let i = 0; i < 30; i++) expect(prompt).toContain(`CHUNK${i}`);
    expect(prompt).toContain("Source passages retrieved for this answer:");
  });

  it("flags a single passage cut at the budget as truncated", () => {
    const prompt = buildRubricPrompt(
      pack,
      pack.rubric[0],
      fixture,
      artifact({
        selectedChunks: [{ id: "1", sourceTitle: "", content: "h".repeat(60_000) }],
      } as Partial<EvalRunArtifact>),
      []
    );
    expect(prompt).toContain("[… passage cut off here]");
    expect(prompt).toContain(
      "Do not fail the check only because a value is missing from a document that was cut off."
    );
  });

  it("numbers passages by chunk id so the answer's citation markers point at them", () => {
    // Chat answers cite retrieved chunks by id ([7]); chunks often have no source title.
    const prompt = buildRubricPrompt(
      pack,
      pack.rubric[0],
      fixture,
      artifact({
        answer: "Risk was 25% lower [7].",
        selectedChunks: [{ id: "7", sourceTitle: "", content: "25% lower risk" }],
      } as Partial<EvalRunArtifact>),
      []
    );
    expect(prompt).toContain("[7]\n25% lower risk");
    expect(prompt).toContain(
      "Citation markers such as [7] in the output refer to the passage with that number."
    );
  });

  it("marks an output that was cut for judging as truncated", () => {
    const long = buildRubricPrompt(
      pack,
      pack.rubric[1],
      fixture,
      artifact({ answer: "z".repeat(40_001) }),
      []
    );
    expect(long).toContain(
      `${"z".repeat(40_000)}\n[… output truncated at 40000 chars for judging]`
    );
    expect(long).not.toContain("z".repeat(40_001));

    const short = buildRubricPrompt(
      pack,
      pack.rubric[1],
      fixture,
      artifact({ answer: "z".repeat(40_000) }),
      []
    );
    expect(short).not.toContain("output truncated");
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
    expect(result.status).toBe("warn");
    expect(result.detail).toMatch(/^Rubric judge failed:/);
    expect(result.breakdown).toMatchObject({ judgeError: true });
  });
});
