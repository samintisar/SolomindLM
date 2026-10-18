import { describe, expect, it } from "vitest";
import {
  type CostHistoryRecord,
  caseTokenMedian,
  estimateRunCost,
  formatActualCost,
  formatEstimate,
  formatUsd,
  type ModelRates,
  perRunUsage,
  priceTokens,
  priceUsage,
} from "./cost";

const SMART = "deepseek-ai/DeepSeek-V4.1-Flash";
const JUDGE = "judge/model";

const rates: ModelRates = new Map([
  [SMART, { input: 0.3, output: 1.2, cachedInput: 0.006 }],
  [JUDGE, { input: 1, output: 2 }],
]);

function record(overrides: Partial<CostHistoryRecord> = {}): CostHistoryRecord {
  return {
    at: "2026-10-18T00:00:00.000Z",
    caseId: "case-a",
    runner: "chat",
    runs: 1,
    pipelineModel: SMART,
    judgeModel: JUDGE,
    pipeline: { prompt: 1_000_000, cachedPrompt: 0, completion: 0 },
    judge: { calls: 0, prompt: 0, cachedPrompt: 0, completion: 0 },
    ...overrides,
  };
}

describe("priceTokens", () => {
  it("prices prompt and completion per million tokens", () => {
    expect(
      priceTokens({ prompt: 1_000_000, cachedPrompt: 0, completion: 500_000 }, rates.get(SMART))
    ).toBeCloseTo(0.9);
  });

  it("bills cached prompt tokens at the cached rate", () => {
    const cost = priceTokens(
      { prompt: 1_000_000, cachedPrompt: 1_000_000, completion: 0 },
      rates.get(SMART)
    );
    expect(cost).toBeCloseTo(0.006);
  });

  it("bills cached tokens at the input rate when the model has no cached rate", () => {
    expect(
      priceTokens({ prompt: 1_000_000, cachedPrompt: 400_000, completion: 0 }, rates.get(JUDGE))
    ).toBeCloseTo(1);
  });

  it("returns undefined for an unpriced model", () => {
    expect(priceTokens({ prompt: 10, cachedPrompt: 0, completion: 10 }, undefined)).toBeUndefined();
  });
});

describe("priceUsage", () => {
  it("adds pipeline and judge cost at their own models' rates", () => {
    const cost = priceUsage(
      record({
        pipeline: { prompt: 1_000_000, cachedPrompt: 0, completion: 0 },
        judge: { calls: 4, prompt: 1_000_000, cachedPrompt: 0, completion: 1_000_000 },
      }),
      rates
    );
    expect(cost.pipeline).toBeCloseTo(0.3);
    expect(cost.judge).toBeCloseTo(3);
    expect(cost.total).toBeCloseTo(3.3);
    expect(cost.unpricedModels).toEqual([]);
  });

  it("lists models with no price and leaves their cost out", () => {
    const cost = priceUsage(record({ pipelineModel: "unknown/model" }), rates);
    expect(cost.pipeline).toBe(0);
    expect(cost.unpricedModels).toEqual(["unknown/model"]);
  });
});

describe("perRunUsage", () => {
  it("divides a multi-run record into one run's tokens", () => {
    const usage = perRunUsage(
      record({
        runs: 4,
        pipeline: { prompt: 400, cachedPrompt: 40, completion: 80 },
        judge: { calls: 8, prompt: 800, cachedPrompt: 0, completion: 40 },
      })
    );
    expect(usage.pipeline).toEqual({ prompt: 100, cachedPrompt: 10, completion: 20 });
    expect(usage.judge).toEqual({ calls: 2, prompt: 200, cachedPrompt: 0, completion: 10 });
  });

  it("divides pipeline tokens by the repeats that reported them", () => {
    const usage = perRunUsage(
      record({
        runs: 3,
        pipelineRuns: 2,
        pipeline: { prompt: 200, cachedPrompt: 0, completion: 20 },
        judge: { calls: 6, prompt: 300, cachedPrompt: 0, completion: 30 },
      })
    );
    expect(usage.pipeline).toEqual({ prompt: 100, cachedPrompt: 0, completion: 10 });
    expect(usage.judge).toEqual({ calls: 2, prompt: 100, cachedPrompt: 0, completion: 10 });
  });
});

