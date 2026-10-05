/**
 * RFC 4180 CSV, shared by the web spreadsheet editor and the Convex spreadsheet job.
 *
 * The file name has two dots on purpose: Convex does not treat it as a function module, so it adds
 * nothing to the generated API (see convex/_testing/preloadModules.helpers.ts).
 */

/**
 * Parses CSV text into rows of fields. Quoted fields may contain commas, doubled quotes and line
 * breaks. Accepts LF or CRLF and a leading BOM. Fields are never trimmed, except that whitespace
 * between a closing quote and the next delimiter is dropped. Completely empty lines are skipped;
 * rows keep their own length (ragged rows stay ragged).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false; // a quoted field closed; ignore whitespace until the delimiter
  let rowHasContent = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
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
      // Stray text after a closing quote: keep it rather than lose data.
      if (char !== " " && char !== "\t") field += char;
    } else if (char === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
      rowHasContent = true;
    } else {
      field += char;
      rowHasContent = true;
    }
  }
  if (field !== "" || row.length > 0 || rowHasContent || inQuotes) endRow();
  return rows;
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
