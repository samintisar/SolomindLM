import { describe, expect, it } from "vitest";
import { spreadsheetTitleSource } from "./title";

describe("spreadsheetTitleSource", () => {
  const csv = [
    '"title","authors","year","method"',
    '"Self-RAG","Asai et al.","2023","Reflection tokens"',
    '"ReAct","Yao et al.","2023","Interleaved reasoning and acting"',
    '"RAG","Lewis et al.","2020","Retriever plus generator"',
  ].join("\n");

  it("describes the whole table: the request, its columns and every row", () => {
    const source = spreadsheetTitleSource(csv, "Compare these papers");

    expect(source).toContain("Compare these papers");
    expect(source).toContain("title, authors, year, method");
    for (const row of ["Self-RAG", "ReAct", "RAG"]) expect(source).toContain(row);
  });

  it("keeps the table within what the title model reads when the request is long", () => {
    const source = spreadsheetTitleSource(csv, `Compare these papers ${"in detail ".repeat(200)}`);

    expect(source.length).toBeLessThanOrEqual(500);
    expect(source).toContain("title, authors, year, method");
    expect(source).toContain("Self-RAG; ReAct; RAG");
  });

  it("works without a request", () => {
    expect(spreadsheetTitleSource(csv, "")).toContain("Self-RAG; ReAct; RAG");
  });

  it("stays short for large tables", () => {
    const big = ['"name","value"', ...Array.from({ length: 500 }, (_, i) => `"Row ${i}","x"`)].join(
      "\n"
    );
    expect(spreadsheetTitleSource(big, "").length).toBeLessThanOrEqual(500);
  });

  it("returns an empty string for an empty table", () => {
    expect(spreadsheetTitleSource("", "")).toBe("");
  });
});
