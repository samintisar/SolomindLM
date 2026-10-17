/**
 * Judge settings that depend on the run. Smoke runs judge cheaply and repeatably (reasoning off);
 * live runs re-run a sample of judge calls to measure self-consistency. Dry runs call no judge.
 */
import type { EvalSplit } from "./types";

/** Share of binary judge calls re-run on live runs (`--judge-consistency`). */
export const LIVE_CONSISTENCY_SAMPLE = 0.1;

export interface JudgeSettingsInput {
  /** Effective split (live runs without --case default to smoke before this is called) */
  split?: EvalSplit;
  dryRun: boolean;
  /** `--judge-reasoning on|off`, when given */
  judgeReasoning?: boolean;
  /** `--judge-consistency <fraction>`, when given */
  judgeConsistency?: number;
}

export interface JudgeSettings {
  /** `undefined` leaves the judge model's own default */
  judgeReasoning?: boolean;
  judgeConsistencySample: number;
}

export function resolveJudgeSettings(input: JudgeSettingsInput): JudgeSettings {
  return {
    judgeReasoning: input.judgeReasoning ?? (input.split === "smoke" ? false : undefined),
    judgeConsistencySample: input.judgeConsistency ?? (input.dryRun ? 0 : LIVE_CONSISTENCY_SAMPLE),
  };
}

/** Parses `--judge-consistency`: a fraction from 0 to 1. */
export function parseConsistencyFraction(value: string): number {
  const trimmed = value.trim();
  const fraction = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
    throw new Error("--judge-consistency takes a fraction from 0 to 1 (e.g. 0.1). See --help.");
  }
  return fraction;
}
