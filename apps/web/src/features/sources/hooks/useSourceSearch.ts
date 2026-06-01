import { useMemo, useState } from "react";
import { Source } from "@/shared/types";

interface UseSourceSearchResult {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredSources: Source[];
}

/**
 * Custom hook for searching and filtering sources
 */
export function useSourceSearch(sources: Source[]): UseSourceSearchResult {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSources = useMemo(() => {
    if (!searchQuery.trim()) return sources;
    const query = searchQuery.toLowerCase();
    return sources.filter((source) => source.title.toLowerCase().includes(query));
  }, [sources, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredSources,
  };
}
