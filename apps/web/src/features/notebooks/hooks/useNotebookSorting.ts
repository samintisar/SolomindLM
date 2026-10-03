import { useCallback, useState } from "react";
import { NotebookItem } from "@/shared/types/index";

export type SortOption = "date" | "title";

export interface UseNotebookSortingReturn {
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
  getSortedNotebooks: (items: NotebookItem[]) => NotebookItem[];
}

export function useNotebookSorting(): UseNotebookSortingReturn {
  const [sortOption, setSortOption] = useState<SortOption>("date");

  const getSortedNotebooks = useCallback(
    (items: NotebookItem[]) => {
      return [...items].sort((a, b) => {
        if (sortOption === "date") {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        return a.title.localeCompare(b.title);
      });
    },
    [sortOption]
  );

  return {
    sortOption,
    setSortOption,
    getSortedNotebooks,
  };
}
