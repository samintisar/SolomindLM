import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJustFinished } from "./useJustFinished";

type Props = { status: string | undefined };

describe("useJustFinished", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is true for a moment after generating turns into completed", () => {
    const { result, rerender } = renderHook(({ status }: Props) => useJustFinished(status, 1000), {
      initialProps: { status: "generating" },
    });
    expect(result.current).toBe(false);
    rerender({ status: "completed" });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it("stays false for a note that mounts already completed", () => {
    const { result } = renderHook(({ status }: Props) => useJustFinished(status), {
      initialProps: { status: "completed" },
    });
    expect(result.current).toBe(false);
  });

  it("stays false when generation fails", () => {
    const { result, rerender } = renderHook(({ status }: Props) => useJustFinished(status), {
      initialProps: { status: "generating" },
    });
    rerender({ status: "failed" });
    expect(result.current).toBe(false);
  });
});
