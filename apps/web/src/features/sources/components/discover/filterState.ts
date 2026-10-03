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

/** How many filters differ from the defaults; academic filters count only while Academic is on. */
export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.timeRange) count += 1;
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) count += 1;
  if (filters.maxResults !== DEFAULT_FILTERS.maxResults) count += 1;
  if (filters.sourceTypes.includes("academic")) {
    count += Object.keys(buildAcademicDiscoveryApiFilters(filters.academic)).length;
  }
  return count;
}

export function isDefaultFilters(filters: FilterState): boolean {
  return (
    filters.sourceTypes.length === 1 &&
    filters.sourceTypes[0] === "web" &&
    !filters.timeRange &&
    filters.sortBy === DEFAULT_FILTERS.sortBy &&
    filters.maxResults === DEFAULT_FILTERS.maxResults &&
    Object.values(filters.academic).every((value) => value === undefined)
  );
}
