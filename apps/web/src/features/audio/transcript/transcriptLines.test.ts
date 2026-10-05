import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeLineIndex,
  currentLineIndex,
  estimateLines,
  type ReaderLine,
  resolveReaderLines,
} from "./transcriptLines";

const savedLines: ReaderLine[] = [
  { speaker: "host_a", text: "Welcome back.", startMs: 0, endMs: 1500 },
  { speaker: "host_b", text: "Glad to be here.", startMs: 1500, endMs: 3200 },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveReaderLines", () => {
  it("returns saved lines as exact", () => {
    const result = resolveReaderLines({ lines: savedLines }, "ignored", 10);
    expect(result).toEqual({ lines: savedLines, approximate: false, timed: true });
  });

  it("estimates from character counts when there are no saved lines", () => {
    const result = resolveReaderLines({}, "aaaa\n\n  bb  \ncccccc\n", 12);
    expect(result.approximate).toBe(true);
    expect(result.lines.map((l) => l.text)).toEqual(["aaaa", "bb", "cccccc"]);
    expect(result.lines.every((l) => l.speaker === null)).toBe(true);
    expect(result.lines[0]?.startMs).toBe(0);
    expect(result.lines[2]?.endMs).toBe(12000);
    // 4 / 12 chars of 12s = 4s, then 2 / 12 = 2s
    expect(result.lines[0]?.endMs).toBe(4000);
    expect(result.lines[1]?.startMs).toBe(4000);
    expect(result.lines[1]?.endMs).toBe(6000);
    expect(result.lines[2]?.startMs).toBe(6000);
  });

  it("treats undefined or non-object metadata as no saved lines", () => {
    expect(resolveReaderLines(undefined, "one", 5).approximate).toBe(true);
    expect(resolveReaderLines(null, "one", 5).approximate).toBe(true);
    expect(resolveReaderLines("nope", "one", 5).approximate).toBe(true);
  });

  const malformed: Array<[string, unknown]> = [
    ["a negative time", [{ speaker: "host_a", text: "x", startMs: -1, endMs: 5 }]],
    ["endMs before startMs", [{ speaker: "host_a", text: "x", startMs: 10, endMs: 5 }]],
    [
      "starts going backwards",
      [
        { speaker: "host_a", text: "x", startMs: 100, endMs: 200 },
        { speaker: "host_b", text: "y", startMs: 50, endMs: 300 },
      ],
    ],
    ["non-string text", [{ speaker: "host_a", text: 4, startMs: 0, endMs: 5 }]],
    ["an unknown speaker", [{ speaker: "host_c", text: "x", startMs: 0, endMs: 5 }]],
    ["a non-array value", { speaker: "host_a" }],
    ["a non-finite time", [{ speaker: "host_a", text: "x", startMs: 0, endMs: Number.NaN }]],
  ];

  it.each(malformed)("falls back to the estimate and warns once for %s", (_name, lines) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = resolveReaderLines({ lines }, "first\nsecond", 10);
    expect(result.approximate).toBe(true);
    expect(result.lines.map((l) => l.text)).toEqual(["first", "second"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when lines are simply absent", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveReaderLines({}, "first", 10);
    expect(warn).not.toHaveBeenCalled();
  });

  it("gives every estimated line zero timings while the duration is unknown", () => {
    const result = resolveReaderLines({}, "one\ntwo", 0);
    expect(result.lines).toHaveLength(2);
    for (const line of result.lines) {
      expect(line.startMs).toBe(0);
      expect(line.endMs).toBe(0);
    }
  });

  it("returns no lines for an empty transcript", () => {
    expect(resolveReaderLines({}, "", 10)).toEqual({ lines: [], approximate: true, timed: true });
    expect(resolveReaderLines({}, " \n\n ", 10).lines).toEqual([]);
  });

  it("treats an empty saved lines array as absent, not malformed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = resolveReaderLines({ lines: [] }, "a\nb", 4);
    expect(result.approximate).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("estimateLines", () => {
  it("spreads the duration over the lines by character count", () => {
    const lines = estimateLines("aaaa\nbb\ncccccc", 12);
    expect(lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [0, 4000],
      [4000, 6000],
      [6000, 12000],
    ]);
  });

  it("starts at 0 and ends at the duration even when the shares do not divide evenly", () => {
    const lines = estimateLines("one\ntwo\nthree", 10.001);
    expect(lines[0]?.startMs).toBe(0);
    expect(lines[2]?.endMs).toBe(10001);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]?.startMs).toBe(lines[i - 1]?.endMs);
    }
  });

  it("drops blank lines and returns nothing for an empty transcript", () => {
    expect(estimateLines("a\n\n  \nb", 2).map((l) => l.text)).toEqual(["a", "b"]);
    expect(estimateLines("", 5)).toEqual([]);
  });
});

describe("timed", () => {
  it("is true for saved lines and for an estimate with a known duration", () => {
    expect(resolveReaderLines({ lines: savedLines }, "x", 0).timed).toBe(true);
    expect(resolveReaderLines({}, "a\nb", 10).timed).toBe(true);
  });

  it("is false for an estimate made before the duration is known", () => {
    expect(resolveReaderLines({}, "a\nb", 0).timed).toBe(false);
    expect(resolveReaderLines({}, "a\nb", Number.NaN).timed).toBe(false);
  });
});

describe("currentLineIndex", () => {
  it("is -1 for an untimed estimate, whatever the time", () => {
    const resolved = resolveReaderLines({}, "a\nb", 0);
    expect(currentLineIndex(resolved, 0)).toBe(-1);
    expect(currentLineIndex(resolved, 5000)).toBe(-1);
  });

  it("follows the lines once they are timed", () => {
    const resolved = resolveReaderLines({ lines: savedLines }, "", 0);
    expect(currentLineIndex(resolved, 0)).toBe(0);
    expect(currentLineIndex(resolved, 2000)).toBe(1);
    const estimated = resolveReaderLines({}, "aaaa\nbbbb", 8);
    expect(currentLineIndex(estimated, 5000)).toBe(1);
  });
});

describe("activeLineIndex", () => {
  const lines: ReaderLine[] = [
    { speaker: null, text: "a", startMs: 1000, endMs: 2000 },
    { speaker: null, text: "b", startMs: 2500, endMs: 4000 },
    { speaker: null, text: "c", startMs: 4000, endMs: 6000 },
  ];

  it("is -1 before the first line starts, and for no lines", () => {
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 999)).toBe(-1);
    expect(activeLineIndex([], 500)).toBe(-1);
  });

  it("returns the last line whose start is at or before the time", () => {
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 2499)).toBe(0);
    expect(activeLineIndex(lines, 2500)).toBe(1);
    expect(activeLineIndex(lines, 4000)).toBe(2);
  });

  it("counts the gap after a line as that line", () => {
    expect(activeLineIndex(lines, 2200)).toBe(0);
  });

  it("returns the last line past the end", () => {
    expect(activeLineIndex(lines, 999999)).toBe(2);
  });

  it("handles many lines", () => {
    const many: ReaderLine[] = Array.from({ length: 1000 }, (_, i) => ({
      speaker: null,
      text: String(i),
      startMs: i * 10,
      endMs: i * 10 + 10,
    }));
    expect(activeLineIndex(many, 5003)).toBe(500);
  });
});
