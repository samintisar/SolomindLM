import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendCalibrationLabels,
  calibrationLabelKey,
  combineLabels,
  judgeFamilyFileName,
  loadCalibration,
} from "./calibrationStore";
import type { JudgeCalibrationItem } from "./judgeQueue";

function item(
  partial: Partial<JudgeCalibrationItem> & Pick<JudgeCalibrationItem, "humanAgree">
): JudgeCalibrationItem {
  return {
    id: 1,
    caseId: "agentic-patterns-20",
    runner: "chat",
    metric: "binary_judge_chat_grounding",
    modelStatus: "fail",
    score: 0,
    modelReason: "claims not in chunks",
    ...partial,
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "calib-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("judgeFamilyFileName", () => {
  it("replaces colons so rubric families are valid file names", () => {
    expect(judgeFamilyFileName("binary_judge_chat_grounding")).toBe(
      "binary_judge_chat_grounding.jsonl"
    );
    expect(judgeFamilyFileName("rubric:medical-students:findings-attributed")).toBe(
      "rubric__medical-students__findings-attributed.jsonl"
    );
  });
});

describe("appendCalibrationLabels", () => {
  it("writes only labelled rows, one file per judge family", () => {
    const written = appendCalibrationLabels(
      dir,
      [
        item({ id: 1, humanAgree: true }),
        item({ id: 2, humanAgree: null, caseId: "other" }),
        item({
          id: 3,
          humanAgree: false,
          metric: "rubric:medical-students:findings-attributed",
          caseId: "medical-students/x",
        }),
      ],
      { commitSha: "abc123" }
    );
    expect(written).toBe(2);
    const chat = readFileSync(join(dir, "binary_judge_chat_grounding.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(chat).toHaveLength(1);
    const row = JSON.parse(chat[0] ?? "") as Record<string, unknown>;
    expect(row).toMatchObject({
      caseId: "agentic-patterns-20",
      runner: "chat",
      metric: "binary_judge_chat_grounding",
      modelStatus: "fail",
      score: 0,
      modelReason: "claims not in chunks",
      humanAgree: true,
      commitSha: "abc123",
      labelKey: calibrationLabelKey({
        caseId: "agentic-patterns-20",
        runner: "chat",
        metric: "binary_judge_chat_grounding",
        modelReason: "claims not in chunks",
      }),
    });
    expect(typeof row.labeledAt).toBe("string");
  });

  it("dedupes by labelKey across calls and within one call", () => {
    const labels = [item({ id: 1, humanAgree: true }), item({ id: 2, humanAgree: true })];
    expect(appendCalibrationLabels(dir, labels, { commitSha: "a" })).toBe(1);
    expect(appendCalibrationLabels(dir, labels, { commitSha: "b" })).toBe(0);
    const stored = loadCalibration(dir)["binary_judge_chat_grounding"] ?? [];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.commitSha).toBe("a");
  });

  it("keeps the same case under a different reason as a separate label", () => {
    appendCalibrationLabels(dir, [item({ humanAgree: true })]);
    appendCalibrationLabels(dir, [item({ humanAgree: false, modelReason: "different reason" })]);
    expect(loadCalibration(dir)["binary_judge_chat_grounding"]).toHaveLength(2);
  });

  it("leaves commitSha off the row when none is given", () => {
    appendCalibrationLabels(dir, [item({ humanAgree: true })]);
    const row = loadCalibration(dir)["binary_judge_chat_grounding"]?.[0];
    expect(row && "commitSha" in row).toBe(false);
  });
});

describe("loadCalibration", () => {
  it("returns an empty object for a directory with no store yet", () => {
    expect(loadCalibration(join(dir, "missing"))).toEqual({});
  });

  it("groups rows by judge family and ignores the README", () => {
    writeFileSync(join(dir, "README.md"), "# not data\n");
    appendCalibrationLabels(dir, [
      item({ humanAgree: true }),
      item({ humanAgree: false, metric: "binary_judge_citation_valid", modelReason: "x" }),
    ]);
    const grouped = loadCalibration(dir);
    expect(Object.keys(grouped).toSorted()).toEqual([
      "binary_judge_chat_grounding",
      "binary_judge_citation_valid",
    ]);
  });

  it("fails loudly on a corrupt row instead of silently dropping it", () => {
    writeFileSync(join(dir, "binary_judge_chat_grounding.jsonl"), "{not json}\n");
    expect(() => loadCalibration(dir)).toThrow(/binary_judge_chat_grounding\.jsonl:1/);
  });
});

describe("combineLabels", () => {
  it("adds labelled queue rows the store lacks, and keeps unlabelled queue rows as unlabelled", () => {
    appendCalibrationLabels(dir, [item({ id: 1, humanAgree: true })]);
    const stored = loadCalibration(dir);
    const combined = combineLabels(stored, [
      item({ id: 1, humanAgree: true }), // already stored: not counted twice
      item({ id: 2, humanAgree: false, modelReason: "fresh" }),
      item({ id: 3, humanAgree: null, modelReason: "pending" }),
    ]);
    expect(combined).toHaveLength(3);
    expect(combined.filter((row) => row.humanAgree !== null)).toHaveLength(2);
  });
});
