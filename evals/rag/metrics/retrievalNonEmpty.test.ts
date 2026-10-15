import { describe, expect, it } from "vitest";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact } from "../types";
import { retrievalNonEmpty } from "./index";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "tensor-shape",
  runner: "chat",
  question: "What do these sources say about tensor shape?",
  notebookId: "nb",
  expectedItems: [],
  expectedBehavior: "Answers from the sources",
  tags: [],
};

const chunk: ChunkSnapshot = {
  id: "c1",
  sourceTitle: "Tensors",
  content: "Tensor attributes describe their shape, datatype, and device.",
  rankingScore: 0.6,
};

function artifact(partial: Partial<EvalRunArtifact> = {}): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "chat",
    configHash: "h",
    answer: "a",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [chunk],
    subQueries: ["tensor shape definition"],
    latencyMs: 10,
    timestamp: "2026-10-15T00:00:00.000Z",
    ...partial,
  };
}

// No expected-item or citation metric fails a case whose answer drew on no passages at all.
describe("retrievalNonEmpty", () => {
  it("passes when passages reached the answer and every search ran", () => {
    expect(retrievalNonEmpty(fixture, artifact()).status).toBe("pass");
  });

  it("fails when no passage reached the answer", () => {
    const result = retrievalNonEmpty(fixture, artifact({ selectedChunks: [] }));

    expect(result.status).toBe("fail");
    expect(result.detail).toMatch(/no passages/i);
  });

  it("fails when a sub-query search failed, even if others found passages", () => {
    const result = retrievalNonEmpty(
      fixture,
      artifact({
        subQueries: ["tensor shape definition", "tensor shape properties"],
        failedSubQueries: ["tensor shape properties"],
      })
    );

    expect(result.status).toBe("fail");
    expect(result.detail).toContain("1 of 2");
    expect(result.detail).toContain("tensor shape properties");
  });

  it("does not apply when the turn searched nothing (a clarifying question or direct reply)", () => {
    const result = retrievalNonEmpty(fixture, artifact({ selectedChunks: [], subQueries: [] }));

    expect(result.status).toBe("info");
  });

  it("does not apply when the case does not search the notebook", () => {
    const result = retrievalNonEmpty(
      { ...fixture, sourcePolicy: { channels: ["web"] } },
      artifact({ selectedChunks: [] })
    );

    expect(result.status).toBe("info");
  });
});
