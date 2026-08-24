import { describe, expect, it } from "vitest";
import { AudioOverviewGraph } from "./AudioOverviewGraph";
import type { OverallStateType } from "./state";

const chunkA = "Alpha ".repeat(40);
const chunkB = "Beta ".repeat(40);

function makeState(overrides: Record<string, unknown> = {}): OverallStateType {
  return {
    documentIds: ["doc-1"],
    chunks: [chunkA, chunkB],
    audioType: "deep_dive",
    length: "default",
    focus: undefined,
    ...overrides,
  } as OverallStateType;
}

describe("AudioOverviewGraph.routeToMap", () => {
  const graph = Object.create(AudioOverviewGraph.prototype) as AudioOverviewGraph;

  it("returns skip_map for a one-doc tiny notebook", () => {
    expect(graph.routeToMap(makeState())).toBe("skip_map");
  });

  it("returns Send fan-out for multi-document notebooks", () => {
    const result = graph.routeToMap(
      makeState({ documentIds: Array.from({ length: 12 }, (_, index) => `doc-${index + 1}`) })
    );

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      throw new Error(`Expected Send[] but received ${result}`);
    }
    expect(result.length).toBeGreaterThan(0);
  });
});
