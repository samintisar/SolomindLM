import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PLAYBACK_RATES, useAudioPlayer } from "./useAudioPlayer";

describe("PLAYBACK_RATES", () => {
  it("cycles 1x, 1.25x, 1.5x and 2x", () => {
    expect(PLAYBACK_RATES).toEqual([1, 1.25, 1.5, 2]);
  });
});

describe("useAudioPlayer cyclePlaybackRate", () => {
  it("steps through the rates and wraps back to 1", () => {
    const { result } = renderHook(() => useAudioPlayer(null));
    const seen = [result.current.playbackRate];
    for (let i = 0; i < 4; i++) {
      act(() => result.current.cyclePlaybackRate());
      seen.push(result.current.playbackRate);
    }
    expect(seen).toEqual([1, 1.25, 1.5, 2, 1]);
  });
});
