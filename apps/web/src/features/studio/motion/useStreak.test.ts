// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStreak } from "./useStreak";

describe("useStreak", () => {
  it("counts consecutive successes and resets on a miss", () => {
    const { result } = renderHook(() => useStreak());
    act(() => result.current.record(true));
    act(() => result.current.record(true));
    expect(result.current.streak).toBe(2);
    act(() => result.current.record(false));
    expect(result.current.streak).toBe(0);
    act(() => result.current.record(true));
    expect(result.current.streak).toBe(1);
  });

  it("resets on demand", () => {
    const { result } = renderHook(() => useStreak());
    act(() => result.current.record(true));
    act(() => result.current.reset());
    expect(result.current.streak).toBe(0);
  });

  it("restores an earlier count", () => {
    const { result } = renderHook(() => useStreak());
    act(() => result.current.record(true));
    act(() => result.current.record(true));
    act(() => result.current.record(true));
    act(() => result.current.restore(2));
    expect(result.current.streak).toBe(2);
  });
});
