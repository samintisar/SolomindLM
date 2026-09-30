import { describe, expect, it } from "vitest";
import { MAX_PARALLEL_CHUNKS, planSynthesisChunks } from "./synthesisChunks";

describe("planSynthesisChunks", () => {
  it("keeps short scripts in one chunk", () => {
    expect(planSynthesisChunks(1)).toEqual([{ start: 0, end: 1 }]);
    expect(planSynthesisChunks(40)).toEqual([{ start: 0, end: 40 }]);
  });

  it("uses 40-line chunks until the parallel limit is reached", () => {
    expect(planSynthesisChunks(41)).toEqual([
      { start: 0, end: 40 },
      { start: 40, end: 41 },
    ]);
    expect(planSynthesisChunks(100)).toEqual([
      { start: 0, end: 40 },
      { start: 40, end: 80 },
      { start: 80, end: 100 },
    ]);
    expect(planSynthesisChunks(240)).toHaveLength(6);
  });

  it("grows chunks instead of adding more past the parallel limit", () => {
    expect(planSynthesisChunks(420)).toEqual(
      Array.from({ length: 6 }, (_, i) => ({ start: i * 70, end: (i + 1) * 70 }))
    );
  });

  it("covers every line exactly once, in order, within the parallel limit", () => {
    for (let lineCount = 1; lineCount <= 1000; lineCount += 1) {
      const chunks = planSynthesisChunks(lineCount);
      expect(chunks.length).toBeLessThanOrEqual(MAX_PARALLEL_CHUNKS);
      expect(chunks[0].start).toBe(0);
      expect(chunks.at(-1)?.end).toBe(lineCount);
      for (let i = 1; i < chunks.length; i += 1) {
        expect(chunks[i].start).toBe(chunks[i - 1].end);
      }
    }
  });

  it("plans nothing for an empty script", () => {
    expect(planSynthesisChunks(0)).toEqual([]);
  });
});
