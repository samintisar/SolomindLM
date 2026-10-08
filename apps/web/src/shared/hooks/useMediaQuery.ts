import { useCallback, useSyncExternalStore } from "react";

function canMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/**
 * Whether `query` matches right now, kept in sync with viewport changes.
 *
 * Reads `matchMedia` synchronously during render, so the first paint already uses the right
 * value (no flash of the other layout). `fallback` is returned where `matchMedia` is missing
 * (server render, some test environments).
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatchMedia()) return () => undefined;
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => mediaQueryList.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = () => (canMatchMedia() ? window.matchMedia(query).matches : fallback);

  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
