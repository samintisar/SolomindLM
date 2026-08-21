import type { JudgeCalibrationItem } from "./judgeQueue";

export interface JudgeCalibrationScore {
  labeled: number;
  unlabeled: number;
  agreed: number;
  agreement: number;
  /** Loop 3 must not start until this is true. */
  readyForPromptCompile: boolean;
}

const MIN_LABELED = 20;
const MIN_AGREEMENT = 0.8;

export function scoreJudgeCalibration(items: JudgeCalibrationItem[]): JudgeCalibrationScore {
  const unlabeled = items.filter((row) => row.humanAgree === null).length;
  const labeledRows = items.filter((row) => row.humanAgree !== null);
  const agreed = labeledRows.filter((row) => row.humanAgree === true).length;
  const labeled = labeledRows.length;
  const agreement = labeled === 0 ? 0 : agreed / labeled;
  return {
    labeled,
    unlabeled,
    agreed,
    agreement,
    readyForPromptCompile: labeled >= MIN_LABELED && agreement >= MIN_AGREEMENT,
  };
}
