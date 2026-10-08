import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/shared/contexts/ThemeContext";
import { useTheme } from "@/shared/contexts/useTheme";

// Minimal localStorage stub for jsdom environments where it may not be fully available
const localStorageStore = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageStore.set(key, value),
  removeItem: (key: string) => localStorageStore.delete(key),
  clear: () => localStorageStore.clear(),
  get length() {
    return localStorageStore.size;
  },
  key: (_index: number) => null,
};

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorageStore.clear();
    vi.stubGlobal("localStorage", localStorageStub);
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderThemeHook() {
    return renderHook(() => useTheme(), { wrapper: ThemeProvider });
  }

  it("throws when useTheme is used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(
      "useTheme must be used within a ThemeProvider"
    );
    spy.mockRestore();
  });

  it("defaults to light theme", () => {
    const { result } = renderThemeHook();
    expect(result.current.theme).toBe("light");
  });

  it("loads theme from localStorage", () => {
    localStorage.setItem("solomind_theme", "dark");
    const { result } = renderThemeHook();
    expect(result.current.theme).toBe("dark");
  });

  it("ignores invalid localStorage value", () => {
    localStorage.setItem("solomind_theme", "invalid");
    const { result } = renderThemeHook();
    expect(result.current.theme).toBe("light");
  });

  it("toggles from light to dark", () => {
    const { result } = renderThemeHook();
    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
  });

  it("toggles from dark to light", () => {
    localStorage.setItem("solomind_theme", "dark");
    const { result } = renderThemeHook();
    expect(result.current.theme).toBe("dark");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
  });

  it("persists theme to localStorage on toggle", () => {
    const { result } = renderThemeHook();

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.getItem("solomind_theme")).toBe("dark");
  });

  it("applies dark class to document element when dark", () => {
    localStorage.setItem("solomind_theme", "dark");
    renderThemeHook();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("renders the saved theme on the first render, with no light -> dark flip", () => {
    localStorage.setItem("solomind_theme", "dark");
    const seen: string[] = [];
    renderHook(
      () => {
        const { theme } = useTheme();
        seen.push(theme);
      },
      { wrapper: ThemeProvider }
    );

    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(["dark"]));
  });

  it("keeps the context value stable across re-renders that don't change the theme", () => {
    const { result, rerender } = renderThemeHook();
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("reports the theme to the native shell bridge", () => {
    localStorage.setItem("solomind_theme", "dark");
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    try {
      const { result } = renderThemeHook();
      expect(postMessage).toHaveBeenLastCalledWith(
        JSON.stringify({ type: "shell-web:theme", theme: "dark" })
      );

      act(() => {
        result.current.toggleTheme();
      });

      expect(postMessage).toHaveBeenLastCalledWith(
        JSON.stringify({ type: "shell-web:theme", theme: "light" })
      );
    } finally {
      delete window.ReactNativeWebView;
    }
  });

  it("removes dark class when toggling to light", () => {
    localStorage.setItem("solomind_theme", "dark");
    const { result } = renderThemeHook();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.toggleTheme();
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
