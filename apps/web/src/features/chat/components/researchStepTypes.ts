export interface LiteratureReviewStepCounts {
  recordsIdentified?: number;
  recordsAfterDedupe?: number;
  recordsRanked?: number;
  recordsScreened?: number;
  recordsIncluded?: number;
  recordsExcluded?: number;
  extractedRowCount?: number;
}

export interface ResearchStep {
  type: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  title: string;
  description: string;
  details?: string;
  searchQueries?: string[];
  papersFound?: number;
  prismaCounts?: LiteratureReviewStepCounts;
}

export function parseResearchStepMetadata(metadata: unknown): {
  searchQueries?: string[];
  papersFound?: number;
  prismaCounts?: LiteratureReviewStepCounts;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const record = metadata as Record<string, unknown>;
  const searchQueries = Array.isArray(record.searchQueries)
    ? record.searchQueries.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : undefined;
  const papersFound = typeof record.papersFound === "number" ? record.papersFound : undefined;

  const num = (key: keyof LiteratureReviewStepCounts) =>
    typeof record[key] === "number" ? (record[key] as number) : undefined;

  const prismaCounts: LiteratureReviewStepCounts = {
    recordsIdentified: num("recordsIdentified"),
    recordsAfterDedupe: num("recordsAfterDedupe"),
    recordsRanked: num("recordsRanked"),
    recordsScreened: num("recordsScreened"),
    recordsIncluded: num("recordsIncluded"),
    recordsExcluded: num("recordsExcluded"),
    extractedRowCount: num("extractedRowCount"),
  };
  const hasPrisma = Object.values(prismaCounts).some((v) => v != null);

  return {
    searchQueries,
    papersFound,
    prismaCounts: hasPrisma ? prismaCounts : undefined,
  };
}

/** Parse newline-separated search queries from step details (legacy rows). */
export function extractSearchQueriesFromDetails(details: string): string[] | undefined {
  const fromNewlines = details
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^(Found|Ranked|Screened|Generated|Complete)\b/i.test(l));

  if (fromNewlines.length >= 1) {
    return fromNewlines;
  }

  if (/^(Found|Ranked|Screened|Generated|Complete)\b/i.test(details.trim())) {
    return undefined;
  }

  const trimmed = details.trim();
  return trimmed.length > 0 ? [trimmed] : undefined;
}
