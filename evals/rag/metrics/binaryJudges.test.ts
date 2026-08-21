import { describe, expect, it } from "vitest";
import type { EvalRunArtifact } from "../types";
import {
  combineChunkContents,
  formatResearchEvidence,
  packChunksForJudge,
  parseBinaryResponse,
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

describe("combineChunkContents", () => {
  it("labels untitled chunks so the judge does not treat them as empty", () => {
    const text = combineChunkContents([
      { id: "1", sourceTitle: "", content: "Routing decomposes a task into specialists." },
      { id: "2", sourceTitle: "   ", content: "Parallelization fans work out to workers." },
    ]);
    expect(text).toContain("chunk 1");
    expect(text).toContain("Routing decomposes a task into specialists.");
    expect(text).not.toMatch(/^\[\]\n/m);
  });

  it("keeps later chunks when packing into a small judge window", () => {
    const text = packChunksForJudge(
      [
        { id: "1", sourceTitle: "First", content: "ALPHA".repeat(200) },
        { id: "2", sourceTitle: "Last", content: "OMEGA unique-tail-token " + "z".repeat(200) },
      ],
      400
    );
    expect(text).toContain("First");
    expect(text).toContain("Last");
    expect(text).toContain("unique-tail-token");
    expect(text.length).toBeLessThanOrEqual(400);
  });
});

describe("formatResearchEvidence ranking", () => {
  it("puts higher-relevance evidence first and skips cookie-wall scrapes", () => {
    const text = formatResearchEvidence(
      stubResearchArtifact({
        evidence: [
          {
            subQuestionId: "q1",
            sourceTitle: "Cookie wall",
            relevanceScore: 0.65,
            content:
              "This website utilizes technologies such as cookies to enable essential site functionality",
          },
          {
            subQuestionId: "q2",
            sourceTitle: "Monetary policy responses to the post-pandemic inflation - CEPR",
            relevanceScore: 0.84,
            content: "Central banks raised policy rates, including the Bank of England to 5.25%.",
          },
        ],
      })
    );
    const ceprAt = text.indexOf("CEPR");
    const cookieAt = text.indexOf("Cookie wall");
    expect(ceprAt).toBeGreaterThanOrEqual(0);
    expect(cookieAt).toBe(-1);
    expect(text).toContain("Bank of England");
    expect(text).not.toContain("enable essential site functionality");
  });
});
