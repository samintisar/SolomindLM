/**
 * Parse the value of a `--use-case` flag into pack ids: comma-separated, or
 * `all` for every known pack. Ids themselves are validated by the caller.
 */
export function resolveUseCaseIds(value: string | undefined, knownIds: string[]): string[] {
  const ids = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (value === undefined || value.startsWith("--") || ids.length === 0) {
    throw new Error("--use-case needs a value: <ids,comma-separated> or all");
  }
  return ids.length === 1 && ids[0] === "all" ? [...knownIds] : ids;
}
