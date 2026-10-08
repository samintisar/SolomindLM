// Applies the saved theme to <html> before first paint, so dark-mode users don't see the light
// theme while the app bundle loads. A blocking classic script in <head>: Vite's module bundle is
// deferred, and the prerendered SEO pages paint their body before it runs.
// Mirrors readStoredTheme + applyTheme in src/shared/contexts/theme.ts (theme.test.ts runs this
// file against them). External file (not inline in index.html) so the Content-Security-Policy
// can block inline scripts.
(function () {
  try {
    if (localStorage.getItem("solomind_theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (_error) {
    // Storage unavailable: stay light; ThemeProvider falls back the same way.
  }
})();
