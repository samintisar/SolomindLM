import { describe, expect, it, vi } from "vitest";
import type { EvalRunArtifact } from "../types";
import {
  formatResearchEvidence,
  parseBinaryResponse,
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

    const [longPrompts, shortPrompts] = [prompts.slice(0, 2), prompts.slice(2)];
    expect(longPrompts).toHaveLength(2);
    for (const prompt of longPrompts) expect(prompt).toMatch(/cut off here for judging/i);
    for (const prompt of shortPrompts) expect(prompt).not.toMatch(/cut off here for judging/i);
  });
});
