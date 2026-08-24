import { describe, expect, it } from "vitest";
import { createRetrieveClock } from "./retrieveClock";

function createNowSequence(...timestamps: number[]) {
  let index = 0;
  return () => {
    const value = timestamps[Math.min(index, timestamps.length - 1)];
    index += 1;
    return value;
  };
}

describe("createRetrieveClock", () => {
  it("times external-only retrieval around the external fetch window", () => {
    const clock = createRetrieveClock({ now: createNowSequence(100, 160) });

    clock.markExternalStart();
    clock.markExternalEnd();

    expect(clock.getSpan()).toEqual({
      startedAt: 100,
      endedAt: 160,
      durationMs: 60,
    });
  });

  it("keeps a mixed retrieve span open through later notebook retrieval", () => {
    const clock = createRetrieveClock({ now: createNowSequence(100, 140, 220) });

    clock.markExternalStart();
    clock.markExternalEnd();
    clock.markNotebookStart();
    clock.markNotebookEnd();

    expect(clock.getSpan()).toEqual({
      startedAt: 100,
      endedAt: 220,
      durationMs: 120,
    });
  });

  it("starts notebook-only retrieval when the first notebook runner begins", () => {
    const clock = createRetrieveClock({ now: createNowSequence(300, 360) });

    expect(clock.getSpan()).toEqual({
      startedAt: undefined,
      endedAt: undefined,
      durationMs: undefined,
    });

    clock.markNotebookStart();
    clock.markNotebookEnd();

    expect(clock.getSpan()).toEqual({
      startedAt: 300,
      endedAt: 360,
      durationMs: 60,
    });
  });
});
