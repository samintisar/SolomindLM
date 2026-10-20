import { describe, expect, it } from "vitest";
import { checkCsvTable, cleanCsvOutput, withoutPipelineWording } from "./csvHelpers";

describe("checkCsvTable", () => {
  it("passes a well-formed table through unchanged", () => {
    const csv = '"Item","Amount"\n"Net sales","$69,154"';
    expect(checkCsvTable(csv)).toEqual({ csv, problems: [] });
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
      problems: [],
    });
  });

  it("keeps a real escaped quote that doesn't split into the header's width", () => {
    const csv = '"Title","Note"\n"He said ""hi"" twice"';
    expect(checkCsvTable(csv)).toEqual({
      csv,
      problems: ["1 of 1 rows don't have the header's 2 fields"],
    });
  });

  it("flags a table with a header and no data rows", () => {
    expect(checkCsvTable('"Paper","Year"').problems).toEqual(["no data rows"]);
  });

  it("flags a missing header", () => {
    expect(checkCsvTable('"Kalai et al., 2025"').problems).toEqual([
      "no header row with at least two columns",
    ]);
    expect(checkCsvTable("").problems).toEqual(["no header row with at least two columns"]);
  });

  it("pads a row short by a field or two, and flags rows far off the header's width", () => {
    const csv = ['"A","B","C","D"', '"1","2","3"', '"x"', '"1","2","3","4","5"'].join("\n");
    const result = checkCsvTable(csv);
    expect(result.csv.split("\n")[1]).toBe('"1","2","3",""');
    expect(result.problems).toEqual(["2 of 3 rows don't have the header's 4 fields"]);
  });

  it("flags an unclosed quote", () => {
    expect(checkCsvTable('"A","B"\n"1","2').problems).toEqual(["a quoted field is never closed"]);
  });

  it("keeps quoted line breaks inside a cell", () => {
    const csv = '"A","B"\n"1","two\nlines"';
    expect(checkCsvTable(csv)).toEqual({ csv, problems: [] });
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
