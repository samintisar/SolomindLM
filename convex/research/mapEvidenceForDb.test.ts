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
