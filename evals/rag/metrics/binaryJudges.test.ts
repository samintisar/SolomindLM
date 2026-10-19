import { describe, expect, it, vi } from "vitest";
import type { EvalRunArtifact } from "../types";
import {
  formatChunks,
  formatResearchEvidence,
  parseBinaryResponse,
  RESEARCH_EVIDENCE_LIMIT,
  researchEvidenceForJudge,
  scoreBinaryJudgeMetrics,
} from "./binaryJudges";

function stubResearchArtifact(overrides: Partial<EvalRunArtifact>): EvalRunArtifact {
  return {
    caseId: "research-001-inflation-factors",
    runner: "research",
    configHash: "abc",
    answer: "Inflation is driven by supply shocks.",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 1,
    timestamp: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseBinaryResponse", () => {
  it("parses valid JSON pass", () => {
    const result = parseBinaryResponse('{"pass": true, "reason": "All claims supported"}');
    expect(result.pass).toBe(true);
    expect(result.reason).toBe("All claims supported");
  });

  it("parses valid JSON fail", () => {
    const result = parseBinaryResponse('{"pass": false, "reason": "Hallucinated metric"}');
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("Hallucinated metric");
  });

  it("extracts JSON from surrounding text", () => {
    const result = parseBinaryResponse('Here is my verdict: {"pass": true, "reason": "ok"} done');
    expect(result.pass).toBe(true);
  });

  it("throws when pass is missing", () => {
    expect(() => parseBinaryResponse('{"reason": "no pass field"}')).toThrow(/pass/);
  });
});

describe("formatResearchEvidence", () => {
  it("falls back to selectedChunks when evidence is empty", () => {
    const text = formatResearchEvidence(
      stubResearchArtifact({
        selectedChunks: [
          {
            id: "ev_0",
            sourceTitle: "Are supply shocks a key driver",
            content: "Supply-side factors drive CPI inflation.",
          },
        ],
      })
    );
    expect(text).toContain("Are supply shocks a key driver");
    expect(text).toContain("Supply-side factors");
    expect(text).not.toContain("(no evidence recorded)");
  });

  it("prefers artifact.evidence when present", () => {
    const text = formatResearchEvidence(
      stubResearchArtifact({
        evidence: [
          {
            subQuestionId: "q1",
            sourceTitle: "Evidence paper",
            relevanceScore: 0.9,
            content: "Rate hikes cool demand.",
          },
        ],
        selectedChunks: [{ id: "ev_0", sourceTitle: "Ignored chunk", content: "ignored" }],
      })
    );
    expect(text).toContain("Evidence paper");
    expect(text).not.toContain("Ignored chunk");
  });

  it("keeps up to 2,000 characters of each entry, as the research writer does", () => {
    const text = formatResearchEvidence(
      stubResearchArtifact({
        evidence: [
          {
            subQuestionId: "q1",
            sourceTitle: "Long",
            relevanceScore: 0.9,
            content: `${"x".repeat(1_500)}late fact${"y".repeat(1_000)}`,
          },
        ],
      })
    );
    expect(text).toContain("late fact");
    expect(text.length).toBe("[Long] ".length + 2_000);
  });
});

describe("researchEvidenceForJudge", () => {
  const entry = (i: number) => ({
    subQuestionId: "q1",
    sourceTitle: `S${i}`,
    relevanceScore: 0.5,
    content: "e".repeat(2_000),
  });

  it("says when there is no evidence", () => {
    expect(researchEvidenceForJudge(stubResearchArtifact({}))).toBe("(no evidence recorded)");
  });

  const spread = (subQuestions: number, perSubQuestion: number) =>
    Array.from({ length: subQuestions * perSubQuestion }, (_, i) => ({
      ...entry(i),
      subQuestionId: `q${i % subQuestions}`,
      content: `fact-q${i % subQuestions} ${"e".repeat(2_000)}`,
    }));

  it("keeps the 8 most relevant entries of a sub-question, as the writer does", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...entry(i), relevanceScore: i / 10 }));
    const text = researchEvidenceForJudge(stubResearchArtifact({ evidence: rows }));
    expect(text).toContain("[S9]");
    expect(text).toContain("[S2]");
    expect(text).not.toContain("[S1]");
    expect(text).not.toContain("[S0]");
  });

  it("shrinks entries over the budget so every sub-question stays in", () => {
    const text = researchEvidenceForJudge(stubResearchArtifact({ evidence: spread(20, 8) }));
    expect(text).toContain("fact-q0");
    expect(text).toContain("fact-q19");
    expect(text).not.toContain("cut off");
    expect(text.length).toBeLessThanOrEqual(RESEARCH_EVIDENCE_LIMIT);
  });

  it("marks evidence cut at the total budget", () => {
    const text = researchEvidenceForJudge(stubResearchArtifact({ evidence: spread(40, 8) }));
    expect(text).toContain("[… evidence cut off here for judging]");
    expect(text.length).toBeLessThan(RESEARCH_EVIDENCE_LIMIT + 200);
  });

  it("leaves evidence under the budget unmarked", () => {
    const text = researchEvidenceForJudge(
      stubResearchArtifact({ evidence: Array.from({ length: 10 }, (_, i) => entry(i)) })
    );
    expect(text).not.toContain("cut off");
  });
});

