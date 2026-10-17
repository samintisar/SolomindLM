import { describe, expect, it } from "vitest";
import type { MetricResult, MetricStatus } from "../types";
import { isParaphraseVariant, paraphraseBaseId, paraphraseConsistency } from "./paraphrase";

function row(caseId: string, metric: string, status: MetricStatus, runner = "chat"): MetricResult {
  return {
    metric,
    caseId,
    runner: runner as MetricResult["runner"],
    configHash: "h",
    status,
    score: status === "pass" ? 1 : 0,
    detail: "d",
  };
}

/** A base case plus `n` paraphrases, every row with the given statuses. */
function caseRows(
  base: string,
  n: number,
  recall: MetricStatus[],
  grounding?: MetricStatus[]
): MetricResult[] {
  const rows: MetricResult[] = [];
  const ids = [base, ...Array.from({ length: n }, (_, i) => `${base}--p${i + 1}`)];
  ids.forEach((id, i) => {
    rows.push(row(id, "expected_item_recall", recall[i]!));
    if (grounding) rows.push(row(id, "binary_judge_chat_grounding", grounding[i]!));
  });
  return rows;
}

describe("paraphrase ids", () => {
  it("recognises a paraphrase variant id and strips it to the base id", () => {
    expect(isParaphraseVariant("medical-students/chat-av--p2")).toBe(true);
    expect(paraphraseBaseId("medical-students/chat-av--p2")).toBe("medical-students/chat-av");
    expect(isParaphraseVariant("medical-students/chat-av")).toBe(false);
    expect(paraphraseBaseId("medical-students/chat-av")).toBe("medical-students/chat-av");
  });

  it("does not treat an ordinary id segment as a variant", () => {
    expect(isParaphraseVariant("ml-factoid-p1-things")).toBe(false);
  });
});

describe("paraphraseConsistency", () => {
  it("passes when every paraphrase gets the same verdicts as the base", () => {
    const [result] = paraphraseConsistency(
      caseRows("a/chat-1", 3, ["pass", "pass", "pass", "pass"], ["pass", "pass", "pass", "pass"])
    );
    expect(result?.metric).toBe("paraphrase_consistency");
    expect(result?.caseId).toBe("a/chat-1");
    expect(result?.status).toBe("pass");
    expect(result?.score).toBe(1);
  });

  it("passes at exactly 0.8 and warns at 0.6", () => {
    // Base passes; four of five paraphrases agree: 4/5 = 0.8.
    const pass = paraphraseConsistency(
      caseRows("a/x", 5, ["pass", "pass", "pass", "pass", "pass", "fail"])
    )[0];
    expect(pass?.score).toBeCloseTo(0.8, 5);
    expect(pass?.status).toBe("pass");

    const warn = paraphraseConsistency(
      caseRows("a/x", 5, ["pass", "pass", "pass", "pass", "fail", "fail"])
    )[0];
    // Two of five paraphrases fail recall where the base passed: 3/5 agree.
    expect(warn?.score).toBeCloseTo(0.6, 5);
    expect(warn?.status).toBe("warn");
  });

  it("fails below 0.5", () => {
    const result = paraphraseConsistency(
      caseRows("a/x", 4, ["pass", "fail", "fail", "pass", "fail"])
    )[0];
    expect(result?.score).toBeCloseTo(0.25, 5);
    expect(result?.status).toBe("fail");
  });

  it("counts a paraphrase as inconsistent when either compared judge disagrees with the base", () => {
    const result = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x", "binary_judge_chat_grounding", "pass"),
      row("a/x--p1", "expected_item_recall", "pass"),
      row("a/x--p1", "binary_judge_chat_grounding", "fail"),
    ])[0];
    expect(result?.score).toBe(0);
    expect(result?.status).toBe("fail");
  });

  it("compares only the grounding judge when the base has one", () => {
    const result = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x--p1", "expected_item_recall", "pass"),
    ])[0];
    expect(result?.score).toBe(1);
    expect(result?.breakdown).toMatchObject({
      compared: ["expected_item_recall"],
    });
  });

  it("counts a paraphrase with no row for a compared metric as inconsistent", () => {
    const result = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x", "binary_judge_chat_grounding", "pass"),
      row("a/x--p1", "expected_item_recall", "pass"),
    ])[0];
    expect(result?.score).toBe(0);
  });

  it("lists each variant's statuses in the breakdown", () => {
    const result = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x--p1", "expected_item_recall", "fail"),
    ])[0];
    expect(result?.breakdown?.variants).toEqual([
      {
        caseId: "a/x--p1",
        statuses: { expected_item_recall: "fail" },
        matches: false,
      },
    ]);
  });

  it("treats a pass and a warn as agreeing verdicts", () => {
    const result = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x--p1", "expected_item_recall", "warn"),
    ])[0];
    expect(result?.score).toBe(1);
    expect(result?.status).toBe("pass");
  });

  it("counts a warn against a fail, and a fail against a pass, as disagreeing", () => {
    const warnVsFail = paraphraseConsistency([
      row("a/x", "expected_item_recall", "fail"),
      row("a/x--p1", "expected_item_recall", "warn"),
    ])[0];
    expect(warnVsFail?.score).toBe(0);

    const failVsPass = paraphraseConsistency([
      row("a/x", "expected_item_recall", "pass"),
      row("a/x--p1", "expected_item_recall", "fail"),
    ])[0];
    expect(failVsPass?.score).toBe(0);
  });

  it("emits nothing for a case with no paraphrases", () => {
    expect(paraphraseConsistency(caseRows("a/x", 0, ["pass"]))).toEqual([]);
  });

  it("emits nothing when the base case has no comparable rows", () => {
    expect(paraphraseConsistency([row("a/x--p1", "expected_item_recall", "pass")])).toEqual([]);
  });

  it("emits one row per base case", () => {
    const rows = [
      ...caseRows("a/one", 1, ["pass", "pass"]),
      ...caseRows("a/two", 1, ["pass", "fail"]),
    ];
    const results = paraphraseConsistency(rows);
    expect(results.map((r) => r.caseId).sort()).toEqual(["a/one", "a/two"]);
  });
});
