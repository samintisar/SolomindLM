/**
 * Pure helpers for copying a showcase notebook between deployments (`transfer.ts`). Rows keep
 * their shape; every id, storage id and file URL from the source deployment is rewritten to its
 * copy on the target, and anything left over is reported instead of being written.
 */

/**
 * A whole run of lowercase base-32 characters as long as a Convex document or storage id. Ids are
 * usually 32 characters but not guaranteed to be, and a fixed-length match would take only the
 * start of a longer id, which then neither gets remapped nor reported as a leftover.
 */
const ID_TOKEN = /(?<![0-9a-z])[0-9a-z]{31,37}(?![0-9a-z])/g;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Rewrites every string in `value`: an exact match in `exact` (file URLs) is replaced whole, then
 * any id token found in `ids` is replaced in place. Numbers, booleans and keys are left alone.
 */
export function remapDeep<T>(
  value: T,
  ids: ReadonlyMap<string, string>,
  exact: ReadonlyMap<string, string>
): T {
  const walk = (v: Json): Json => {
    if (typeof v === "string") {
      const whole = exact.get(v);
      if (whole !== undefined) return whole;
      return v.replace(ID_TOKEN, (token) => ids.get(token) ?? token);
    }
    if (Array.isArray(v)) {
      // Embeddings are long number arrays: nothing to rewrite in them.
      if (v.length > 0 && typeof v[0] === "number") return v;
      return v.map(walk);
    }
    if (v !== null && typeof v === "object") {
      const out: { [key: string]: Json } = {};
      for (const [key, inner] of Object.entries(v)) out[key] = walk(inner);
      return out;
    }
    return v;
  };
  return walk(value as Json) as T;
}

/**
 * Source-deployment ids and URLs still present in `value` after remapping: an id from `sourceIds`
 * (one that had no copy) or a string naming the source deployment's host.
 */
export function leftoverSourceRefs(
  value: unknown,
  sourceIds: ReadonlySet<string>,
  sourceHost: string
): string[] {
  const found = new Set<string>();
  const text = JSON.stringify(value);
  for (const token of text.match(ID_TOKEN) ?? []) {
    if (sourceIds.has(token)) found.add(token);
  }
  if (sourceHost && text.includes(sourceHost)) found.add(sourceHost);
  return [...found];
}

/** A row without its system fields, ready to insert on the target. */
export function withoutSystemFields<T extends Record<string, unknown>>(
  row: T
): Omit<T, "_id" | "_creationTime"> {
  const { _id: _ignoredId, _creationTime: _ignoredTime, ...rest } = row;
  return rest;
}
