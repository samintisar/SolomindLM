import { parseCsv, serializeCsv } from "@convex/_shared/csv.helpers";

/** A sheet as rows of cells. Row 0 is the header and every row has the same length. */
export type Grid = string[][];

const CURRENCY_PREFIX = /^[$€£¥]/;
const BLANK_MARKERS = new Set(["—", "-", "n/a"]);

/** Parses CSV and pads every row to the widest one (at least one column). */
export function toGrid(csv: string): Grid {
  const rows = parseCsv(csv);
  const width = Math.max(1, ...rows.map((row) => row.length));
  if (rows.length === 0) return [new Array<string>(width).fill("")];
  return rows.map((row) =>
    row.length === width ? row : [...row, ...new Array<string>(width - row.length).fill("")]
  );
}

/** Serializes a grid back to CSV text, quoting only the fields that need it. */
export function toCsv(grid: Grid): string {
  return serializeCsv(grid);
}

/** Starts like a formula (`=`, `+`, `-` or `@` with something after it), leading blanks allowed. */
const FORMULA_START = /^\s*[=+\-@]./s;
const SIGNED_NUMBER = /^\s*[+-]?[\d.,]+%?\s*$/;

/**
 * CSV for a downloaded file. Spreadsheet apps run a cell that starts like a formula, so such
 * cells get a leading apostrophe and open as text; signed numbers stay numbers. The grid, and
 * the CSV the app saves, are unchanged.
 */
export function toExportCsv(grid: Grid): string {
  return serializeCsv(
    grid.map((row) =>
      row.map((cell) => (FORMULA_START.test(cell) && !SIGNED_NUMBER.test(cell) ? `'${cell}` : cell))
    )
  );
}

/** Number of columns, taken from the header row. */
export function columnCount(grid: Grid): number {
  return grid[0]?.length ?? 0;
}

/** Sets one cell. Returns the same grid object when the value is unchanged. */
export function setCell(grid: Grid, row: number, col: number, value: string): Grid {
  if (grid[row]?.[col] === value) return grid;
  return grid.map((cells, index) => {
    if (index !== row) return cells;
    const next = [...cells];
    next[col] = value;
    return next;
  });
}

/** Appends an empty row as wide as the grid. */
export function addRow(grid: Grid): Grid {
  return [...grid, new Array<string>(columnCount(grid)).fill("")];
}

/**
 * Inserts an empty column after `afterCol` (-1 inserts it first). The header defaults to
 * "Column N", where N is the new column's 1-based position.
 */
export function insertColumn(grid: Grid, afterCol: number, header?: string): Grid {
  const at = afterCol + 1;
  return grid.map((cells, index) => {
    const value = index === 0 ? (header ?? `Column ${at + 1}`) : "";
    return [...cells.slice(0, at), value, ...cells.slice(at)];
  });
}

/** Removes a column. The last remaining column is never deleted; the grid comes back unchanged. */
export function deleteColumn(grid: Grid, col: number): Grid {
  if (columnCount(grid) <= 1) return grid;
  return grid.map((cells) => cells.filter((_, index) => index !== col));
}

/** True when any data cell in the column has non-blank text. The header is ignored. */
export function columnHasData(grid: Grid, col: number): boolean {
  return grid.slice(1).some((cells) => (cells[col] ?? "").trim() !== "");
}

/** Reads a cell as a number: currency symbol, thousands commas and a trailing % are allowed. */
function parseNumber(cell: string | undefined): number | null {
  const trimmed = (cell ?? "").trim();
  if (trimmed === "" || BLANK_MARKERS.has(trimmed.toLowerCase())) return null;
  let text = trimmed.replace(CURRENCY_PREFIX, "").replace(/,/g, "");
  if (text.endsWith("%")) text = text.slice(0, -1);
  text = text.trim();
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** True when a cell counts as empty: blank text, a dash or N/A. */
function isBlankCell(cell: string | undefined): boolean {
  const trimmed = (cell ?? "").trim();
  return trimmed === "" || BLANK_MARKERS.has(trimmed.toLowerCase());
}

/** True when every non-blank data cell parses as a number; needs at least one such cell. */
export function isNumericColumn(grid: Grid, col: number): boolean {
  let numeric = 0;
  for (const cells of grid.slice(1)) {
    if (isBlankCell(cells[col])) continue;
    if (parseNumber(cells[col]) === null) return false;
    numeric++;
  }
  return numeric > 0;
}

/**
 * Sorts the data rows by one column and keeps the header first. Numeric columns compare by
 * number, others by natural text order. Blank cells (and non-numeric ones in a numeric column)
 * sort last in both directions. The sort is stable.
 */
export function sortByColumn(grid: Grid, col: number, direction: "asc" | "desc"): Grid {
  if (grid.length < 2) return grid;
  const sign = direction === "asc" ? 1 : -1;
  const numeric = isNumericColumn(grid, col);

  const compare = (a: string[], b: string[]): number => {
    if (numeric) {
      const x = parseNumber(a[col]);
      const y = parseNumber(b[col]);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (x - y) * sign;
    }
    const x = a[col] ?? "";
    const y = b[col] ?? "";
    const xBlank = x.trim() === "";
    const yBlank = y.trim() === "";
    if (xBlank || yBlank) return xBlank === yBlank ? 0 : xBlank ? 1 : -1;
    return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * sign;
  };

  return [grid[0], ...grid.slice(1).sort(compare)];
}
