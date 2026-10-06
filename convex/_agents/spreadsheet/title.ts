import { parseCsv } from "../../_shared/csv.helpers.js";

const TITLE_SOURCE_LIMIT = 2000;

/**
 * Text the spreadsheet title is written from: the request, the finished table's columns and its
 * rows' first cells, so the title describes the whole table. (The first map task's notes cover
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
  const parts = [
    customPrompt.trim() && `Request: ${customPrompt.trim()}`,
    `Table columns: ${columns.join(", ")}`,
    rowNames && `Rows: ${rowNames}`,
  ].filter(Boolean);
  return parts.join("\n").slice(0, TITLE_SOURCE_LIMIT);
}
