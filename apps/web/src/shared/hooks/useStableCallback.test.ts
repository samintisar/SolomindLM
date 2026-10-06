// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStableCallback } from "./useStableCallback";

describe("useStableCallback", () => {
  test("keeps one identity and calls the latest function", () => {
    const first = vi.fn((n: number) => n + 1);
    const second = vi.fn((n: number) => n + 2);
    const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), {
      initialProps: { fn: first },
    });
    const stable = result.current;
    expect(stable(1)).toBe(2);
    rerender({ fn: second });
    expect(result.current).toBe(stable);
    expect(stable(1)).toBe(3);
    expect(first).toHaveBeenCalledTimes(1);
  });
});
