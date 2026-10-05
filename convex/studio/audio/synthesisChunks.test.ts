import { describe, expect, it } from "vitest";
import { buildTranscriptLines, MAX_PARALLEL_CHUNKS, planSynthesisChunks } from "./synthesisChunks";

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

const script = [
  { speaker: "host_a" as const, text: "Hello" },
  { speaker: "host_b" as const, text: "Hi there" },
  { speaker: "host_a" as const, text: "This line failed" },
  { speaker: "host_b" as const, text: "Second chunk" },
];

describe("buildTranscriptLines", () => {
  it("places lines by their durations and each chunk after the previous chunk's MP3", () => {
    const lines = buildTranscriptLines(script, [
      {
        storageId: "a",
        lineTimings: [
          { index: 0, durationMs: 1000 },
          { index: 1, durationMs: 1500 },
        ],
        mp3DurationMs: 2600,
      },
      { storageId: "b", lineTimings: [{ index: 3, durationMs: 800 }], mp3DurationMs: 900 },
    ]);
    expect(lines).toEqual([
      { speaker: "host_a", text: "Hello", startMs: 0, endMs: 1000 },
      { speaker: "host_b", text: "Hi there", startMs: 1000, endMs: 2500 },
      { speaker: "host_b", text: "Second chunk", startMs: 2600, endMs: 3400 },
    ]);
  });

  it("leaves out failed lines and chunks with no audio", () => {
    const lines = buildTranscriptLines(script, [
      { lineTimings: [], mp3DurationMs: 0 },
      { storageId: "b", lineTimings: [{ index: 3, durationMs: 800 }], mp3DurationMs: 900 },
    ]);
    expect(lines).toEqual([{ speaker: "host_b", text: "Second chunk", startMs: 0, endMs: 800 }]);
  });

  it("returns null when a chunk with audio has no timings (a job started before this change)", () => {
    expect(buildTranscriptLines(script, [{ storageId: "a" }])).toBeNull();
  });

  it("returns null when a chunk's MP3 is shorter than the lines inside it", () => {
    expect(
      buildTranscriptLines(script, [
        { storageId: "a", lineTimings: [{ index: 0, durationMs: 1000 }], mp3DurationMs: 500 },
      ])
    ).toBeNull();
  });

  it("returns null when a timing points outside the script", () => {
    expect(
      buildTranscriptLines(script, [
        { storageId: "a", lineTimings: [{ index: 9, durationMs: 1 }], mp3DurationMs: 1 },
      ])
    ).toBeNull();
  });
});
