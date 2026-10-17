import type { JudgeCalibrationItem } from "./judgeQueue";
import { PROMOTE_PREFIXES } from "./promotion";

/** A judge verdict with the human's call on it. `humanAgree: null` means not yet labelled. */
export type JudgeLabel = Pick<JudgeCalibrationItem, "metric" | "modelStatus" | "humanAgree">;

interface JudgeFamilyCalibration {
  labeled: number;
  agreed: number;
  agreement: number;
  /** Cohen's kappa of model verdict vs human verdict (0 when verdicts are all one class). */
  kappa: number;
  /** Every model verdict in the family is the same class, so kappa cannot be measured. */
  singleClass: boolean;
  /** Enough labels, agreement and kappa to trust this judge. Per family, not global. */
  blockingReady: boolean;
}

export interface JudgeCalibrationScore {
  labeled: number;
  unlabeled: number;
  agreed: number;
  agreement: number;
  /** Per judge family (metric name). Only families with at least one labelled row appear. */
  byJudge: Record<string, JudgeFamilyCalibration>;
  /**
   * Every promoting judge family (metric prefix in `PROMOTE_PREFIXES`) has labels and each one
   * is blocking-ready. Reported, not enforced: promotion does not read this.
   */
  readyForPromptCompile: boolean;
}

const MIN_LABELED = 20;
const MIN_AGREEMENT = 0.8;
const MIN_KAPPA = 0.6;

/**
 * Cohen's kappa for two boolean verdict vectors of equal length. Returns 0 when both verdicts
 * are one class (kappa is undefined there, and perfect agreement on one class says nothing about
 * whether the judge can tell pass from fail).
 */
export function cohensKappa(model: boolean[], human: boolean[]): number {
  const n = model.length;
  if (n === 0) return 0;
  let agree = 0;
  let modelPass = 0;
  let humanPass = 0;
  for (let i = 0; i < n; i++) {
    if (model[i] === human[i]) agree++;
    if (model[i]) modelPass++;
    if (human[i]) humanPass++;
  }
  const observed = agree / n;
  const pm = modelPass / n;
  const ph = humanPass / n;
  const expected = pm * ph + (1 - pm) * (1 - ph);
  if (1 - expected <= Number.EPSILON) return 0;
  return (observed - expected) / (1 - expected);
}

type LabelledRow = JudgeLabel & { humanAgree: boolean };

function isLabelled(row: JudgeLabel): row is LabelledRow {
  return row.humanAgree !== null;
}

function familyStats(labels: JudgeLabel[]): JudgeFamilyCalibration {
  const labeled = labels.filter(isLabelled);
  const agreed = labeled.filter((row) => row.humanAgree).length;
  const agreement = labeled.length === 0 ? 0 : agreed / labeled.length;
  // Human verdict = the model's verdict when the human agrees with it, the opposite otherwise.
  const model = labeled.map((row) => row.modelStatus === "pass");
  const human = labeled.map((row, i) => (row.humanAgree ? model[i] : !model[i]));
  const kappa = cohensKappa(model, human);
  const singleClass = labeled.length > 0 && model.every((verdict) => verdict === model[0]);
  return {
    labeled: labeled.length,
    agreed,
    agreement,
    kappa,
    singleClass,
    blockingReady:
      labeled.length >= MIN_LABELED && agreement >= MIN_AGREEMENT && kappa >= MIN_KAPPA,
  };
}

export function scoreJudgeCalibration(labels: JudgeLabel[]): JudgeCalibrationScore {
  const unlabeled = labels.filter((row) => !isLabelled(row)).length;
  const labeledRows = labels.filter(isLabelled);
  const agreed = labeledRows.filter((row) => row.humanAgree).length;
  const labeled = labeledRows.length;
  const agreement = labeled === 0 ? 0 : agreed / labeled;

  const metrics = [...new Set(labeledRows.map((row) => row.metric))].sort();
  const byJudge: Record<string, JudgeFamilyCalibration> = {};
  for (const metric of metrics) {
    byJudge[metric] = familyStats(labeledRows.filter((row) => row.metric === metric));
  }

  // A promoting prefix needs at least one labelled family, and every labelled family under it
  // must be blocking-ready. Without the first condition, a prefix nobody labelled would pass.
  const readyForPromptCompile = PROMOTE_PREFIXES.every((prefix) => {
    const members = metrics.filter((metric) => metric.startsWith(prefix));
    return members.length > 0 && members.every((metric) => byJudge[metric]?.blockingReady === true);
  });

  return { labeled, unlabeled, agreed, agreement, byJudge, readyForPromptCompile };
}

/** One line per judge family: the per-judge table the CLI prints. */
/** Why a family is not ready, for the table; empty when it is ready. */
function calibrationReason(row: JudgeFamilyCalibration): string {
  if (row.blockingReady) return "";
  if (row.singleClass) return "  (single class — label at least one fail/pass)";
  const reasons: string[] = [];
  if (row.labeled < MIN_LABELED) reasons.push(`under ${MIN_LABELED} labels`);
  if (row.agreement < MIN_AGREEMENT) reasons.push(`agreement below ${MIN_AGREEMENT}`);
  if (row.kappa < MIN_KAPPA) reasons.push(`kappa below ${MIN_KAPPA}`);
  return reasons.length > 0 ? `  (${reasons.join(", ")})` : "";
}

export function formatJudgeCalibrationTable(score: JudgeCalibrationScore): string[] {
  const lines = ["  Judge calibration (per family):"];
  const families = Object.keys(score.byJudge);
  if (families.length === 0) {
    lines.push("    (no labelled rows)");
    return lines;
  }
  for (const family of families) {
    const row = score.byJudge[family];
    if (!row) continue;
    const pct = `${Math.round(row.agreement * 100)}%`;
    const status = row.blockingReady ? "ready" : "not ready";
    lines.push(
      `    ${family.padEnd(44)} labeled ${String(row.labeled).padStart(3)}  agreement ${pct.padStart(4)}  kappa ${row.kappa.toFixed(2)}  ${status}${calibrationReason(row)}`
    );
  }
  return lines;
}