describe("estimateRunCost", () => {
  const planned = (caseId: string, runner = "chat") => ({
    caseId,
    runner,
    pipelineModel: SMART,
    judgeModel: JUDGE,
  });

  it("multiplies a case's per-run cost by repeats", () => {
    const estimate = estimateRunCost([planned("case-a")], 3, [record()], rates);
    expect(estimate.cases[0]?.basis).toBe("case");
    expect(estimate.cases[0]?.cost).toBeCloseTo(0.9);
    expect(estimate.total).toBeCloseTo(0.9);
    expect(estimate.runs).toBe(3);
  });

  it("uses the median of the case's recent runs, so one outlier does not skew it", () => {
    const history = [1, 1, 10].map((millions) =>
      record({ pipeline: { prompt: millions * 1_000_000, cachedPrompt: 0, completion: 0 } })
    );
    const estimate = estimateRunCost([planned("case-a")], 1, history, rates);
    expect(estimate.total).toBeCloseTo(0.3);
  });

  it("only looks at the most recent runs of a case", () => {
    const old = Array.from({ length: 5 }, (_, i) =>
      record({
        at: `2026-10-0${i + 1}T00:00:00.000Z`,
        pipeline: { prompt: 10_000_000, cachedPrompt: 0, completion: 0 },
      })
    );
    const recent = Array.from({ length: 5 }, (_, i) =>
      record({
        at: `2026-10-1${i}T00:00:00.000Z`,
        pipeline: { prompt: 1_000_000, cachedPrompt: 0, completion: 0 },
      })
    );
    const estimate = estimateRunCost([planned("case-a")], 1, [...recent, ...old], rates);
    expect(estimate.total).toBeCloseTo(0.3);
  });

  it("prices history at the planned models' current rates", () => {
    const estimate = estimateRunCost(
      [{ ...planned("case-a"), pipelineModel: JUDGE }],
      1,
      [record()],
      rates
    );
    expect(estimate.total).toBeCloseTo(1);
  });

  it("falls back to the runner's median when the case has never run", () => {
    const history = [
      record({ caseId: "case-b", pipeline: { prompt: 2_000_000, cachedPrompt: 0, completion: 0 } }),
    ];
    const estimate = estimateRunCost([planned("case-new")], 2, history, rates);
    expect(estimate.cases[0]?.basis).toBe("runner");
    expect(estimate.total).toBeCloseTo(1.2);
  });

  it("reports a case with no case or runner history as unknown", () => {
    const estimate = estimateRunCost([planned("case-new", "research")], 3, [record()], rates);
    expect(estimate.cases[0]?.basis).toBe("unknown");
    expect(estimate.cases[0]?.cost).toBeUndefined();
    expect(estimate.unknownCases).toEqual(["case-new"]);
    expect(estimate.total).toBe(0);
  });

  it("ignores history records with no tokens at all", () => {
    const empty = record({ pipeline: { prompt: 0, cachedPrompt: 0, completion: 0 } });
    const estimate = estimateRunCost([planned("case-a")], 1, [empty], rates);
    expect(estimate.cases[0]?.basis).toBe("unknown");
  });
});

describe("formatUsd", () => {
  it("shows cents for normal amounts and more precision for tiny ones", () => {
    expect(formatUsd(1.234)).toBe("$1.23");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("formatEstimate", () => {
  it("lists each case, marks fallbacks and unknowns, and says what is covered", () => {
    const text = formatEstimate(
      {
        cases: [
          {
            caseId: "a",
            runner: "chat",
            pipelineModel: SMART,
            judgeModel: JUDGE,
            basis: "case",
            cost: 0.12,
          },
          {
            caseId: "b",
            runner: "chat",
            pipelineModel: SMART,
            judgeModel: JUDGE,
            basis: "runner",
            cost: 0.3,
          },
          {
            caseId: "c",
            runner: "research",
            pipelineModel: SMART,
            judgeModel: JUDGE,
            basis: "unknown",
          },
        ],
        runs: 9,
        total: 0.42,
        unknownCases: ["c"],
        unpricedModels: [],
      },
      3,
      "live"
    );
    expect(text).toContain("9 run(s), 3 repeat(s) each");
    expect(text).toContain("$0.12  a");
    expect(text).toContain("b (runner median)");
    expect(text).toContain("?  c (no history)");
    expect(text).toContain("Total ≈ $0.42 + 1 case(s) with no history");
    expect(text).toContain("live prices");
  });
});

describe("formatActualCost", () => {
  it("shows per-case cost with its notes and the total", () => {
    const text = formatActualCost(
      [
        {
          caseId: "a",
          runs: 3,
          cost: { pipeline: 0.1, judge: 0.05, total: 0.15, unpricedModels: [] },
          pipelineEstimated: true,
          pipelineMissingRuns: 1,
        },
      ],
      "fallback"
    );
    expect(text).toContain(
      "$0.15  a ×3 (pipeline $0.10, judges $0.05, pipeline tokens estimated, 1 run(s) reported no pipeline tokens)"
    );
    expect(text).toContain("Total: $0.15");
    expect(text).toContain("built-in prices");
  });
});

describe("caseTokenMedian", () => {
  it("returns the median per-run provider tokens of the case's recent runs", () => {
    const history = [
      record({ runs: 2, pipeline: { prompt: 18_000, cachedPrompt: 0, completion: 2_000 } }),
      record({ pipeline: { prompt: 12_000, cachedPrompt: 0, completion: 0 } }),
      record({ pipeline: { prompt: 90_000, cachedPrompt: 0, completion: 0 } }),
      record({ caseId: "other", pipeline: { prompt: 1, cachedPrompt: 0, completion: 0 } }),
    ].map((r) => ({ ...r, pipelineSource: "provider" as const }));
    expect(caseTokenMedian(history, "case-a")).toBe(12_000);
  });

  it("skips estimated runs and returns undefined without provider history", () => {
    const history = [record({ pipelineSource: "estimated" })];
    expect(caseTokenMedian(history, "case-a")).toBeUndefined();
  });
});
