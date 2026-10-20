"use node";

import { parseCsv, parseCsvDetailed, serializeCsv } from "../../_shared/csv.helpers.js";

/**
 * Helper to extract message content safely
 */
export function getMessageContent(response: unknown): string {
  if (typeof response === "object" && response !== null) {
    const msg = response as { content?: unknown };
    if (typeof msg.content === "string") {
      return msg.content;
    }
    if (typeof msg.content === "object" && msg.content !== null) {
      if (typeof (msg.content as { toString?: () => string }).toString === "function") {
        return (msg.content as { toString: () => string }).toString();
      }
    }
  }
  return String(response);
}

/**
 * Clean LLM output to ensure it is valid CSV.
 * Removes Markdown code blocks (```csv ... ```) and leading/trailing whitespace.
 * If fields are not properly quoted, attempts to fix them (RFC 4180 compliance).
 */
/**
 * The pipeline hands the reduce step "notes", and models echo that word into empty cells
 * ("Not specified in notes"). Readers only know their sources, so say that instead (#350).
 */
const PIPELINE_NOTES_PHRASE =
  /\b(not (?:explicitly |clearly |directly |specifically )?(?:specified|mentioned|stated|provided|reported|given|available|found|listed|included|described|detailed)) (?:in|from) (?:the )?(?:provided |available |given |research |input |consolidated |source |first |these |those |some |any )?notes\b/gi;

export function withoutPipelineWording(text: string): string {
  return text.replace(PIPELINE_NOTES_PHRASE, "$1 in the sources");
}

export function cleanCsvOutput(output: string): string {
  let cleaned = output.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:csv)?\n?/, "").replace(/\n?```$/, "");
  }

  cleaned = cleaned.trim();

  // Check if CSV is already properly quoted (heuristic: first line should start with quote)
  const lines = cleaned.split("\n");
  if (lines.length > 0 && lines[0].trim().startsWith('"')) {
    // Likely already properly formatted
    return cleaned;
  }

  // Attempt to fix unquoted CSV by parsing and re-quoting (RFC 4180, so quoted line breaks survive)
  const { rows: parsed, unterminatedQuote } = parseCsvDetailed(cleaned);
  // An unclosed quote would swallow every following line into one cell, so read line by line instead.
  const rows = unterminatedQuote
    ? cleaned
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map((line) => parseCsv(line)[0] ?? [])
    : parsed;
  if (rows.length > 0) {
    console.log("[SpreadsheetGraph] Applied RFC 4180 CSV formatting to output");
    return serializeCsv(rows, { quoteAll: true });
  }
  return cleaned;
}

/**
 * A row the model wrote with its fields quoted back to back and no commas between them:
 * `"Net Sales""$69,154""Revenue"` (#567). RFC 4180 reads that as one field with escaped quotes.
 * Re-split it when it splits into exactly `width` fields; otherwise it may be a real quote.
 */
function splitAdjacentQuotedFields(line: string, width: number): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"') || trimmed.length < 2) return null;
  const parts = trimmed.slice(1, -1).split('""');
  return parts.length === width ? parts : null;
}

export type CsvTableCheck = {
  /** The table, repaired where that was safe. */
  csv: string;
  /** Why the table can't be saved; empty when it can. */
  problems: string[];
};

/**
 * Check a reduce table before it is saved (#567), repairing what is safe to repair:
 * - a row whose fields were quoted back to back with no commas is split again;
 * - a row short by fewer than half the header's fields is padded with empty cells.
 * Problems left: no header with at least two columns, no data rows, or rows whose field count
 * still differs from the header's.
 */
export function checkCsvTable(csv: string): CsvTableCheck {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const { rows, unterminatedQuote } = parseCsvDetailed(csv);
  if (unterminatedQuote) {
    return { csv, problems: ["a quoted field is never closed"] };
  }
  if (rows.length === 0 || rows[0].length < 2) {
    return { csv, problems: ["no header row with at least two columns"] };
  }
  const width = rows[0].length;
  // Re-split back-to-back fields. Only when no field spans lines, so rows and lines line up.
  const repaired =
    rows.length === lines.length
      ? rows.map((row, i) =>
          row.length === 1 && i > 0 ? (splitAdjacentQuotedFields(lines[i], width) ?? row) : row
        )
      : rows;

  const problems: string[] = [];
  const body = repaired.slice(1).map((row) => {
    if (row.length < width && row.length * 2 > width) {
      return [...row, ...Array<string>(width - row.length).fill("")];
    }
    return row;
  });
  if (body.length === 0) problems.push("no data rows");
  const ragged = body.filter((row) => row.length !== width).length;
  if (ragged > 0)
    problems.push(`${ragged} of ${body.length} rows don't have the header's ${width} fields`);

  const changed = body.some((row, i) => row !== rows[i + 1]);
  return {
    csv: changed ? serializeCsv([repaired[0], ...body], { quoteAll: true }) : csv,
    problems,
  };
}
