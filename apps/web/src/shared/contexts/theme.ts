/**
 * The app theme is an in-app toggle stored in localStorage. It does not follow the OS
 * `prefers-color-scheme`: with no saved choice the app is light.
 *
 * `apps/web/public/theme-init.js` applies the saved theme to <html> before first paint with the
 * same key and rule; theme.test.ts runs that script to keep the two in sync.
 */
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "solomind_theme";

const DEFAULT_THEME: Theme = "light";

export function parseTheme(value: string | null | undefined): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** The saved theme, or light when nothing valid is saved or storage is unavailable. */
export function readStoredTheme(storage: Pick<Storage, "getItem"> = localStorage): Theme {
  try {
    return parseTheme(storage.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode, quota): the choice lasts for this page only */
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle("dark", theme === "dark");
}
