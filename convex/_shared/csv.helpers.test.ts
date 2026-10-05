import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvDetailed, serializeCsv } from "./csv.helpers";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted commas, doubled quotes and newlines inside cells", () => {
    expect(parseCsv('"x, y","say ""hi""","line 1\nline 2"')).toEqual([
      ["x, y", 'say "hi"', "line 1\nline 2"],
    ]);
  });

  it("accepts CRLF, a trailing newline and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells and ragged rows", () => {
    expect(parseCsv("a,b,c\n1,,3\n4")).toEqual([["a", "b", "c"], ["1", "", "3"], ["4"]]);
  });

  it("skips blank lines but keeps a row of empty fields", () => {
    expect(parseCsv("a,b\n\n,\n")).toEqual([
      ["a", "b"],
      ["", ""],
    ]);
  });

  it("does not trim unquoted fields", () => {
    expect(parseCsv(" a , b ")).toEqual([[" a ", " b "]]);
  });

  it("drops whitespace between a closing quote and the next comma", () => {
    expect(parseCsv('"a" , "b"')).toEqual([["a", "b"]]);
  });

  it("keeps spaces in stray text after a closing quote", () => {
    expect(parseCsv('"a" b c,d')).toEqual([["a b c", "d"]]);
    expect(parseCsv('"Hello" she said')).toEqual([["Hello she said"]]);
  });

  it("returns no rows for empty or whitespace-only input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
    expect(parseCsv("   ")).toEqual([]);
  });

  it("skips whitespace-only lines but keeps quoted whitespace fields", () => {
    expect(parseCsv("a\n \t \nb")).toEqual([["a"], ["b"]]);
    expect(parseCsv('"   "')).toEqual([["   "]]);
    expect(parseCsv("a, ,b")).toEqual([["a", " ", "b"]]);
  });

  it("treats an unterminated quote as running to the end", () => {
    expect(parseCsv('a,"b\nc')).toEqual([["a", "b\nc"]]);
  });
});

describe("parseCsvDetailed", () => {
  it("reports an unterminated quote", () => {
    expect(parseCsvDetailed('a,"b\nc')).toEqual({ rows: [["a", "b\nc"]], unterminatedQuote: true });
  });

  it("reports no problem for well-formed input", () => {
    expect(parseCsvDetailed('a,"b"\n1,2')).toEqual({
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
      unterminatedQuote: false,
    });
  });
});

describe("serializeCsv", () => {
  it("quotes only fields that need it", () => {
    expect(
      serializeCsv([
        ["plain", "a,b", 'q"t', "two\nlines", " pad"],
        ["1", "", "3", "4", "5"],
      ])
    ).toBe('plain,"a,b","q""t","two\nlines"," pad"\n1,,3,4,5');
  });

  it("writes a lone empty field as a quoted empty string so the row survives", () => {
    expect(serializeCsv([["h"], [""]])).toBe('h\n""');
    expect(parseCsv(serializeCsv([["h"], [""]]))).toEqual([["h"], [""]]);
  });

  it("can quote every field", () => {
    expect(serializeCsv([["a", "b"]], { quoteAll: true })).toBe('"a","b"');
  });
});

describe("round trip", () => {
  const cases: string[][][] = [
    [
      ["a", "b"],
      ["1", "2"],
    ],
    [
      ["x, y", 'say "hi"', "line 1\r\nline 2"],
      ["", "", ""],
    ],
    [["only"], [""], ["z"]],
    [["h"], ["   "]],
    [["a", "b", "c"], ["1"], ["2", "3"]],
  ];
  it.each(cases.map((rows) => [rows]))("parseCsv(serializeCsv(rows)) equals rows", (rows) => {
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });

  it("serializeCsv(parseCsv(x)) is stable after one normalisation", () => {
    const generated = '"Tool","Install (s)"\n"npm","38.2"\n"Bun","3.1"';
    const once = serializeCsv(parseCsv(generated));
    expect(once).toBe("Tool,Install (s)\nnpm,38.2\nBun,3.1");
    expect(serializeCsv(parseCsv(once))).toBe(once);
  });
});
