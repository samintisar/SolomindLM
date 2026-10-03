import { describe, expect, it } from "vitest";
import type { ConcreteRunnerKind, EvalSplit } from "../../types";
import { getPack } from "../index";
import { validatePack } from "../validate";

const RUNNERS = ["report", "chat", "mindmap", "spreadsheet"] as const;

describe("professionals pack", () => {
  const registered = getPack("professionals");
  const { pack, fixtures } = registered;

  it("is valid", () => {
    expect(validatePack(registered)).toEqual([]);
  });

  it("has 2 smoke, 6 train and 2 holdout fixtures", () => {
    const count = (split: EvalSplit) => fixtures.filter((f) => f.split === split).length;
    expect([count("smoke"), count("train"), count("holdout")]).toEqual([2, 6, 2]);
  });

  it("exercises every feature at least twice", () => {
    expect(pack.features).toEqual([...RUNNERS]);
    const count = (runner: ConcreteRunnerKind) =>
      fixtures.filter((f) => f.runner === runner).length;
    for (const runner of RUNNERS) expect(count(runner)).toBeGreaterThanOrEqual(2);
  });

  it("scopes every fixture to one report except the cross-report mind map", () => {
    const unscoped = fixtures.filter((f) => !f.studioParams?.documentTitleHint).map((f) => f.id);
    expect(unscoped).toEqual(["professionals/mindmap-cross-report-risks"]);
    for (const f of fixtures) {
      const hint = f.studioParams?.documentTitleHint;
      if (hint) expect(pack.sources.filter((s) => s.includes(hint))).toHaveLength(1);
    }
  });

  it("has the six rubric checks from the design", () => {
    expect(pack.rubric.map((c) => c.id)).toEqual([
      "numbers-exact",
      "forecast-not-fact",
      "attributed-correctly",
      "exec-summary-leads",
      "table-cells-from-source",
      "no-unsourced-advice",
    ]);
  });
});
