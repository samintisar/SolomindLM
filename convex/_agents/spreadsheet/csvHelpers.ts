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
 * `"Net Sales""$69,154""Revenue"` (#567). RFC 4180 reads that as one field whose escaped quotes
 * mark the missing separators (`Net Sales"$69,154"Revenue`). Re-split it when it splits into
 * exactly `width` fields; otherwise it may hold a real quote.
 */
function splitAdjacentQuotedFields(field: string, width: number): string[] | null {
  const parts = field.split('"');
  return parts.length === width ? parts : null;
}

/** Past this share of ragged rows the table is redone rather than trimmed. */
const MAX_DROPPED_RAGGED_SHARE = 0.1;

export type CsvTableCheck = {
  /** The table, repaired where that was safe. */
  csv: string;
  /** Why the table can't be saved; empty when it can. */
  problems: string[];
  /** Rows removed: a row cut off at the output cap, or a few rows off the header's width. */
  droppedRows: number;
  /**
   * True when the table has to be written again from the notes (no header, no data rows); false
   * when its rows are there and only their formatting is wrong.
   */
  needsRewrite: boolean;
};

/**
 * Check a reduce table before it is saved (#567), repairing what is safe to repair:
 * - when the reply was cut off at the output cap (`truncated`), its last, partial row goes;
 * - a row whose fields were quoted back to back with no commas is split again;
 * - a row short by at most half the header's fields is padded with empty cells;
 * - blank rows go, and so do rows still off the header's width when they are few (up to 10%).
 * Problems left: an unclosed quote, no header with at least two columns, no data rows, or more
 * rows off the header's width than can be dropped.
 */
export function checkCsvTable(csv: string, options: { truncated?: boolean } = {}): CsvTableCheck {
  const parsed = parseCsvDetailed(csv);
  let rows = parsed.rows;
  let droppedRows = 0;
  if (options.truncated && rows.length > 1) {
    rows = rows.slice(0, -1);
    droppedRows++;
  } else if (parsed.unterminatedQuote) {
    return { csv, problems: ["a quoted field is never closed"], droppedRows, needsRewrite: false };
  }
  if (rows.length === 0 || rows[0].length < 2) {
    return {
      csv,
      problems: ["no header row with at least two columns"],
      droppedRows,
      needsRewrite: true,
    };
  }
  const [header, ...rest] = rows;
  const width = header.length;

  const body = rest
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const split = row.length === 1 ? splitAdjacentQuotedFields(row[0], width) : null;
      if (split) return split;
      if (row.length < width && row.length * 2 >= width) {
        return [...row, ...Array<string>(width - row.length).fill("")];
      }
      return row;
    });
  const kept = body.filter((row) => row.length === width);
  const ragged = body.length - kept.length;

  const problems: string[] = [];
  if (kept.length === 0) problems.push("no data rows");
  else if (ragged > body.length * MAX_DROPPED_RAGGED_SHARE) {
    problems.push(`${ragged} of ${body.length} rows don't have the header's ${width} fields`);
  }
  droppedRows += rest.length - kept.length;

  const changed = droppedRows > 0 || kept.some((row, i) => row !== rest[i]);
  return {
    csv: changed ? serializeCsv([header, ...kept], { quoteAll: true }) : csv,
    problems,
    droppedRows,
    needsRewrite: kept.length === 0,
  };
}
