import {
  buildAcademicDiscoveryApiFilters,
  type DiscoveryAcademicFilterState,
} from "../AcademicDiscoveryFiltersSection";
import type { SourceType } from "./sourceTypes";

export type { SourceType };

export interface FilterState {
  sourceTypes: SourceType[];
  timeRange?: "day" | "week" | "month" | "year";
  academic: DiscoveryAcademicFilterState;
  sortBy: "relevance" | "date" | "citations";
  maxResults: number;
}

/** Discovery total budget ceiling (Tavily caps `max_results` at 20). */
export const MAX_DISCOVERY_TOTAL_RESULTS = 20;

export const DEFAULT_FILTERS: FilterState = {
  sourceTypes: ["web"],
  sortBy: "relevance",
  maxResults: MAX_DISCOVERY_TOTAL_RESULTS,
  academic: {},
};

/** `value` is `"any"` rather than empty: Radix Select reserves the empty string for "no selection". */
export const TIME_RANGE_OPTIONS = [
  { value: "any", label: "All time" },
  { value: "day", label: "Past day" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
  { value: "year", label: "Past year" },
] as const;

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "date", label: "Newest" },
  { value: "citations", label: "Most cited" },
] as const;

export const RESULT_COUNT_OPTIONS = [5, 10, 15, 20] as const;

/** A partial update: `academic` is itself a partial, merged into the current academic state. */
export type FilterPatch = Partial<Omit<FilterState, "academic">> & {
  academic?: Partial<DiscoveryAcademicFilterState>;
};

/** Applies a patch to the latest state, merging (not replacing) the academic part. */
export function applyFilterPatch(prev: FilterState, patch: FilterPatch): FilterState {
  return {
    ...prev,
    ...patch,
    academic: patch.academic ? { ...prev.academic, ...patch.academic } : prev.academic,
  };
}

/** How many filters differ from the defaults; academic filters count only while Academic is on. */
export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.timeRange) count += 1;
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) count += 1;
  if (filters.maxResults !== DEFAULT_FILTERS.maxResults) count += 1;
  if (filters.sourceTypes.includes("academic")) {
    const api = buildAcademicDiscoveryApiFilters(filters.academic);
    // Count concepts, not API keys: a year range (from and/or to) is one filter.
    if (api.publicationYearFrom != null || api.publicationYearTo != null) count += 1;
    if (api.minCitations != null) count += 1;
    if (api.openAccessOnly) count += 1;
    if (api.hasFullText) count += 1;
    if (api.fieldOfStudyTerms) count += 1;
  }
  return count;
}

/**
 * True when nothing differs from the defaults. The academic part is judged by what would actually
 * be sent, so leftover no-op values (empty field list, "all" years) do not keep Reset enabled.
 */
export function isDefaultFilters(filters: FilterState): boolean {
  const sameSourceTypes =
    new Set(filters.sourceTypes).size === new Set(DEFAULT_FILTERS.sourceTypes).size &&
    filters.sourceTypes.every((type) => DEFAULT_FILTERS.sourceTypes.includes(type));
  return (
    sameSourceTypes &&
    filters.timeRange === DEFAULT_FILTERS.timeRange &&
    filters.sortBy === DEFAULT_FILTERS.sortBy &&
    filters.maxResults === DEFAULT_FILTERS.maxResults &&
    Object.keys(buildAcademicDiscoveryApiFilters(filters.academic)).length === 0
  );
}
