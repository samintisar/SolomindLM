import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let reduceMotion = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => reduceMotion,
}));

import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  beforeEach(() => {
    reduceMotion = false;
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  it("eases from 0 up to the target over the duration", () => {
    const { result } = renderHook(() => useCountUp(10, 900));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(10);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current).toBe(10);
  });

  it("shows the target at once under reduced motion", () => {
    reduceMotion = true;
    const { result } = renderHook(() => useCountUp(7));
    expect(result.current).toBe(7);
  });

  it("follows a new target", () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 100), {
      initialProps: { target: 3 },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(3);
    rerender({ target: 5 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(5);
  });

  it("lands exactly on a fractional target", () => {
    const { result } = renderHook(() => useCountUp(2.5, 100));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(2.5);
  });

  it("eases from the value shown when the target changes", () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 100), {
      initialProps: { target: 3 },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(3);
    rerender({ target: 5 });
    const seen: number[] = [];
    for (let elapsed = 0; elapsed < 200; elapsed += 16) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      seen.push(result.current);
    }
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(3);
    expect(result.current).toBe(5);
  });

  it("returns the target at once for a zero duration", () => {
    const { result } = renderHook(() => useCountUp(4, 0));
    expect(result.current).toBe(4);
  });
});
