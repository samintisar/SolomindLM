import { describe, expect, it } from "vitest";
import { buildTranscriptLines } from "./transcriptLines";

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

  it("returns null when a timing points outside the script", () => {
    expect(
      buildTranscriptLines(script, [
        { storageId: "a", lineTimings: [{ index: 9, durationMs: 1 }], mp3DurationMs: 1 },
      ])
    ).toBeNull();
  });
});
