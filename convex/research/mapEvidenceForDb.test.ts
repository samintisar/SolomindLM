import { describe, expect, test } from "vitest";
import { mapAgentEvidenceForSave } from "./mapEvidenceForDb";

describe("mapAgentEvidenceForSave", () => {
  test("maps documentId string to Id and drops empty metadata", () => {
    const out = mapAgentEvidenceForSave([
      {
        subQuestionId: "sq1",
        sourceType: "notebook",
        sourceTitle: "Doc",
        content: "hello",
        iteration: 0,
        metadata: { documentId: "k17abc123" as unknown as string, chunkIndex: 2 },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.metadata?.documentId).toBe("k17abc123");
    expect(out[0]!.metadata?.chunkIndex).toBe(2);
  });

  // #558: authors and year were dropped here, so every citation read "(Unknown, n.d.)".
  test("keeps paper authors, year and identifiers", () => {
    const out = mapAgentEvidenceForSave([
      {
        subQuestionId: "sq1",
        sourceType: "academic",
        sourceTitle: "Distributed practice in verbal recall tasks",
        content: "abstract",
        iteration: 0,
        metadata: {
          authors: ["Nicholas J. Cepeda", "Harold Pashler"],
          year: 2006,
          doi: "10.1037/0033-2909.132.3.354",
          citationCount: 2500,
          sourceApi: "openalex",
          pdfUrl: "https://example.org/paper.pdf",
        },
      },
    ]);
    expect(out[0]!.metadata).toEqual({
      authors: ["Nicholas J. Cepeda", "Harold Pashler"],
      year: 2006,
      doi: "10.1037/0033-2909.132.3.354",
      citationCount: 2500,
      sourceApi: "openalex",
      pdfUrl: "https://example.org/paper.pdf",
    });
  });

  test("omits metadata when only empty fields are set", () => {
    const out = mapAgentEvidenceForSave([
      {
        subQuestionId: "sq1",
        sourceType: "web",
        sourceTitle: "T",
        content: "c",
        iteration: 1,
        metadata: { authors: [], domain: undefined },
      },
    ]);
    expect(out[0]!.metadata).toBeUndefined();
  });

  test("omits metadata when no fields set", () => {
    const out = mapAgentEvidenceForSave([
      {
        subQuestionId: "sq1",
        sourceType: "notebook",
        sourceTitle: "T",
        content: "c",
        iteration: 1,
      },
    ]);
    expect(out[0]!.metadata).toBeUndefined();
  });
});
