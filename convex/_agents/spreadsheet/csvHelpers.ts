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

/** A JSON cell as text: strings as they are, null as empty, anything else as JSON. */
function cellText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A JSON row as cells: an array as it is, an object by `columns` (its keys in their order). */
function asRow(value: unknown, columns: string[] | null): string[] | null {
  if (Array.isArray(value)) return value.map(cellText);
  if (isRecord(value) && columns) return columns.map((key) => cellText(value[key]));
  return null;
}

/** Rows written as objects: the first object's keys are the header. */
function objectRows(objects: Record<string, unknown>[]): string[][] {
  const columns = Object.keys(objects[0] ?? {});
  return [columns, ...objects.map((o) => columns.map((key) => cellText(o[key])))];
}

/** Past this share of lines that aren't JSON rows, the reply is read as CSV instead. */
const MAX_NON_JSON_LINE_SHARE = 0.1;

export type JsonRows = {
  rows: string[][];
  /** Lines that didn't parse and were left out (a row cut off at the output cap, a remark). */
  skippedLines: number;
};

/**
 * The reduce writes its table as JSON lines (#567): the column names as one JSON array, then one
 * array per row. Building the CSV from these in code means a row can't lose its separators or
 * quotes. Also accepts rows written as JSON objects (their keys are the header), one wrapping
 * array of rows (even cut off), or `{"columns": [...], "rows": [[...]]}`.
 *
 * A line that doesn't parse (the last row of a reply cut off at the output cap, a stray remark)
 * is skipped and counted. Returns null when the reply isn't JSON rows (no header row, or more
 * than 10% of its lines aren't rows), and the caller reads it as CSV.
 */
export function parseJsonRows(text: string): JsonRows | null {
  const body = text
    .trim()
    .replace(/^```(?:json|jsonl)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!body.startsWith("[") && !body.startsWith("{")) return null;

  try {
    const whole: unknown = JSON.parse(body);
    if (Array.isArray(whole) && whole.length > 0) {
      if (whole.every(Array.isArray))
        return { rows: whole.map((row) => row.map(cellText)), skippedLines: 0 };
      if (whole.every(isRecord)) return { rows: objectRows(whole), skippedLines: 0 };
    }
    if (isRecord(whole) && Array.isArray(whole.columns) && Array.isArray(whole.rows)) {
      const columns = whole.columns.map(cellText);
      const rows = whole.rows.map((row) => asRow(row, columns) ?? []);
      return { rows: [columns, ...rows], skippedLines: 0 };
    }
  } catch {
    // Not one JSON value: read it line by line.
  }

  // One row per line. A wrapping array's brackets ride on the first and last rows when it is
  // pretty-printed (`[["A","B"],` … `["1","2"]]`); strip them so a cut-off reply still reads.
  const lines = body
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/,$/, "")
        .replace(/^\[(?=\s*[[{])/, "")
        .replace(/([\]}])\]$/, "$1")
    )
    .filter((line) => line !== "" && line !== "[" && line !== "]");
  const rows: string[][] = [];
  let columns: string[] | null = null;
  let skippedLines = 0;
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      value = undefined;
    }
    if (rows.length === 0 && isRecord(value)) {
      columns = Object.keys(value);
      rows.push(columns);
    }
    const row = asRow(value, columns);
    if (row) rows.push(row);
    else if (rows.length === 0) return null;
    else skippedLines++;
  }
  if (skippedLines > lines.length * MAX_NON_JSON_LINE_SHARE && skippedLines > 1) return null;
  return { rows, skippedLines };
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

type TableProblems = {
  /** Why the table can't be saved; empty when it can. */
  problems: string[];
  /** Rows removed: a row cut off at the output cap, blank rows, a few rows off the header's width. */
  droppedRows: number;
  /**
   * True when the table has to be written again from the notes (no header, no data rows); false
   * when its rows are there and only their formatting is wrong.
   */
  needsRewrite: boolean;
};

export type TableRowsCheck = TableProblems & {
  /** The header and the rows kept, repaired where that was safe. */
  rows: string[][];
  /** Whether `rows` differs from the input. */
  changed: boolean;
};

/**
 * Check a table's rows before it is saved (#567), repairing what is safe to repair:
 * - a row short by at most half the header's fields is padded with empty cells;
 * - blank rows go, and so do rows still off the header's width when they are few (up to 10%);
 * - with `splitAdjacentFields` (rows read from CSV text), a one-field row whose fields were
 *   quoted back to back with no commas is split again.
 * Problems left: no header, no data rows, or more rows off the header's width than can be dropped.
 */
export function checkTableRows(
  rows: string[][],
  options: { splitAdjacentFields?: boolean } = {}
): TableRowsCheck {
  if (rows.length === 0 || rows[0].every((cell) => cell.trim() === "")) {
    return {
      rows,
      changed: false,
      problems: ["no header row"],
      droppedRows: 0,
      needsRewrite: true,
    };
  }
  const [header, ...rest] = rows;
  const width = header.length;

  const body = rest
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const split =
        options.splitAdjacentFields && width > 1 && row.length === 1
          ? splitAdjacentQuotedFields(row[0], width)
          : null;
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
  const droppedRows = rest.length - kept.length;
  return {
    rows: [header, ...kept],
    changed: droppedRows > 0 || kept.some((row, i) => row !== rest[i]),
    problems,
    droppedRows,
    needsRewrite: kept.length === 0,
  };
}

export type CsvTableCheck = TableProblems & {
  /** The table, repaired where that was safe. */
  csv: string;
};

/**
 * Check a table the reduce wrote as CSV text (#567): `checkTableRows` with back-to-back fields
 * split again, and, when the reply was cut off at the output cap (`truncated`), its last,
 * partial row dropped. An unclosed quote in a reply that wasn't cut off is a problem.
 */
export function checkCsvTable(csv: string, options: { truncated?: boolean } = {}): CsvTableCheck {
  const parsed = parseCsvDetailed(csv);
  let rows = parsed.rows;
  let cutRows = 0;
  if (options.truncated && rows.length > 1) {
    rows = rows.slice(0, -1);
    cutRows = 1;
  } else if (parsed.unterminatedQuote) {
    return {
      csv,
      problems: ["a quoted field is never closed"],
      droppedRows: 0,
      needsRewrite: false,
    };
  }
  const checked = checkTableRows(rows, { splitAdjacentFields: true });
  return {
    csv: checked.changed || cutRows > 0 ? serializeCsv(checked.rows, { quoteAll: true }) : csv,
    problems: checked.problems,
    droppedRows: checked.droppedRows + cutRows,
    needsRewrite: checked.needsRewrite,
  };
}
