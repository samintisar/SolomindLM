export type IapRequest =
  | { kind: "iap"; requestId: string; action: "products" | "restore" | "manage" }
  | { kind: "iap"; requestId: string; action: "purchase"; productId: string };

export type ShellWebMessage =
  | { kind: "theme"; theme: "light" | "dark" }
  | { kind: "aiConsent"; granted: boolean }
  | IapRequest;

/** Parses a message the web app sends to the shell; null for anything else (the auth bridge's). */
export function parseShellWebMessage(raw: string): ShellWebMessage | null {
  let msg: {
    type?: unknown;
    theme?: unknown;
    granted?: unknown;
    requestId?: unknown;
    action?: unknown;
    productId?: unknown;
  } | null;
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
  if (msg.type === "shell-web:iap" && typeof msg.requestId === "string" && msg.requestId) {
    if (msg.action === "purchase") {
      return typeof msg.productId === "string" && msg.productId
        ? { kind: "iap", requestId: msg.requestId, action: "purchase", productId: msg.productId }
        : null;
    }
    if (msg.action === "products" || msg.action === "restore" || msg.action === "manage") {
      return { kind: "iap", requestId: msg.requestId, action: msg.action };
    }
  }
  return null;
}
