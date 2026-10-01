export type WebViewLoadError = { kind: "network" } | { kind: "http"; status: number };

export type LoadErrorCopy = {
  title: string;
  message: string;
  /** URL and dev-server hint; null outside development so store builds never show it. */
  devDetails: string | null;
};

export function getLoadErrorCopy(
  error: WebViewLoadError,
  uri: string,
  isDev: boolean
): LoadErrorCopy {
  const copy =
    error.kind === "network"
      ? {
          title: "Can't reach SolomindLM",
          message: "Check your internet connection and try again.",
        }
      : {
          title: "SolomindLM didn't load",
          message: `The server returned an error (HTTP ${error.status}). Try again in a moment.`,
        };

  return {
    ...copy,
    devDetails: isDev
      ? `${uri}\n\nRun \`bun run dev:web\` on your PC. Emulator uses http://10.0.2.2:5173; physical devices need your LAN IP in EXPO_PUBLIC_WEB_URL.`
      : null,
  };
}