describe("chat judges", () => {
  const fixture = {
    schemaVersion: 1,
    id: "chat-dose",
    question: "How much activity lowered depression risk?",
    runner: "chat",
    notebookId: "nb",
    expectedItems: [],
  } as unknown as Parameters<typeof scoreBinaryJudgeMetrics>[0];

  async function chatPrompts(overrides: Partial<EvalRunArtifact>): Promise<string[]> {
    const prompts: string[] = [];
    const invoke = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return '{"pass": true, "reason": "ok"}';
    });
    await scoreBinaryJudgeMetrics(
      fixture,
      stubResearchArtifact({ runner: "chat", ...overrides }),
      undefined,
      { invoke }
    );
    return prompts;
  }

  // ~30 chunks of a typical answer, untitled, cited by id.
  const selectedChunks = Array.from({ length: 30 }, (_, i) => ({
    id: String(i + 1),
    sourceTitle: "",
    content: `${"c".repeat(590)}FACT${i + 1}`,
  }));

  it("shows the grounding judge every retrieved chunk, numbered by id", async () => {
    const [grounding] = await chatPrompts({ answer: "Risk fell 25% [23].", selectedChunks });
    for (let i = 1; i <= 30; i++) expect(grounding).toContain(`[${i}]\n${"c".repeat(590)}FACT${i}`);
  });

  it("drops whole passages past the budget and tells the grounding judge", async () => {
    const big = Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      sourceTitle: "",
      content: `${"b".repeat(50_000)}END${i + 1}`,
    }));
    const [grounding] = await chatPrompts({ answer: "x", selectedChunks: big });
    expect(grounding).toContain("END4");
    expect(grounding).not.toContain("END5");
    expect(grounding).toContain("[… 2 passages not shown: 5, 6]");
    expect(grounding).toContain("Some retrieved passages were cut off for judging");
  });

  it("shows judges the passage as the model saw it, neighbour previews included", () => {
    const { text } = formatChunks([
      {
        id: "1",
        sourceTitle: "Paper",
        content: "Thresholds were applied.",
        contextText: "Thresholds were applied.\n\nMVPA was self-reported with the IPAQ...",
      },
    ]);
    expect(text).toContain("self-reported with the IPAQ");
  });

  it("skips a passage that does not fit and keeps later ones that do", () => {
    const { text, truncated } = formatChunks(
      [
        { id: "1", sourceTitle: "", content: "a".repeat(24_000) },
        { id: "2", sourceTitle: "", content: "b".repeat(30_000) },
        { id: "3", sourceTitle: "", content: "small fact" },
      ],
      48_000
    );
    expect(text).toContain("[3]\nsmall fact");
    expect(text).not.toContain("b".repeat(100));
    expect(text).toContain("[… 1 passages not shown: 2]");
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(48_000 + 100);
  });

  it("shows a whole-document passage in full by default (list answers use one)", () => {
    const transcript = `${"pattern text. ".repeat(6_000)}there are 21 in the book itself`;
    const { text, truncated } = formatChunks([
      { id: "1", sourceTitle: "Video", content: transcript },
    ]);
    expect(transcript.length).toBeGreaterThan(80_000);
    expect(text).toContain("there are 21 in the book itself");
    expect(truncated).toBe(false);
  });

  it("lets the citation judge map citation markers to chunk ids", async () => {
    const [, citation] = await chatPrompts({
      answer: "Risk fell 25% [7].",
      citations: ["7"],
      selectedChunks,
    });
    expect(citation).toContain("Retrieved chunk ids: 1, 2, 3");
    expect(citation).toContain("30");
  });
});

