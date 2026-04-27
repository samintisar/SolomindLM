"use node";

/**
 * Standard mapOutputs reducer: concat parallel map batches; `null` means reset to [].
 * (A bare `[]` is truthy in JS, so the old `y ? x.concat(y) : x` could not clear.)
 */
export function mapOutputsMergeReducer<T>(x: T[], y: T[] | null | undefined): T[] {
  if (y === null) return [];
  if (y === undefined) return x;
  return x.concat(y);
}

/**
 * LangGraph: fields that concatenate incoming updates with existing arrays must not be
 * re-emitted in a node return. Spreading `...state` includes the current array, and
 * the reducer will concat it again, duplicating all prior items.
 *
 * When you must pass most of `state` through, use these helpers to omit concat keys.
 */
export function withoutMapOutputs<T>(state: T): Omit<T, "mapOutputs"> {
  const { mapOutputs: _m, ...rest } = state as T & { mapOutputs?: unknown };
  return rest as Omit<T, "mapOutputs">;
}

export function withoutExtractedConcepts<T>(state: T): Omit<T, "extractedConcepts"> {
  const { extractedConcepts: _e, ...rest } = state as T & { extractedConcepts?: unknown };
  return rest as Omit<T, "extractedConcepts">;
}

export function withoutResearchEvidence<T>(state: T): Omit<T, "evidence"> {
  const { evidence: _ev, ...rest } = state as T & { evidence?: unknown };
  return rest as Omit<T, "evidence">;
}
