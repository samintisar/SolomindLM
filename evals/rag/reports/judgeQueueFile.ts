import { readFileSync } from "fs";
import type { JudgeCalibrationItem } from "./judgeQueue";

export function loadJudgeQueueFile(path: string): JudgeCalibrationItem[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { items?: JudgeCalibrationItem[] };
  if (!Array.isArray(raw.items)) {
    throw new Error(`Judge queue file missing items array: ${path}`);
  }
  return raw.items;
}
