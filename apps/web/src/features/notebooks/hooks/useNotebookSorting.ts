import { useState, useCallback } from "react";
import { NotebookItem } from "@/shared/types/index";

export type SortOption = "date" | "title";

export interface UseNotebookSortingReturn {
  sortOption: SortOption;
  isSortMenuOpen: boolean;
  setSortOption: (option: SortOption) => void;
  setIsSortMenuOpen: (open: boolean) => void;
  getSortedNotebooks: (items: NotebookItem[]) => NotebookItem[];
  toggleSortMenu: () => void;
}

export function useNotebookSorting(): UseNotebookSortingReturn {
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const toggleSortMenu = useCallback(() => {
    setIsSortMenuOpen((prev) => !prev);
  }, []);

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
    isSortMenuOpen,
    setSortOption,
    setIsSortMenuOpen,
    getSortedNotebooks,
    toggleSortMenu,
  };
}
