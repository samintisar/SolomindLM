/**
 * Normalize discovery action results.
 * Tavily returns an array; academic search returns `{ sources }`.
 */
export type DiscoveredSourceRow = {
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  abstract?: string;
  score?: number;
  rawContent?: string;
};

export function sourcesFromDiscoverResult(results: unknown): DiscoveredSourceRow[] {
  if (Array.isArray(results)) {
    return results.filter((row): row is DiscoveredSourceRow => !!row && typeof row === "object");
  }
  if (
    results &&
    typeof results === "object" &&
    "sources" in results &&
    Array.isArray((results as { sources: unknown }).sources)
  ) {
    return (results as { sources: unknown[] }).sources.filter(
      (row): row is DiscoveredSourceRow => !!row && typeof row === "object"
    );
  }
  return [];
}
