import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
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