describe("judge excerpts", () => {
  const fixture = {
    schemaVersion: 1,
    id: "studio-audio-script-only-long",
    question: "Generate a long audio script.",
    runner: "audioScriptOnly",
    notebookId: "nb",
    expectedItems: [],
    expectedBehavior: "Long two-host dialogue script.",
  } as unknown as Parameters<typeof scoreBinaryJudgeMetrics>[0];

  it("tells the judge when a long output was cut for judging, and leaves short ones unmarked", async () => {
    const prompts: string[] = [];
    const invoke = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return '{"pass": true, "reason": "ok"}';
    });

    await scoreBinaryJudgeMetrics(
      fixture,
      stubResearchArtifact({ runner: "audioScriptOnly", answer: "word ".repeat(5000) }),
      undefined,
      { invoke }
    );
    await scoreBinaryJudgeMetrics(
      fixture,
      stubResearchArtifact({ runner: "audioScriptOnly", answer: "A short complete script." }),
      undefined,
      { invoke }
    );

    // A studio artifact with no evidence skips the grounding judge, so only the structure judge
    // calls the invoker.
    const [longPrompts, shortPrompts] = [prompts.slice(0, 1), prompts.slice(1)];
    expect(longPrompts).toHaveLength(1);
    for (const prompt of longPrompts) expect(prompt).toMatch(/cut off here for judging/i);
    for (const prompt of shortPrompts) expect(prompt).not.toMatch(/cut off here for judging/i);
  });
});

describe("studio grounding judge evidence", () => {
  const fixture = {
    schemaVersion: 1,
    id: "studio-report-agentic",
    question: "Write a report on agentic patterns.",
    runner: "report",
    notebookId: "nb",
    expectedItems: [],
    expectedBehavior: "Report grounded in the sources.",
  } as unknown as Parameters<typeof scoreBinaryJudgeMetrics>[0];

  const sourceTexts = [
    { fileName: "agentic-patterns.md", text: "Routing sends each request to a specialist." },
  ];

  it("grounds a chunkless studio artifact in the pack source text", async () => {
    const prompts: string[] = [];
    const invoke = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return '{"pass": false, "reason": "Claims a pattern the sources do not mention."}';
    });
    const results = await scoreBinaryJudgeMetrics(
      fixture,
      stubResearchArtifact({ runner: "report", answer: "Routing sends requests to a specialist." }),
      undefined,
      { invoke, sourceTexts }
    );

    const grounding = prompts.find((p) => p.includes("Source text (complete):"));
    expect(grounding).toBeDefined();
    expect(grounding).toContain("Routing sends each request to a specialist.");
    expect(grounding).toContain("[agentic-patterns.md]");
    expect(results.find((r) => r.metric === "binary_judge_studio_grounding")?.status).toBe("fail");
  });

  it("warns without calling the grounding judge when there is no evidence", async () => {
    const prompts: string[] = [];
    const invoke = vi.fn(async (prompt: string) => {
      prompts.push(prompt);
      return '{"pass": true, "reason": "ok"}';
    });
    const results = await scoreBinaryJudgeMetrics(
      fixture,
      stubResearchArtifact({ runner: "report", answer: "A report." }),
      undefined,
      { invoke }
    );

    const grounding = results.find((r) => r.metric === "binary_judge_studio_grounding");
    expect(grounding?.status).toBe("warn");
    expect(grounding?.score).toBe(0);
    expect(grounding?.detail).toBe(
      "No grounding evidence: studio artifact has no retrieved chunks and no source text (fixture sourceFiles or pack)."
    );
    expect(grounding?.breakdown).toMatchObject({ noEvidence: true });
    // Only the structure judge reaches the invoker; the grounding judge never does.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(prompts.some((p) => p.includes("Source text"))).toBe(false);
    expect(prompts.some((p) => p.includes("Pass if studio output is grounded"))).toBe(false);
  });
});
