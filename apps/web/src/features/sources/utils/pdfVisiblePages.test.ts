import { describe, expect, test } from "vitest";
import { applyPageVisibilityChanges } from "./pdfVisiblePages";

describe("applyPageVisibilityChanges", () => {
  test("adds pages that start intersecting and removes pages that stop", () => {
    const prev = new Set([1, 2]);
    const next = applyPageVisibilityChanges(prev, [
      { pageNumber: 1, isIntersecting: false },
      { pageNumber: 3, isIntersecting: true },
    ]);

    expect([...next].sort()).toEqual([2, 3]);
    expect(next).not.toBe(prev);
    expect([...prev].sort()).toEqual([1, 2]);
  });

  test("returns the same set when every report matches current membership", () => {
    const prev = new Set([1, 2]);
    const next = applyPageVisibilityChanges(prev, [
      { pageNumber: 1, isIntersecting: true },
      { pageNumber: 2, isIntersecting: true },
      { pageNumber: 5, isIntersecting: false },
    ]);

    expect(next).toBe(prev);
  });

  test("returns the same set for an empty batch", () => {
    const prev = new Set([4]);
    expect(applyPageVisibilityChanges(prev, [])).toBe(prev);
  });

  test("returns the same set when changes within a batch cancel out", () => {
    const prev = new Set([1]);
    const next = applyPageVisibilityChanges(prev, [
      { pageNumber: 2, isIntersecting: true },
      { pageNumber: 2, isIntersecting: false },
    ]);

    expect(next).toBe(prev);
  });

  test("the last report for a page wins", () => {
    const prev = new Set<number>();
    const next = applyPageVisibilityChanges(prev, [
      { pageNumber: 2, isIntersecting: false },
      { pageNumber: 2, isIntersecting: true },
    ]);

    expect([...next]).toEqual([2]);
  });
});
