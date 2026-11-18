/**
 * A studio item's stored `metadata.error` as text. Metadata isn't validated, so only a non-empty
 * string (or an object's non-empty string `message`) is shown; anything else gives `fallback`.
 */
export function studioErrorMessage(error: unknown, fallback = "An unknown error occurred"): string {
  if (typeof error === "string" && error) return error;
  if (typeof error === "object" && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}
