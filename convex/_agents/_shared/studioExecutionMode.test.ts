import { describe, expect, it } from "vitest";
import { decideStudioExecutionMode } from "./studioExecutionMode";

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
