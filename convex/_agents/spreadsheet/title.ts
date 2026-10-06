import { parseCsv } from "../../_shared/csv.helpers.js";

/** `generateTitleFromChunk` reads only the first 500 characters. */
const TITLE_SOURCE_LIMIT = 500;
/** Caps so the request cannot crowd the table out of what the title model reads. */
const ROW_NAMES_LIMIT = 220;
const REQUEST_LIMIT = 120;

/**
 * Text the spreadsheet title is written from: the finished table's columns, its rows' first cells
 * and the request (table first, so a long request cannot push it out), so the title describes the whole table. (The first map task's notes cover
 * one slice of whichever source comes first, which titled multi-source tables after that one
 * source; #350.)
 */
export function spreadsheetTitleSource(csv: string, customPrompt: string): string {
  const [header = [], ...rows] = parseCsv(csv.trim());
  const columns = header.map((c) => c.trim()).filter(Boolean);
  if (columns.length === 0) return "";
  const rowNames = rows
    .map((r) => r[0]?.trim())
    .filter(Boolean)
    .join("; ");
  const request = customPrompt.trim().slice(0, REQUEST_LIMIT);
  const parts = [
    `Table columns: ${columns.join(", ")}`,
    rowNames && `Rows: ${rowNames.slice(0, ROW_NAMES_LIMIT)}`,
    request && `Request: ${request}`,
  ].filter(Boolean);
  return parts.join("\n").slice(0, TITLE_SOURCE_LIMIT);
}
