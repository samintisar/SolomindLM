import { useCallback, useState } from "react";
import { NotebookItem } from "@/shared/types/index";

export type SortOption = "date" | "title";

export interface UseNotebookSortingReturn {
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
  getSortedNotebooks: (items: NotebookItem[]) => NotebookItem[];
}

/**
 * A sorted copy: newest first by `date`, or A to Z by title. Each date is parsed once up front,
 * not on every comparison.
 */
function sortNotebooks(items: NotebookItem[], sortOption: SortOption): NotebookItem[] {
  if (sortOption === "title") {
    return [...items].sort((a, b) => a.title.localeCompare(b.title));
  }
  return items
    .map((item) => ({ item, time: new Date(item.date).getTime() }))
    .sort((a, b) => b.time - a.time)
    .map(({ item }) => item);
}

export function useNotebookSorting(): UseNotebookSortingReturn {
  const [sortOption, setSortOption] = useState<SortOption>("date");

  const getSortedNotebooks = useCallback(
    (items: NotebookItem[]) => sortNotebooks(items, sortOption),
    [sortOption]
  );

  return {
    sortOption,
    setSortOption,
    getSortedNotebooks,
  };
}
