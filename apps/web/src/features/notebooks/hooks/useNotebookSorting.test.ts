// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { useNotebookSorting } from "./useNotebookSorting";

const notebook = (id: string, title: string, date: string): NotebookItem => ({
  id,
  title,
  date,
  sourceCount: 0,
});

const notebooks = [
  notebook("a", "Biology", "2026-01-02T00:00:00Z"),
  notebook("b", "Algebra", "2026-03-01T00:00:00Z"),
  notebook("c", "Chemistry", "2025-12-31T00:00:00Z"),
];

describe("useNotebookSorting", () => {
  it("sorts newest first by default, without changing the input", () => {
    const { result } = renderHook(() => useNotebookSorting());
    const input = [...notebooks];
    expect(result.current.getSortedNotebooks(input).map((n) => n.id)).toEqual(["b", "a", "c"]);
    expect(input).toEqual(notebooks);
  });

  it("sorts A to Z by title", () => {
    const { result } = renderHook(() => useNotebookSorting());
    act(() => result.current.setSortOption("title"));
    expect(result.current.getSortedNotebooks(notebooks).map((n) => n.title)).toEqual([
      "Algebra",
      "Biology",
      "Chemistry",
    ]);
  });

  // HomePage memoizes the sorted lists on this function, so it must change only with the option.
  it("keeps the same sort function until the sort option changes", () => {
    const { result, rerender } = renderHook(() => useNotebookSorting());
    const first = result.current.getSortedNotebooks;
    rerender();
    expect(result.current.getSortedNotebooks).toBe(first);
    act(() => result.current.setSortOption("title"));
    expect(result.current.getSortedNotebooks).not.toBe(first);
  });
});
