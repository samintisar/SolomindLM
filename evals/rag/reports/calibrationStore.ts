/**
 * Versioned judge calibration labels. The labelled judge-queue.json lives in the gitignored
 * `generated/`; the labels a human gives are appended here, one JSONL file per judge family, and
 * committed so agreement accumulates across sessions. See `evals/rag/calibration/README.md`.
 */
import { createHash } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { JudgeLabel } from "./judgeCalibration";
import type { JudgeCalibrationItem } from "./judgeQueue";

/** One human-labelled judge verdict, as stored in `<judge-family>.jsonl`. */
export interface CalibrationRow {
  caseId: string;
  runner: string;
  /** Judge family: the metric name, e.g. `binary_judge_chat_grounding` or `rubric:pack:check` */
  metric: string;
  modelStatus: JudgeCalibrationItem["modelStatus"];
  score: number;
  modelReason: string;
  humanAgree: boolean;
  labeledAt: string;
  commitSha?: string;
  /** sha1(caseId|runner|metric|modelReason): the dedupe key */
  labelKey: string;
}

export function calibrationLabelKey(
  row: Pick<CalibrationRow, "caseId" | "runner" | "metric" | "modelReason">
): string {
  return createHash("sha1")
    .update(`${row.caseId}|${row.runner}|${row.metric}|${row.modelReason}`)
    .digest("hex");
}

/** `rubric:pack:check` becomes `rubric__pack__check.jsonl`. */
export function judgeFamilyFileName(metric: string): string {
  return `${metric.replace(/:/g, "__")}.jsonl`;
}

function isCalibrationRow(value: unknown): value is CalibrationRow {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.caseId === "string" &&
    typeof row.runner === "string" &&
    typeof row.metric === "string" &&
    typeof row.modelReason === "string" &&
    typeof row.labelKey === "string" &&
    typeof row.humanAgree === "boolean"
  );
}

/**
 * Append the labelled rows (`humanAgree !== null`) of `items` to the store in `dir`, skipping any
 * whose labelKey is already stored. The first label for a key wins. Returns the rows written.
 */
export function appendCalibrationLabels(
  dir: string,
  items: JudgeCalibrationItem[],
  options: { commitSha?: string } = {}
): number {
  const known = new Set(
    Object.values(loadCalibration(dir))
      .flat()
      .map((row) => row.labelKey)
  );
  const labeledAt = new Date().toISOString();
  const byFile = new Map<string, string[]>();
  let written = 0;
  for (const item of items) {
    if (item.humanAgree === null) continue;
    const row: CalibrationRow = {
      caseId: item.caseId,
      runner: item.runner,
      metric: item.metric,
      modelStatus: item.modelStatus,
      score: item.score,
      modelReason: item.modelReason,
      humanAgree: item.humanAgree,
      labeledAt,
      ...(options.commitSha ? { commitSha: options.commitSha } : {}),
      labelKey: calibrationLabelKey(item),
    };
    if (known.has(row.labelKey)) continue;
    known.add(row.labelKey);
    const file = judgeFamilyFileName(item.metric);
    const lines = byFile.get(file) ?? [];
    lines.push(JSON.stringify(row));
    byFile.set(file, lines);
    written++;
  }
  if (written === 0) return 0;
  mkdirSync(dir, { recursive: true });
  for (const [file, lines] of byFile) {
    appendFileSync(join(dir, file), `${lines.join("\n")}\n`);
  }
  return written;
}

/**
 * Every stored row in `dir`, grouped by judge family (metric). A missing directory is empty; a
 * corrupt row throws with its file and line, since a silently dropped label would move the score.
 */
export function loadCalibration(dir: string): Record<string, CalibrationRow[]> {
  const grouped: Record<string, CalibrationRow[]> = {};
  if (!existsSync(dir)) return grouped;
  for (const name of readdirSync(dir).toSorted()) {
    if (!name.endsWith(".jsonl")) continue;
    const path = join(dir, name);
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (line.trim() === "") return;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`${path}:${index + 1} is not valid JSON: ${message}`);
      }
      if (!isCalibrationRow(value)) {
        throw new Error(`${path}:${index + 1} is not a calibration row`);
      }
      (grouped[value.metric] ??= []).push(value);
    });
  }
  return grouped;
}

/**
 * Labels for scoring: every stored row, plus the queue's rows. A labelled queue row already in
 * the store (same labelKey) is not counted twice. Unlabelled queue rows are kept so they show
 * up as unlabelled.
 */
export function combineLabels(
  stored: Record<string, CalibrationRow[]>,
  queue: JudgeCalibrationItem[]
): JudgeLabel[] {
  const storedRows = Object.values(stored).flat();
  const keys = new Set(storedRows.map((row) => row.labelKey));
  const extra: JudgeLabel[] = [];
  for (const item of queue) {
    if (item.humanAgree !== null) {
      const key = calibrationLabelKey(item);
      if (keys.has(key)) continue;
      keys.add(key);
    }
    extra.push(item);
  }
  return [...storedRows, ...extra];
}
