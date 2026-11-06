export type ShellWebMessage =
  | { kind: "theme"; theme: "light" | "dark" }
  | { kind: "aiConsent"; granted: boolean };

/** Parses a message the web app sends to the shell; null for anything else (the auth bridge's). */
export function parseShellWebMessage(raw: string): ShellWebMessage | null {
  let msg: { type?: unknown; theme?: unknown; granted?: unknown } | null;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object") return null;
  if (msg.type === "shell-web:theme" && (msg.theme === "light" || msg.theme === "dark")) {
    return { kind: "theme", theme: msg.theme };
  }
  if (msg.type === "shell-web:ai-consent" && typeof msg.granted === "boolean") {
    return { kind: "aiConsent", granted: msg.granted };
  }
  return null;
}
