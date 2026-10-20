import { describe, expect, it } from "vitest";
import {
  checkCsvTable,
  checkTableRows,
  cleanCsvOutput,
  parseJsonRows,
  withoutPipelineWording,
} from "./csvHelpers";

describe("parseJsonRows", () => {
  const AB = [
    ["A", "B"],
    ["1", "2"],
  ];

  it("reads JSON lines, with quotes, commas and line breaks inside values", () => {
    const text = [
      '["Item","Notes"]',
      '["Net sales","Up 5%, \\"strong\\" quarter"]',
      '["Cost","two\\nlines"]',
    ].join("\n");
    expect(parseJsonRows(text)).toEqual({
      rows: [
        ["Item", "Notes"],
        ["Net sales", 'Up 5%, "strong" quarter'],
        ["Cost", "two\nlines"],
      ],
      skippedLines: 0,
    });
  });

  it("turns numbers, booleans and nulls into cell text", () => {
    expect(parseJsonRows('["A","B","C"]\n[2020, true, null]')?.rows).toEqual([
      ["A", "B", "C"],
      ["2020", "true", ""],
    ]);
  });

  it("reads a fenced block, one wrapping array, or a columns-and-rows object", () => {
    expect(parseJsonRows('```json\n["A","B"]\n["1","2"]\n```')?.rows).toEqual(AB);
    expect(parseJsonRows('[\n  ["A","B"],\n  ["1","2"]\n]')?.rows).toEqual(AB);
    expect(parseJsonRows('{"columns":["A","B"],"rows":[["1","2"]]}')?.rows).toEqual(AB);
  });

  it("reads rows written as objects, by the first object's keys", () => {
    const lines = '{"A":"1","B":"2"}\n{"B":"4","A":"3","C":"x"}\n{"A":"5"}';
    const expected = [
      ["A", "B"],
      ["1", "2"],
      ["3", "4"],
      ["5", ""],
    ];
    expect(parseJsonRows(lines)?.rows).toEqual(expected);
    expect(parseJsonRows(`[${lines.split("\n").join(",")}]`)?.rows).toEqual(expected);
  });

  it("reads a wrapping array cut off at the output cap", () => {
    expect(parseJsonRows('[["A","B"],\n["1","2"],\n["3","cut')).toEqual({
      rows: AB,
      skippedLines: 1,
    });
    expect(parseJsonRows('[["A","B"],\n["1","2"]]')?.rows).toEqual(AB);
  });

  it("skips and counts the partial last line of a reply cut off at the output cap", () => {
    expect(parseJsonRows('["A","B"]\n["1","2"]\n["3","cut off in the mid')).toEqual({
      rows: AB,
      skippedLines: 1,
    });
  });

  it("returns null for CSV, or for a reply that is mostly not JSON rows", () => {
    expect(parseJsonRows('"A","B"\n"1","2"')).toBeNull();
    expect(parseJsonRows('["A","B"]\nnot json\nnor this\n["1","2"]')).toBeNull();
  });
});

describe("checkTableRows", () => {
  it("keeps a one-column table", () => {
    expect(checkTableRows([["Pattern"], ["Routing"], ["Reflection"]])).toMatchObject({
      problems: [],
      changed: false,
    });
  });

  it("doesn't re-split a JSON cell that holds quotes", () => {
    const rows = [["Title", "Note", "Year"], ["A", "B", "C"], ['He said "no" twice']];
    const result = checkTableRows(rows);
    expect(result.rows).toEqual([
      ["Title", "Note", "Year"],
      ["A", "B", "C"],
    ]);
    expect(result.droppedRows).toBe(1);
  });
});

