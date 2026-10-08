import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { getNativeWebViewBridge } from "@/utils/platformDetection";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "./theme";
import { ThemeContext } from "./useTheme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read synchronously so the first render already matches the class that
  // public/theme-init.js put on <html> before first paint (no light -> dark flip).
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);

    // Let the mobile shell match its status-bar inset to the web theme.
    try {
      getNativeWebViewBridge()?.postMessage(JSON.stringify({ type: "shell-web:theme", theme }));
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => {
      const newTheme = prevTheme === "light" ? "dark" : "light";
      storeTheme(newTheme);
      return newTheme;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
