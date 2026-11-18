import { ReactNode, useCallback, useEffect, useState } from "react";
import { getNativeWebViewBridge } from "@/utils/platformDetection";
import { type Theme, ThemeContext } from "./useTheme";

const STORAGE_KEY = "solomind_theme";

function readStoredTheme(): Theme {
  const storedTheme = localStorage.getItem(STORAGE_KEY);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

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
      localStorage.setItem(STORAGE_KEY, newTheme);
      return newTheme;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}