describe("checkCsvTable", () => {
  const ok = { problems: [], droppedRows: 0, needsRewrite: false };

  it("passes a well-formed table through unchanged", () => {
    const csv = '"Item","Amount"\n"Net sales","$69,154"';
    expect(checkCsvTable(csv)).toEqual({ csv, ...ok });
  });

  it("re-splits rows whose fields were quoted back to back without commas", () => {
    const csv = [
      '"Category","Item","Amount"',
      '"Net Sales""Net sales""$69,154"',
      '"Cost","Cost of sales","$61,012"',
    ].join("\n");
    expect(checkCsvTable(csv)).toEqual({
      csv: [
        '"Category","Item","Amount"',
        '"Net Sales","Net sales","$69,154"',
        '"Cost","Cost of sales","$61,012"',
      ].join("\n"),
      ...ok,
    });
  });

  it("re-splits back-to-back rows even when another cell spans lines", () => {
    const csv = [
      '"Category","Item","Note"',
      '"Revenue","Net sales","two\nlines"',
      '"Cost""Cost of sales""$61,012"',
    ].join("\n");
    const result = checkCsvTable(csv);
    expect(result.problems).toEqual([]);
    expect(result.csv.split("\n").at(-1)).toBe('"Cost","Cost of sales","$61,012"');
  });

  it("keeps a real escaped quote that doesn't split into the header's width", () => {
    const csv = '"Title","Note"\n"A","B"\n"He said ""hi"" twice"';
    expect(checkCsvTable(csv)).toMatchObject({
      csv: '"Title","Note"\n"A","B"\n"He said ""hi"" twice",""',
      problems: [],
    });
  });

  it("asks for a rewrite when there are no data rows", () => {
    expect(checkCsvTable('"Paper","Year"')).toMatchObject({
      problems: ["no data rows"],
      needsRewrite: true,
    });
  });

  it("asks for a rewrite when the table collapsed to one line, or is empty", () => {
    expect(checkCsvTable('"Kalai et al., 2025"')).toMatchObject({
      problems: ["no data rows"],
      needsRewrite: true,
    });
    expect(checkCsvTable("")).toMatchObject({ problems: ["no header row"], needsRewrite: true });
  });

  it("pads rows short by up to half the header's fields", () => {
    const four = checkCsvTable(['"A","B","C","D"', '"1","2","3"', '"1","2"'].join("\n"));
    expect(four.csv.split("\n").slice(1)).toEqual(['"1","2","3",""', '"1","2","",""']);
    const two = checkCsvTable(['"Paper","Notes"', '"Kalai et al."'].join("\n"));
    expect(two).toMatchObject({ csv: '"Paper","Notes"\n"Kalai et al.",""', problems: [] });
  });

  it("drops a few rows off the header's width, and flags many", () => {
    const good = Array.from({ length: 10 }, (_, i) => `"${i}","x","y"`);
    const few = checkCsvTable(['"A","B","C"', ...good, '"1","2","3","4"'].join("\n"));
    expect(few).toMatchObject({ problems: [], droppedRows: 1 });
    expect(few.csv.split("\n")).toHaveLength(11);

    const many = checkCsvTable(['"A","B","C"', '"1","2","3"', '"1","2","3","4"'].join("\n"));
    expect(many).toMatchObject({
      problems: ["1 of 2 rows don't have the header's 3 fields"],
      needsRewrite: false,
    });
  });

  it("drops blank rows", () => {
    const result = checkCsvTable('"A","B"\n" "\n"1","2"');
    expect(result).toEqual({
      csv: '"A","B"\n"1","2"',
      problems: [],
      droppedRows: 1,
      needsRewrite: false,
    });
  });

  it("flags an unclosed quote as a formatting problem", () => {
    expect(checkCsvTable('"A","B"\n"1","2')).toMatchObject({
      problems: ["a quoted field is never closed"],
      needsRewrite: false,
    });
  });

  it("drops the partial last row of a reply cut off at the output cap", () => {
    const result = checkCsvTable('"A","B"\n"1","2"\n"3","cut off in a\nquoted', {
      truncated: true,
    });
    expect(result).toEqual({
      csv: '"A","B"\n"1","2"',
      problems: [],
      droppedRows: 1,
      needsRewrite: false,
    });
  });

  it("keeps quoted line breaks inside a cell", () => {
    const csv = '"A","B"\n"1","two\nlines"';
    expect(checkCsvTable(csv)).toEqual({ csv, ...ok });
  });
});

describe("cleanCsvOutput", () => {
  it("strips a ```csv fence", () => {
    expect(cleanCsvOutput('```csv\n"a","b"\n"1","2"\n```')).toBe('"a","b"\n"1","2"');
  });

  it("returns already-quoted output unchanged", () => {
    const quoted = '"a","b"\n"1","2"';
    expect(cleanCsvOutput(quoted)).toBe(quoted);
  });

  it("re-quotes every field of unquoted output", () => {
    expect(cleanCsvOutput('a,b\n1,"x, y"')).toBe('"a","b"\n"1","x, y"');
  });

  it("keeps a quoted line break inside one cell", () => {
    expect(cleanCsvOutput('a,b\n1,"two\nlines"')).toBe('"a","b"\n"1","two\nlines"');
  });

  it("skips blank lines", () => {
    expect(cleanCsvOutput("a,b\n\n1,2")).toBe('"a","b"\n"1","2"');
  });

  it("skips whitespace-only lines", () => {
    expect(cleanCsvOutput("a,b\n   \n1,2")).toBe('"a","b"\n"1","2"');
  });

  it("keeps spaces after a closing quote", () => {
    expect(cleanCsvOutput('Title,Quote\nX,"Hello" she said')).toBe(
      '"Title","Quote"\n"X","Hello she said"'
    );
  });

  it("falls back to line-by-line parsing when a quote is never closed", () => {
    expect(cleanCsvOutput('Name,Note\nBob,"unterminated\nAmy,ok\nCal,fine')).toBe(
      '"Name","Note"\n"Bob","unterminated"\n"Amy","ok"\n"Cal","fine"'
    );
  });
});

describe("withoutPipelineWording", () => {
  it.each([
    ["Not specified in notes", "Not specified in the sources"],
    ["not mentioned in the notes", "not mentioned in the sources"],
    ["Not reported in the research notes.", "Not reported in the sources."],
    ["Not specified in provided notes.", "Not specified in the sources."],
    ["Not mentioned in the provided notes", "Not mentioned in the sources"],
    ["venue not explicitly stated in notes)", "venue not explicitly stated in the sources)"],
    [
      "Not explicitly listed in provided notes; preprint",
      "Not explicitly listed in the sources; preprint",
    ],
    ['"Not stated in notes","2020"', '"Not stated in the sources","2020"'],
  ])("rewrites %s", (input, expected) => {
    expect(withoutPipelineWording(input)).toBe(expected);
  });

  it("leaves other mentions of notes alone", () => {
    const text = '"Students took notes by hand","Lecture notes improved recall"';
    expect(withoutPipelineWording(text)).toBe(text);
  });
});
