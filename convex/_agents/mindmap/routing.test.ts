import { describe, expect, it } from "vitest";
import { createMapTasks } from "./routing";
import type { OverallStateType } from "./state";

const chunkA = "Alpha ".repeat(40);
const chunkB = "Beta ".repeat(40);

function makeState(overrides: Record<string, unknown> = {}): OverallStateType {
  return {
    allChunks: [chunkA, chunkB],
    documentIds: ["doc-1"],
    permanentMapFailures: 0,
    extractedConcepts: [],
    finalOutput: null,
    status: "generating",
    progress: { phase: "initializing", percentage: 0, message: "Initializing..." },
    ...overrides,
  } as OverallStateType;
}

describe("createMapTasks", () => {
  it("returns skip_map for a one-doc tiny notebook", () => {
    expect(createMapTasks(makeState())).toBe("skip_map");
  });

  it("returns Send fan-out for multi-document notebooks", () => {
    const result = createMapTasks(
      makeState({ documentIds: Array.from({ length: 12 }, (_, index) => `doc-${index + 1}`) })
    );

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      throw new Error(`Expected Send[] but received ${result}`);
    }
    expect(result.length).toBeGreaterThan(0);
  });
});
