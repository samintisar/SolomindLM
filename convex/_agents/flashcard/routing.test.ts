import { describe, expect, it } from "vitest";
import { routeToMap } from "./routing";
import type { OverallStateType } from "./state";

const chunkA = "Alpha ".repeat(40);
const chunkB = "Beta ".repeat(40);

function makeState(overrides: Partial<OverallStateType> = {}): OverallStateType {
  return {
    documentIds: ["doc-1"],
    chunks: [chunkA, chunkB],
    cardCount: 12,
    difficulty: "medium",
    topic: undefined,
    mapOutputs: [],
    collapsedOutputs: [],
    finalOutput: [],
    status: "generating",
    reduceRetryCount: 0,
    progress: { phase: "initializing", percentage: 0, message: "Initializing..." },
    onStatusUpdate: undefined,
    ...overrides,
  } as OverallStateType;
}

describe("routeToMap", () => {
  it("returns skip_map for a one-doc tiny notebook", () => {
    expect(routeToMap(makeState())).toBe("skip_map");
  });

  it("returns Send fan-out for multi-document notebooks", () => {
    const result = routeToMap(
      makeState({ documentIds: Array.from({ length: 12 }, (_, index) => `doc-${index + 1}`) })
    );

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      throw new Error(`Expected Send[] but received ${result}`);
    }
    expect(result.length).toBeGreaterThan(0);
  });
});
