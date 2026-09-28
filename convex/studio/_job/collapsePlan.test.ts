import { describe, expect, it } from "vitest";
import { planCollapseGroups, shouldStopCollapsing } from "./collapsePlan";

// One "token" per character keeps the arithmetic in these tests obvious.
const estimate = (text: string) => text.length;
const out = (size: number, tag = "x") => tag.repeat(size);

describe("shouldStopCollapsing", () => {
  it("stops when two or fewer outputs remain", () => {
    expect(shouldStopCollapsing([out(50), out(50)], 10, estimate)).toBe(true);
  });

  it("stops when the combined outputs already fit the target", () => {
    expect(shouldStopCollapsing([out(3), out(3), out(3)], 10, estimate)).toBe(true);
  });

  it("continues when there are more than two outputs over the target", () => {
    expect(shouldStopCollapsing([out(8), out(8), out(8)], 10, estimate)).toBe(false);
  });
});

describe("planCollapseGroups", () => {
  it("packs outputs into groups that fit the token target", () => {
    const [a, b, c, d] = [out(5, "a"), out(5, "b"), out(5, "c"), out(5, "d")];
    expect(planCollapseGroups([a, b, c, d], 10, estimate)).toEqual([
      [a, b],
      [c, d],
    ]);
  });

  it("pairs outputs that are each larger than half the target instead of leaving them alone", () => {
    // Regression for #170: three ~8k-token outputs against a 15k target used to
    // produce three singleton groups every round, so the count never dropped.
    const outputs = [out(8, "a"), out(8, "b"), out(8, "c")];
    const groups = planCollapseGroups(outputs, 10, estimate);

    expect(groups.length).toBeLessThan(outputs.length);
    for (const group of groups.slice(0, -1)) {
      expect(group.length).toBeGreaterThanOrEqual(2);
    }
    expect(groups.flat()).toEqual(outputs);
  });

  it("pairs an oversized leading output with the next one and leaves a trailing singleton alone", () => {
    const [big, s1, s2] = [out(12, "a"), out(3, "b"), out(3, "c")];
    expect(planCollapseGroups([big, s1, s2], 10, estimate)).toEqual([[big, s1], [s2]]);
  });

  it("never puts more than two outputs in a group that exceeds the target", () => {
    const outputs = [out(30, "a"), out(30, "b"), out(30, "c"), out(30, "d"), out(30, "e")];
    const groups = planCollapseGroups(outputs, 10, estimate);

    for (const group of groups) {
      const tokens = group.reduce((sum, text) => sum + estimate(text), 0);
      if (tokens > 10) {
        expect(group.length).toBeLessThanOrEqual(2);
      }
    }
    expect(groups.flat()).toEqual(outputs);
  });

  it("roughly halves the output count every round, even when collapsing never shrinks text", () => {
    // Worst case: the LLM returns something as large as its input. Each round
    // must still reduce the count so the loop terminates.
    let outputs = Array.from({ length: 71 }, (_, i) => out(9, String.fromCharCode(65 + (i % 26))));
    let rounds = 0;

    while (!shouldStopCollapsing(outputs, 10, estimate)) {
      const groups = planCollapseGroups(outputs, 10, estimate);
      expect(groups.length).toBeLessThanOrEqual(Math.ceil(outputs.length / 2));
      outputs = groups.map((group) => group.join(""));
      rounds++;
      expect(rounds).toBeLessThan(10);
    }

    expect(outputs.length).toBeLessThanOrEqual(2);
  });
});
