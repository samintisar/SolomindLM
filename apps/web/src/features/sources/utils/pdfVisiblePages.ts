/** One IntersectionObserver report for a PDF page slot. */
export interface PageVisibilityChange {
  pageNumber: number;
  isIntersecting: boolean;
}

/**
 * Applies a batch of intersection reports to the set of rendered pages.
 * Returns `prev` itself when membership is unchanged, so the state setter bails out
 * instead of re-rendering every page on each observer callback.
 */
export function applyPageVisibilityChanges(
  prev: Set<number>,
  changes: Iterable<PageVisibilityChange>
): Set<number> {
  let next: Set<number> | null = null;
  for (const { pageNumber, isIntersecting } of changes) {
    const current = next ?? prev;
    if (isIntersecting === current.has(pageNumber)) continue;
    next ??= new Set(prev);
    if (isIntersecting) next.add(pageNumber);
    else next.delete(pageNumber);
  }
  if (next === null || setsEqual(prev, next)) return prev;
  return next;
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
