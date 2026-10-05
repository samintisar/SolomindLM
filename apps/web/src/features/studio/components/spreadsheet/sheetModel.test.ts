import { describe, expect, it } from "vitest";
import {
  addRow,
  columnCount,
  columnHasData,
  deleteColumn,
  type Grid,
  insertColumn,
  isNumericColumn,
  setCell,
  sortByColumn,
  toCsv,
  toExportCsv,
  toGrid,
} from "./sheetModel";

/** Freezes a row, or a grid and every row in it, so any mutation throws in strict mode. */
function freeze(rows: string[][]): Grid;
function freeze(row: string[]): string[];
function freeze(value: string[] | string[][]): string[] | Grid {
  for (const item of value) if (Array.isArray(item)) Object.freeze(item);
  return Object.freeze(value) as string[] | Grid;
}

describe("toGrid / toCsv", () => {
  it("pads ragged rows to the widest row", () => {
    expect(toGrid("a,b,c\n1\n2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
      ["2", "3", ""],
    ]);
  });

  it("gives one empty header cell for an empty string", () => {
    expect(toGrid("")).toEqual([[""]]);
  });

  it("round-trips CSV text", () => {
    const csv = 'name,note\nAda,"hello, world"\nBob,"say ""hi"""';
    expect(toCsv(toGrid(csv))).toBe(csv);
  });

  it("round-trips the empty grid", () => {
    expect(toGrid(toCsv(toGrid("")))).toEqual([[""]]);
  });
});

describe("columnCount", () => {
  it("is the header width, or 0 for an empty grid", () => {
    expect(columnCount([["a", "b"]])).toBe(2);
    expect(columnCount([])).toBe(0);
  });
});

describe("setCell", () => {
  it("returns a new grid with the cell changed", () => {
    const grid = freeze(
      [
        ["a", "b"],
        ["1", "2"],
      ].map((r) => freeze(r))
    );
    const next = setCell(grid, 1, 0, "9");
    expect(next).toEqual([
      ["a", "b"],
      ["9", "2"],
    ]);
    expect(next).not.toBe(grid);
    expect(next[0]).toBe(grid[0]);
  });

  it("returns the same reference when the value is unchanged", () => {
    const grid = freeze([freeze(["a", "b"]), freeze(["1", "2"])]);
    expect(setCell(grid, 1, 1, "2")).toBe(grid);
  });
});

describe("addRow", () => {
  it("appends an empty row as wide as the grid", () => {
    const grid = freeze([freeze(["a", "b", "c"]), freeze(["1", "2", "3"])]);
    expect(addRow(grid)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["", "", ""],
    ]);
  });
});

describe("insertColumn", () => {
  const grid = (): Grid => freeze([freeze(["a", "b", "c"]), freeze(["1", "2", "3"])]);

  it("names the new header after its 1-based position", () => {
    expect(insertColumn(grid(), 0)).toEqual([
      ["a", "Column 2", "b", "c"],
      ["1", "", "2", "3"],
    ]);
  });

  it("inserts first when afterCol is -1", () => {
    expect(insertColumn(grid(), -1)[0]).toEqual(["Column 1", "a", "b", "c"]);
  });

  it("appends after the last column", () => {
    expect(insertColumn(grid(), 2)[0]).toEqual(["a", "b", "c", "Column 4"]);
  });

  it("uses a custom header when given", () => {
    expect(insertColumn(grid(), 1, "Total")[0]).toEqual(["a", "b", "Total", "c"]);
  });
});

describe("deleteColumn", () => {
  it("removes the column from every row", () => {
    const grid = freeze([freeze(["a", "b"]), freeze(["1", "2"])]);
    expect(deleteColumn(grid, 0)).toEqual([["b"], ["2"]]);
  });

  it("refuses to delete the last remaining column", () => {
    const grid = freeze([freeze(["a"]), freeze(["1"])]);
    expect(deleteColumn(grid, 0)).toBe(grid);
  });
});

describe("columnHasData", () => {
  const grid = freeze([freeze(["a", "b", "c"]), freeze(["1", "", "  "]), freeze(["2", "", ""])]);

  it("is true when a data cell has text", () => {
    expect(columnHasData(grid, 0)).toBe(true);
  });

  it("ignores the header and blank cells", () => {
    expect(columnHasData(grid, 1)).toBe(false);
    expect(columnHasData(grid, 2)).toBe(false);
  });
});

