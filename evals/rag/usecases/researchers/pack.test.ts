import { describe, expect, it } from "vitest";
import type { ConcreteRunnerKind, EvalSplit } from "../../types";
import { getPack } from "../index";
import { validatePack } from "../validate";

const RUNNERS = ["chat", "report", "spreadsheet", "mindmap", "literatureReview"] as const;

describe("researchers pack", () => {
  const registered = getPack("researchers");
  const { pack, fixtures } = registered;
  const count = (runner: ConcreteRunnerKind) => fixtures.filter((f) => f.runner === runner).length;

  it("is valid", () => {
    expect(validatePack(registered)).toEqual([]);
  });

  it("has 2 smoke, 7 train and 2 holdout fixtures", () => {
    const bySplit = (split: EvalSplit) => fixtures.filter((f) => f.split === split).length;
    expect([bySplit("smoke"), bySplit("train"), bySplit("holdout")]).toEqual([2, 7, 2]);
  });

  it("exercises every feature, with one literature review smoke", () => {
    expect(pack.features).toEqual([...RUNNERS]);
    expect(count("literatureReview")).toBe(1);
    for (const runner of ["chat", "spreadsheet", "mindmap"] as const) {
      expect(count(runner)).toBeGreaterThanOrEqual(1);
    }
    expect(count("chat")).toBeGreaterThanOrEqual(3);
  });

  it("scopes single-paper questions to exactly one paper", () => {
    for (const f of fixtures) {
      const hint = f.studioParams?.documentTitleHint;
      if (hint) expect(pack.sources.filter((s) => s.includes(hint))).toHaveLength(1);
    }
  });

  it("has the six rubric checks from the design", () => {
    expect(pack.rubric.map((c) => c.id)).toEqual([
      "findings-attributed",
      "numbers-exact",
      "association-not-causation",
      "conflicts-surfaced",
      "limitations-noted",
      "review-cites-sources",
    ]);
  });
});
