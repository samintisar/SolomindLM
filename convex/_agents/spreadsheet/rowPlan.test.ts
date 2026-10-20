import { describe, expect, it } from "vitest";
import { parseCsv } from "../../_shared/csv.helpers.js";
import { alignRowsToPlan, formatRowPlan, MAX_PLANNED_ROWS, parseRowPlan, rowKey } from "./rowPlan";

const firstCells = (csv: string) => parseCsv(csv).map((r) => r[0]);

describe("rowKey", () => {
  it("drops list numbering and punctuation, keeps accents", () => {
    expect(rowKey("1. Prompt-Chaining")).toBe("prompt chaining");
    expect(rowKey("#12) Réflexion")).toBe("réflexion");
  });
});

describe("parseRowPlan", () => {
  it("reads a rows object, with text or a code fence around it", () => {
    expect(parseRowPlan('Here:\n```json\n{"rows": ["A", "B"]}\n```')).toEqual(["A", "B"]);
  });

  it("reads a bare array and a plain list", () => {
    expect(parseRowPlan('["A", "B"]')).toEqual(["A", "B"]);
    expect(parseRowPlan("1. Alpha\n- Beta\n\n* Gamma")).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("drops duplicate names", () => {
    expect(parseRowPlan('{"rows": ["Tool Use", "tool-use", "Memory"]}')).toEqual([
      "Tool Use",
      "Memory",
    ]);
  });

  it("gives up on a plan too long to help", () => {
    const rows = Array.from({ length: MAX_PLANNED_ROWS + 1 }, (_, i) => `Item ${i}`);
    expect(parseRowPlan(JSON.stringify({ rows }))).toEqual([]);
  });
});

describe("formatRowPlan", () => {
  it("is empty without a plan", () => {
    expect(formatRowPlan([])).toBe("");
  });

  it("numbers the planned rows", () => {
    expect(formatRowPlan(["A", "B"])).toContain("exactly one row for each of these 2 items");
    expect(formatRowPlan(["A", "B"])).toContain("1. A\n2. B");
  });
});

describe("alignRowsToPlan", () => {
  const csv = [
    '"Pattern","Use case"',
    '"Prompt Chaining","Pipelines"',
    '"Reflection (Self-Critique)","Drafts"',
    '"Unit Testing / Quality Control Loop","Code"',
    '"Routing","Triage"',
    '"Prompt Chaining Pattern","Again"',
  ].join("\n");

  it("drops rows outside the plan and second rows for the same item", () => {
    const result = alignRowsToPlan(csv, ["Prompt Chaining", "Reflection", "Routing"]);
    expect(firstCells(result.csv)).toEqual([
      "Pattern",
      "Prompt Chaining",
      "Reflection (Self-Critique)",
      "Routing",
    ]);
    expect(result.dropped).toEqual([
      "Unit Testing / Quality Control Loop",
      "Prompt Chaining Pattern",
    ]);
  });

  it("finds the item names in a column other than the first", () => {
    const timeline = [
      '"Date","Event"',
      '"1969","Moon landing"',
      '"1970","Some aside"',
      '"1972","Last Apollo mission"',
    ].join("\n");
    const result = alignRowsToPlan(timeline, ["Moon landing", "Last Apollo mission"]);
    expect(firstCells(result.csv)).toEqual(["Date", "1969", "1972"]);
  });

  it("leaves the table alone when its names don't line up with the plan", () => {
    const result = alignRowsToPlan(csv, ["Alpha", "Beta", "Gamma", "Delta"]);
    expect(result).toEqual({ csv, dropped: [] });
  });

  it("drops exact duplicate rows with or without a plan", () => {
    const dup = ['"Item","Value"', '"A","1"', '"B","2"', '"a","1"'].join("\n");
    const result = alignRowsToPlan(dup, []);
    expect(firstCells(result.csv)).toEqual(["Item", "A", "B"]);
    expect(result.dropped).toEqual(["a"]);
  });

  it("keeps a short name inside a longer one from claiming the row", () => {
    const table = ['"Pattern","x"', '"Memory Management","1"', '"RAG","2"'].join("\n");
    const result = alignRowsToPlan(table, ["Memory Management", "RAG"]);
    expect(result.dropped).toEqual([]);
  });

  it("returns unparseable output unchanged", () => {
    expect(alignRowsToPlan('"open', ["A"])).toEqual({ csv: '"open', dropped: [] });
  });
});