describe("isNumericColumn", () => {
  const column = (...cells: string[]): Grid =>
    freeze([freeze(["h"]), ...cells.map((c) => freeze([c]))]);

  it("accepts currency, thousands commas, percents and blank markers", () => {
    expect(isNumericColumn(column("$1,200", "12%", "—", "3.5", "N/A", "-", ""), 0)).toBe(true);
  });

  it("accepts other currency symbols and negatives", () => {
    expect(isNumericColumn(column("€5", "£6", "¥7", "-2"), 0)).toBe(true);
  });

  it("is false when a text cell is present", () => {
    expect(isNumericColumn(column("10", "abc"), 0)).toBe(false);
  });

  it("is false with no numeric cell at all", () => {
    expect(isNumericColumn(column("", "—", "n/a"), 0)).toBe(false);
  });

  it("is false for a header-only grid", () => {
    expect(isNumericColumn(freeze([freeze(["h"])]), 0)).toBe(false);
  });
});

describe("sortByColumn", () => {
  const numbers = (): Grid =>
    freeze([
      freeze(["name", "amount"]),
      freeze(["b", "$1,200"]),
      freeze(["blank", ""]),
      freeze(["a", "5"]),
      freeze(["dash", "—"]),
      freeze(["c", "12%"]),
    ]);

  const names = (grid: Grid) => grid.map((row) => row[0]);

  it("sorts a numeric column ascending with blanks last", () => {
    const sorted = sortByColumn(numbers(), 1, "asc");
    expect(names(sorted)).toEqual(["name", "a", "c", "b", "blank", "dash"]);
  });

  it("sorts a numeric column descending with blanks still last", () => {
    const sorted = sortByColumn(numbers(), 1, "desc");
    expect(names(sorted)).toEqual(["name", "b", "c", "a", "blank", "dash"]);
  });

  it("sorts text naturally, so item 2 comes before item 10", () => {
    const grid = freeze([
      freeze(["label"]),
      freeze(["item 10"]),
      freeze([""]),
      freeze(["Item 2"]),
      freeze(["item 1"]),
    ]);
    expect(sortByColumn(grid, 0, "asc").map((r) => r[0])).toEqual([
      "label",
      "item 1",
      "Item 2",
      "item 10",
      "",
    ]);
    expect(sortByColumn(grid, 0, "desc").map((r) => r[0])).toEqual([
      "label",
      "item 10",
      "Item 2",
      "item 1",
      "",
    ]);
  });

  it("keeps ties in their original order", () => {
    const grid = freeze([
      freeze(["k", "id"]),
      freeze(["x", "1"]),
      freeze(["x", "2"]),
      freeze(["x", "3"]),
    ]);
    expect(sortByColumn(grid, 0, "desc").map((r) => r[1])).toEqual(["id", "1", "2", "3"]);
  });

  it("does not mutate the input", () => {
    const grid = numbers();
    const sorted = sortByColumn(grid, 1, "asc");
    expect(sorted).not.toBe(grid);
    expect(grid[1][0]).toBe("b");
  });
});

describe("toExportCsv", () => {
  it("writes cells a spreadsheet app would run as formulas as text", () => {
    const grid = [
      ["Name", "Note"],
      ['=HYPERLINK("x")', "+cmd"],
      ["@SUM(A1)", " =1+1"],
    ];
    expect(toExportCsv(grid)).toBe('Name,Note\n"\'=HYPERLINK(""x"")",\'+cmd\n\'@SUM(A1),\' =1+1');
  });

  it("leaves signed numbers and ordinary text alone", () => {
    const grid = [
      ["Change", "Text"],
      ["-5", "a-b"],
      ["+3.2%", "-"],
      ["-1,200", "x=1"],
    ];
    expect(toExportCsv(grid)).toBe(toCsv(grid));
  });

  it("does not change the grid it exports", () => {
    const grid = Object.freeze([Object.freeze(["=1"])]) as string[][];
    toExportCsv(grid);
    expect(grid[0][0]).toBe("=1");
  });
});
