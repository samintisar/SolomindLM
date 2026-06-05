/**
 * Pure helpers for interpreting per-chunk map results stored on report metadata.
 */

/** True when a stored map result is an error marker or cannot be parsed as success JSON. */
export function isFailedMapResult(raw: unknown): boolean {
  try {
    const parsed: unknown = JSON.parse(String(raw));
    return Boolean(
      parsed && typeof parsed === "object" && (parsed as { _error?: boolean })._error === true
    );
  } catch {
    return true;
  }
}
