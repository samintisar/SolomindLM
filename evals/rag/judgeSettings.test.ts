import { describe, expect, it } from "vitest";
import {
  LIVE_CONSISTENCY_SAMPLE,
  parseConsistencyFraction,
  resolveJudgeSettings,
} from "./judgeSettings";

describe("resolveJudgeSettings", () => {
  it("turns reasoning off on smoke when the flag is not given", () => {
    expect(resolveJudgeSettings({ split: "smoke", dryRun: false }).judgeReasoning).toBe(false);
  });

  it("keeps the model default on train and holdout", () => {
    expect(resolveJudgeSettings({ split: "train", dryRun: false }).judgeReasoning).toBeUndefined();
    expect(
      resolveJudgeSettings({ split: "holdout", dryRun: false }).judgeReasoning
    ).toBeUndefined();
  });

  it("keeps the model default for a single case (no effective split)", () => {
    expect(resolveJudgeSettings({ dryRun: false }).judgeReasoning).toBeUndefined();
  });

  it("lets an explicit --judge-reasoning win on smoke", () => {
    expect(
      resolveJudgeSettings({ split: "smoke", dryRun: false, judgeReasoning: true }).judgeReasoning
    ).toBe(true);
    expect(
      resolveJudgeSettings({ split: "holdout", dryRun: false, judgeReasoning: false })
        .judgeReasoning
    ).toBe(false);
  });

  it("samples 10 % of judge calls on live runs and none on dry runs", () => {
    expect(LIVE_CONSISTENCY_SAMPLE).toBe(0.1);
    expect(resolveJudgeSettings({ split: "smoke", dryRun: false }).judgeConsistencySample).toBe(
      0.1
    );
    expect(resolveJudgeSettings({ split: "smoke", dryRun: true }).judgeConsistencySample).toBe(0);
  });

  it("lets an explicit --judge-consistency win on either kind of run", () => {
    expect(
      resolveJudgeSettings({ dryRun: true, judgeConsistency: 0.5 }).judgeConsistencySample
    ).toBe(0.5);
    expect(
      resolveJudgeSettings({ dryRun: false, judgeConsistency: 0 }).judgeConsistencySample
    ).toBe(0);
  });
});

describe("parseConsistencyFraction", () => {
  it("accepts fractions from 0 to 1", () => {
    expect(parseConsistencyFraction("0")).toBe(0);
    expect(parseConsistencyFraction("0.1")).toBe(0.1);
    expect(parseConsistencyFraction(" 1 ")).toBe(1);
  });

  it.each(["", "-0.1", "1.5", "ten", "NaN"])("rejects %j", (value) => {
    expect(() => parseConsistencyFraction(value)).toThrow(/--judge-consistency takes a fraction/);
  });
});
