/**
 * RFC 4180 CSV, shared by the web spreadsheet editor and the Convex spreadsheet job.
 *
 * The file name has two dots on purpose: Convex does not treat it as a function module, so it adds
 * nothing to the generated API (see convex/_testing/preloadModules.helpers.ts).
 */

/**
 * Parses CSV text into rows of fields (see `parseCsvDetailed` for the unterminated-quote flag). Quoted fields may contain commas, doubled quotes and line
 * breaks. Accepts LF or CRLF and a leading BOM. Fields are never trimmed, except that whitespace
 * between a closing quote and the next delimiter is dropped. Completely empty lines are skipped;
 * rows keep their own length (ragged rows stay ragged).
 */
export function parseCsv(text: string): string[][] {
  return parseCsvDetailed(text).rows;
}

/** Like `parseCsv`, but also reports whether a quoted field was never closed. */
export function parseCsvDetailed(text: string): { rows: string[][]; unterminatedQuote: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false; // a quoted field closed; whitespace is held back until the delimiter
  let pendingSpace = ""; // whitespace after a closing quote, kept only if more text follows it
  let rowHasContent = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
    pendingSpace = "";
  };
  const endRow = () => {
    endField();
    if (rowHasContent || row.length > 1) rows.push(row);
    row = [];
    rowHasContent = false;
  };

  for (; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === ",") {
      endField();
      rowHasContent = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (afterQuote) {
      // Stray text after a closing quote: keep it rather than lose data. Whitespace between the
      // quote and the delimiter is dropped; whitespace between stray words is kept.
      if (char === " " || char === "\t") {
        pendingSpace += char;
      } else {
        field += pendingSpace + char;
        pendingSpace = "";
      }
    } else if (char === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
      rowHasContent = true;
    } else {
      field += char;
      // A line of only spaces or tabs is blank, not a row.
      if (char !== " " && char !== "\t") rowHasContent = true;
    }
  }
  const unterminatedQuote = inQuotes;
  if (field !== "" || row.length > 0 || rowHasContent || inQuotes) endRow();
  return { rows, unterminatedQuote };
}

const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/** Serializes rows as CSV with LF line breaks, quoting only fields that need it (or all of them). */
export function serializeCsv(rows: string[][], options: { quoteAll?: boolean } = {}): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return rows
    .map((row) => {
      // A row holding one empty field would serialize to an empty line, which parses as nothing.
      if (row.length === 1 && row[0] === "") return '""';
      return row
        .map((value) => (options.quoteAll || NEEDS_QUOTES.test(value) ? quote(value) : value))
        .join(",");
    })
    .join("\n");
}
