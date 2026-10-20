import { parseCsvDetailed, serializeCsv } from "../../_shared/csv.helpers.js";

/**
 * Row planning for the spreadsheet reduce (#451). Asked to write the whole table at once, the
 * reduce picked its own rows and made one of every entity in the notes: works a survey cites,
 * examples inside a paper, products a source only mentions. The finalize phase now asks for the
 * row list first, the reduce writes those rows, and these helpers hold the table to that list.
 */

/** Past this many rows a plan is no help (a financial statement has hundreds of figures). */
export const MAX_PLANNED_ROWS = 150;

/** Lowercase, punctuation as spaces, accents kept, list numbering dropped. */
export function rowKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*(?:#?\d+[.):]?|[ivx]+[.)])\s+/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The key without parenthesised or bracketed asides: "Ji et al. (Survey)" → "ji et al". */
function coreKey(name: string): string {
  return rowKey(name.replace(/\([^)]*\)|\[[^\]]*\]/g, " "));
}

/**
 * The row names in the planner's reply: `{"rows": [...]}`, a bare JSON array, or a plain list.
 * Duplicates (by key) are dropped. Returns [] when nothing usable came back or the plan is too
 * long to help, and the reduce then chooses its own rows as before.
 */
export function parseRowPlan(text: string): string[] {
  const names = rowNamesFromJson(text) ?? rowNamesFromList(text);
  const seen = new Set<string>();
  const plan: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = rowKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    plan.push(name);
  }
  return plan.length > MAX_PLANNED_ROWS ? [] : plan;
}

function rowNamesFromJson(text: string): string[] | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(rows)) return null;
    return rows.filter((r): r is string => typeof r === "string");
  } catch {
    return null;
  }
}

function rowNamesFromList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0 && line.length <= 200);
}

/** The reduce prompt's row section: empty without a plan, so the reduce picks rows as before. */
export function formatRowPlan(plan: string[]): string {
  if (plan.length === 0) return "";
  const list = plan.map((name, i) => `${i + 1}. ${name}`).join("\n");
  return `Rows: write exactly one row for each of these ${plan.length} items, in this order, naming each item as written here. Add no other rows; details of anything else go in the cells of the item they belong to.
${list}`;
}

/** Index of the plan entry a cell names, or -1. */
function matchPlan(cell: string, keys: { full: string; core: string }[]): number {
  const full = rowKey(cell);
  if (!full) return -1;
  const core = coreKey(cell);
  const exact = keys.findIndex((k) => k.full === full || (core && k.core === core));
  if (exact >= 0) return exact;
  // "Prompt Chaining" vs "Prompt Chaining Pattern": one name, whole words, inside the other.
  const padded = ` ${full} `;
  return keys.findIndex(
    (k) => k.full.length >= 4 && (padded.includes(` ${k.full} `) || ` ${k.full} `.includes(padded))
  );
}

export type RowPlanAlignment = {
  csv: string;
  /** First cell of each row dropped as a duplicate or as outside the plan. */
  dropped: string[];
};

/**
 * Hold a reduce table to its row plan: find the column that names the planned items, drop rows
 * that name an item already in the table and, when the names line up with the plan, rows that
 * name none of its items. Exact duplicate rows always go. A table that can't be parsed, or whose
 * names don't line up with the plan (under half the plan found), is left as the reduce wrote it.
 */
export function alignRowsToPlan(csv: string, plan: string[]): RowPlanAlignment {
  const { rows, unterminatedQuote } = parseCsvDetailed(csv);
  if (unterminatedQuote || rows.length < 2) return { csv, dropped: [] };
  const [header, ...body] = rows;

  const dropped: string[] = [];
  const seenRows = new Set<string>();
  let kept = body.filter((row) => {
    const key = row.map(rowKey).join("\u0000");
    if (!key.replace(/\u0000/g, "")) return false;
    if (seenRows.has(key)) {
      dropped.push(row[0] ?? "");
      return false;
    }
    seenRows.add(key);
    return true;
  });

  const keys = plan.map((name) => ({ full: rowKey(name), core: coreKey(name) }));
  const keyColumn = keys.length > 0 ? bestKeyColumn(kept, keys) : null;
  if (keyColumn) {
    const seenItems = new Set<number>();
    kept = kept.filter((row) => {
      const item = matchPlan(row[keyColumn.index] ?? "", keys);
      if (item < 0 || seenItems.has(item)) {
        dropped.push(row[keyColumn.index] ?? row[0] ?? "");
        return false;
      }
      seenItems.add(item);
      return true;
    });
  }

  if (dropped.length === 0) return { csv, dropped };
  return { csv: serializeCsv([header, ...kept], { quoteAll: true }), dropped };
}

/** The column whose cells name the most distinct plan items, if that covers half the plan. */
function bestKeyColumn(
  rows: string[][],
  keys: { full: string; core: string }[]
): { index: number } | null {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best: { index: number; found: number } | null = null;
  for (let index = 0; index < width; index++) {
    const found = new Set(rows.map((r) => matchPlan(r[index] ?? "", keys)).filter((i) => i >= 0))
      .size;
    if (!best || found > best.found) best = { index, found };
  }
  return best && best.found * 2 >= keys.length ? { index: best.index } : null;
}
