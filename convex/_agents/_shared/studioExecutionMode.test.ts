import { describe, expect, it } from "vitest";
import { decideStudioExecutionMode, selectStudioMapBatches } from "./studioExecutionMode";

describe("decideStudioExecutionMode", () => {
  it("returns single_pass for a one-doc tiny notebook", () => {
    expect(
      decideStudioExecutionMode({
        documentCount: 1,
        selectedChunkCount: 5,
        estimatedContextTokens: 2000,
      })
    ).toBe("single_pass");
  });

  it("returns map_reduce for 12 documents regardless of chunk and token counts", () => {
    expect(
      decideStudioExecutionMode({
        documentCount: 12,
        selectedChunkCount: 3,
        estimatedContextTokens: 500,
      })
    ).toBe("map_reduce");
  });

  it("returns map_reduce when selected chunks exceed 8", () => {
    expect(
      decideStudioExecutionMode({
        documentCount: 1,
        selectedChunkCount: 9,
        estimatedContextTokens: 2000,
      })
    ).toBe("map_reduce");
  });

  it("returns map_reduce when estimated context tokens exceed 4000", () => {
    expect(
      decideStudioExecutionMode({
        documentCount: 1,
        selectedChunkCount: 5,
        estimatedContextTokens: 4001,
      })
    ).toBe("map_reduce");
  });
});

describe("selectStudioMapBatches", () => {
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  const pack = (chunks: string[]) => chunks.map((chunk) => `packed:${chunk}`);

  it("returns a single joined batch for a one-doc tiny notebook", () => {
    const chunks = ["alpha", "beta"];
    expect(
      selectStudioMapBatches({
        documentCount: 1,
        chunks,
        estimateTokens,
        pack,
      })
    ).toEqual({
      mode: "single_pass",
      batches: ["alpha\n\nbeta"],
    });
  });

  it("uses pack() for map_reduce when document count is high", () => {
    const chunks = ["a", "b", "c"];
    expect(
      selectStudioMapBatches({
        documentCount: 12,
        chunks,
        estimateTokens,
        pack,
      })
    ).toEqual({
      mode: "map_reduce",
      batches: ["packed:a", "packed:b", "packed:c"],
    });
  });

  it("returns no batches for empty chunks", () => {
    expect(
      selectStudioMapBatches({
        documentCount: 1,
        chunks: [],
        estimateTokens,
        pack,
      })
    ).toEqual({ mode: "map_reduce", batches: [] });
  });
});
