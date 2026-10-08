// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  test("reads the current match on the first render and follows change events", () => {
    let matches = true;
    const listeners = new Set<() => void>();
    const matchMedia = vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    vi.stubGlobal("matchMedia", matchMedia);

    const { result, unmount } = renderHook(() => useMediaQuery("(min-width: 48rem)"));
    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 48rem)");

    matches = false;
    act(() => {
      for (const listener of listeners) listener();
    });
    expect(result.current).toBe(false);

    unmount();
    expect(listeners.size).toBe(0);
  });

  test("returns the fallback when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);

    expect(renderHook(() => useMediaQuery("(min-width: 48rem)", true)).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery("(min-width: 48rem)")).result.current).toBe(false);
  });
});
