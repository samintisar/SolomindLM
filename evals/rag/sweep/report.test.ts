import { describe, expect, it } from "vitest";
import { type CellSummary, markPareto } from "./pareto";
import { renderSweepMarkdown, sortForReport, sweepReport } from "./report";

const cell = (
  id: string,
  overrides: CellSummary["overrides"],
  values: Partial<CellSummary>
): CellSummary => ({
  id,
  overrides,
  quality: 0,
  grounding: 0,
  recall: 0,
  cases: 1,
  tokensMean: 0,
  tokensEstimated: false,
  latencyP95: 0,
  selectedTokensMean: 0,
  pareto: false,
  ...values,
});

const cells = [
  cell("base", {}, { quality: 0.5, tokensMean: 300, latencyP95: 900 }),
  cell("cheap", { hydeEnabled: false }, { quality: 0.5, tokensMean: 100, latencyP95: 500 }),
  cell(
    "best",
    { contextTokenBudget: 4000 },
    { quality: 0.9, tokensMean: 200, latencyP95: 800, tokensEstimated: true }
  ),
];

describe("sortForReport", () => {
  it("sorts by quality, highest first, then by tokens, lowest first", () => {
    expect(sortForReport(cells).map((c) => c.id)).toEqual(["best", "cheap", "base"]);
  });
});

describe("markPareto", () => {
  it("flags the cells on the front and no others", () => {
    const flagged = markPareto(cells);
    expect(
      flagged
        .filter((c) => c.pareto)
        .map((c) => c.id)
        .sort()
    ).toEqual(["best", "cheap"]);
  });
});

describe("renderSweepMarkdown", () => {
  const markdown = renderSweepMarkdown(markPareto(cells), {
    split: "train",
    repeats: 1,
    dryRun: false,
  });

  it("writes the cells in report order, with the Pareto marker on front cells", () => {
    const rows = markdown.split("\n").filter((line) => line.startsWith("| "));
    // The header and the separator row come first.
    const dataRows = rows.slice(2);
    expect(dataRows).toHaveLength(3);
    expect(dataRows[0]).toMatch(/^\| \* \| best \|/);
    expect(dataRows[1]).toMatch(/^\| \* \| cheap \|/);
    expect(dataRows[2]).toMatch(/^\|\s+\| base \|/);
  });

  it("names the baseline and the overrides of each cell", () => {
    expect(markdown).toContain("(baseline)");
    expect(markdown).toContain("hydeEnabled=false");
  });

  it("says that a dry run measures nothing", () => {
    const dry = renderSweepMarkdown(cells, { split: "train", repeats: 1, dryRun: true });
    expect(dry).toContain("the artifacts are stubs");
    expect(markdown).not.toContain("the artifacts are stubs");
  });

  it("marks tokens that were estimated", () => {
    expect(markdown).toMatch(/200 \(est\.\)/);
  });
});

describe("sweepReport", () => {
  it("records the baseline, the cells and the front as JSON", () => {
    const report = sweepReport(markPareto(cells), { split: "train", repeats: 1, dryRun: true });
    expect(report.baselineId).toBe("base");
    expect(report.paretoIds).toEqual(["best", "cheap"]);
    expect(report.cells.map((c) => c.id)).toEqual(["best", "cheap", "base"]);
    expect(report.dryRun).toBe(true);
  });
});
