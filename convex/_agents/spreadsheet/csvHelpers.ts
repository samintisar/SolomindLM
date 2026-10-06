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
  /\b(not (?:specified|mentioned|stated|provided|reported|given|available|found|listed|included|described|detailed)) (?:in|from) (?:the )?(?:research |input |consolidated |source )?notes\b/gi;

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
 * Validate CSV completeness.
 * Checks for header row and consistent column counts.
 */
export function validateTableCompleteness(
  output: string,
  spreadsheetType: string
): {
  isComplete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  const lines = output.trim().split("\n");

  if (lines.length < 2) {
    missing.push("CSV has insufficient rows (need at least header + data)");
    return { isComplete: false, missing };
  }

  // Check for CSV format (header should have commas)
  if (!lines[0].includes(",")) {
    missing.push("Header row does not contain commas (not valid CSV)");
  }

  const headerCount = lines[0].split(",").length;

  // Check sample rows for consistency (allow small variance for quoted commas)
  const sampleIndices = [1, Math.floor(lines.length / 2), lines.length - 1];
  for (const idx of sampleIndices) {
    if (idx < lines.length && idx > 0) {
      const rowCount = lines[idx].split(",").length;
      // Allow small variance for quoted commas, but flag major discrepancies
      if (Math.abs(rowCount - headerCount) > 2) {
        missing.push(`Row ${idx + 1} has ${rowCount} columns but header has ${headerCount}`);
      }
    }
  }

  // Check for abrupt ending (last line should be complete)
  const lastLine = lines[lines.length - 1] || "";
  if (lastLine.length > 0 && lastLine.split(",").length < headerCount - 2) {
    missing.push("Last row appears incomplete (truncated output)");
  }

  // Type-specific validation
  if (spreadsheetType === "financial_summary") {
    // Check for currency symbols or numbers
    const hasCurrency =
      /\$[\d,]+\.?\d*/.test(output) || /[\d,]+\.?\d*\s*(USD|EUR|GBP)/.test(output);
    if (!hasCurrency) {
      missing.push("Financial CSV should contain currency values");
    }
  }

  if (spreadsheetType === "timeline") {
    // Check for dates
    const hasDates =
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(output) ||
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i.test(
        output
      );
    if (!hasDates) {
      missing.push("Timeline CSV should contain dates");
    }
  }

  return {
    isComplete: missing.length === 0,
    missing,
  };
}
