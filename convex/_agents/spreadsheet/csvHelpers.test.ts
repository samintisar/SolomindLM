import { describe, expect, it } from "vitest";
import { cleanCsvOutput } from "./csvHelpers";

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
});
