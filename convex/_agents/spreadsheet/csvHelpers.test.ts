import { describe, expect, it } from "vitest";
import { cleanCsvOutput, withoutPipelineWording } from "./csvHelpers";

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
