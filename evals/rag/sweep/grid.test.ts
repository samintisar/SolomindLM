import { describe, expect, it } from "vitest";
import { buildSweepCells, cartesian, cellId, parseGrid } from "./grid";

describe("parseGrid", () => {
  it("parses axes separated by semicolons, with typed values", () => {
    expect(parseGrid("hydeEnabled=true,false;contextTokenBudget=4000,8000")).toEqual([
      { key: "hydeEnabled", values: [true, false] },
      { key: "contextTokenBudget", values: [4000, 8000] },
    ]);
  });

  it("reads an empty spec as no axes", () => {
    expect(parseGrid("")).toEqual([]);
  });

  it("rejects an unknown key, a bad value, and a key on two axes", () => {
    expect(() => parseGrid("hydeOn=true,false")).toThrow(/Unknown/);
    expect(() => parseGrid("maxSubqueries=2,9")).toThrow(/maxSubqueries/);
    expect(() => parseGrid("hydeEnabled=true;hydeEnabled=false")).toThrow(/two axes/);
  });

  it("rejects an axis with no values", () => {
    expect(() => parseGrid("hydeEnabled=")).toThrow();
  });
});

describe("cartesian", () => {
  it("is the product of the axes", () => {
    const cells = cartesian(parseGrid("hydeEnabled=true,false;keywordVariants=0,2"));
    expect(cells).toHaveLength(4);
    expect(cells).toContainEqual({ hydeEnabled: false, keywordVariants: 0 });
  });

  it("is one empty override set when there are no axes", () => {
    expect(cartesian([])).toEqual([{}]);
  });
});

describe("buildSweepCells", () => {
  it("always includes the empty override set as the baseline, first", () => {
    const cells = buildSweepCells(parseGrid("hydeEnabled=false"));
    expect(cells.map((c) => c.overrides)).toEqual([{}, { hydeEnabled: false }]);
  });

  it("gives a single baseline cell when there is no grid", () => {
    expect(buildSweepCells([]).map((c) => c.overrides)).toEqual([{}]);
  });
});

describe("cellId", () => {
  it("is the same for the same overrides in any key order", () => {
    expect(cellId({ hydeEnabled: false, contextTokenBudget: 4000 })).toBe(
      cellId({ contextTokenBudget: 4000, hydeEnabled: false })
    );
  });

  it("differs between different overrides and is short", () => {
    const a = cellId({ hydeEnabled: false });
    expect(a).not.toBe(cellId({ hydeEnabled: true }));
    expect(a).toHaveLength(8);
  });

  it("ignores keys set to undefined", () => {
    expect(cellId({ hydeEnabled: undefined })).toBe(cellId({}));
  });
});
