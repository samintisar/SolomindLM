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
});
