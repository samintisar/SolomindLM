import { describe, expect, it } from "vitest";
import type { EvalRunArtifact } from "../types";
import { formatResearchEvidence, parseBinaryResponse } from "./binaryJudges";

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
