import { describe, expect, it } from "vitest";
import type { EvalFixture, EvalRunArtifact } from "../types";
import { researchSourceBreadth } from "./sourceAware";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "research-breadth-test",
  runner: "research",
  question: "Q?",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "test",
  tags: ["research"],
  sourcePolicy: { channels: ["web", "academic"], maxResultsPerChannel: 8 },
};

function researchArtifact(
  chunks: EvalRunArtifact["selectedChunks"],
  sourcePolicy?: EvalRunArtifact["sourcePolicy"]
): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "research",
    configHash: "hash",
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: chunks,
    subQueries: [],
    latencyMs: 0,
    timestamp: new Date().toISOString(),
    sourcePolicy: sourcePolicy ?? fixture.sourcePolicy,
  };
}

describe("researchSourceBreadth", () => {
  it("passes when at least 8 unique external sources", () => {
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      id: `ev_${i}`,
      sourceTitle: `Title ${i}`,
      sourceUrl: `https://example.com/${i}`,
      content: "body",
    }));
    const result = researchSourceBreadth(fixture, researchArtifact(chunks));
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });

  it("warns between 4 and 7 unique sources", () => {
    const chunks = Array.from({ length: 5 }, (_, i) => ({
      id: `ev_${i}`,
      sourceTitle: `Title ${i}`,
      sourceUrl: `https://example.com/${i}`,
      content: "body",
    }));
    const result = researchSourceBreadth(fixture, researchArtifact(chunks));
    expect(result.status).toBe("warn");
    expect(result.score).toBe(0.5);
  });

  it("fails below 4 unique sources (regression for thin retrieval)", () => {
    const chunks = [
      { id: "ev_0", sourceTitle: "A", sourceUrl: "https://a.com", content: "x" },
      { id: "ev_1", sourceTitle: "B", sourceUrl: "https://b.com", content: "y" },
      { id: "ev_2", sourceTitle: "C", sourceUrl: "https://c.com", content: "z" },
    ];
    const result = researchSourceBreadth(fixture, researchArtifact(chunks));
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("skips breadth check for notebook-only policies", () => {
    const notebookFixture: EvalFixture = {
      ...fixture,
      sourcePolicy: { channels: ["notebook"], maxResultsPerChannel: 8 },
    };
    const result = researchSourceBreadth(
      notebookFixture,
      researchArtifact(
        [{ id: "ev_0", sourceTitle: "Doc", content: "x" }],
        notebookFixture.sourcePolicy
      )
    );
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("Notebook-only");
  });
});
