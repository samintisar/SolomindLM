/**
 * Eligibility criteria and screening decisions for literature reviews (#351).
 *
 * Planning derives criteria from the question; the screener checks each paper against every
 * criterion; this module turns those checks into an include/exclude decision. The decision is
 * made here, not by the model's verdict alone: a paper that fails any criterion, or whose
 * abstract leaves most criteria unclear, is excluded. A paper that could not be screened is
 * excluded with that reason rather than waved through.
 */
import { v } from "convex/values";

export type ScreeningCriterion = { label: string; description: string };

export type CriterionStatus = "met" | "unclear" | "not_met";

export type CriterionAssessment = {
  label: string;
  status: CriterionStatus;
  explanation: string;
};

export type ScreeningDecision = {
  isIncluded: boolean;
  reason: string;
  /** Per-criterion checks, when the screener returned them. */
  criteria?: CriterionAssessment[];
  /** True when the paper could not be screened (model error or no decision). */
  screeningFailed?: boolean;
};

export const screeningCriterionValidator = v.object({
  label: v.string(),
  description: v.string(),
});

export const criterionAssessmentValidator = v.object({
  label: v.string(),
  status: v.union(v.literal("met"), v.literal("unclear"), v.literal("not_met")),
  explanation: v.string(),
});

export const MAX_SCREENING_CRITERIA = 6;

const MIN_SCREENING_CRITERIA = 2;

/** Used when planning returned no usable criteria. Topic-neutral by design. */
export const DEFAULT_SCREENING_CRITERIA: ScreeningCriterion[] = [
  {
    label: "Addresses the question",
    description:
      "The paper's main subject directly addresses the research question, not just a neighbouring topic or a passing mention.",
  },
  {
    label: "Reports evidence",
    description:
      "The paper reports empirical results, a formal evaluation or analysis, or systematically reviews such evidence; editorials, opinion and position pieces do not qualify.",
  },
  {
    label: "Enough detail to extract",
    description:
      "The title and abstract describe the methods and findings specifically enough to extract data that helps answer the question.",
  },
];

const NOT_ASSESSED = "Not assessed.";

export function normalizeScreeningCriteria(
  raw: ReadonlyArray<{ label?: string; description?: string }> | undefined
): ScreeningCriterion[] {
  const seen = new Set<string>();
  const out: ScreeningCriterion[] = [];
  for (const item of raw ?? []) {
    const label = item.label?.trim() ?? "";
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, description: item.description?.trim() || label });
    if (out.length === MAX_SCREENING_CRITERIA) break;
  }
  return out.length >= MIN_SCREENING_CRITERIA ? out : DEFAULT_SCREENING_CRITERIA;
}

export function formatCriteriaForPrompt(criteria: ScreeningCriterion[]): string {
  return criteria.map((c, i) => `${i + 1}. ${c.label}: ${c.description}`).join("\n");
}

export function normalizeCriterionStatus(raw: string): CriterionStatus {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (s === "met" || s === "yes" || s === "true" || s === "satisfied") return "met";
  if (
    s === "not_met" ||
    s === "unmet" ||
    s === "no" ||
    s === "false" ||
    s === "not_satisfied" ||
    s === "fails"
  ) {
    return "not_met";
  }
  return "unclear";
}

const STATUS_STRICTNESS: Record<CriterionStatus, number> = { met: 0, unclear: 1, not_met: 2 };

type ScreenerResponse = {
  isIncluded: boolean;
  reason: string;
  criteria?: Array<{ criterion?: number; status: string; explanation?: string }>;
};

/** Combines the screener's per-criterion checks and verdict into the recorded decision. */
export function decideScreening(
  response: ScreenerResponse,
  criteria: ScreeningCriterion[]
): ScreeningDecision {
  const modelReason = response.reason?.trim() ?? "";
  const checks = response.criteria ?? [];

  // No per-criterion checks: an exclusion stands on the screener's word, but an inclusion is never
  // taken unchecked; it falls through with every criterion unclear, which excludes the paper.
  if (checks.length === 0 && !response.isIncluded) {
    return { isIncluded: false, reason: modelReason || "Does not meet the eligibility criteria." };
  }

  // The prompt numbers criteria from 1; a model that numbers from 0 is shifted back into line.
  const offset = checks.some((check) => check.criterion === 0) ? 1 : 0;
  const byNumber = new Map<number, { status: string; explanation?: string }>();
  checks.forEach((check, position) => {
    const n = Number.isInteger(check.criterion)
      ? (check.criterion as number) + offset
      : position + 1;
    if (n < 1 || n > criteria.length) return;
    // The same criterion checked twice: the stricter answer stands, so a later "not met" can't be
    // hidden behind an earlier "met".
    const previous = byNumber.get(n);
    if (
      !previous ||
      STATUS_STRICTNESS[normalizeCriterionStatus(check.status)] >
        STATUS_STRICTNESS[normalizeCriterionStatus(previous.status)]
    ) {
      byNumber.set(n, check);
    }
  });

  const assessments: CriterionAssessment[] = criteria.map((criterion, i) => {
    const check = byNumber.get(i + 1);
    return {
      label: criterion.label,
      status: check ? normalizeCriterionStatus(check.status) : "unclear",
      explanation: check?.explanation?.trim() || NOT_ASSESSED,
    };
  });

  const failed = assessments.find((a) => a.status === "not_met");
  const unclearCount = assessments.filter((a) => a.status === "unclear").length;

  if (failed) {
    return {
      isIncluded: false,
      reason: `Does not meet "${failed.label}": ${failed.explanation}`,
      criteria: assessments,
    };
  }
  if (unclearCount * 2 > assessments.length) {
    return {
      isIncluded: false,
      reason:
        "The title and abstract give not enough information to confirm most eligibility criteria.",
      criteria: assessments,
    };
  }
  return {
    isIncluded: response.isIncluded,
    reason:
      modelReason ||
      (response.isIncluded
        ? "Meets the eligibility criteria."
        : "Excluded by the screener despite meeting the listed criteria."),
    criteria: assessments,
  };
}

export function screeningFailureDecision(): ScreeningDecision {
  return {
    isIncluded: false,
    reason:
      "Excluded: this paper could not be screened (the screening call failed), so it was not checked against the eligibility criteria.",
    screeningFailed: true,
  };
}

/**
 * One decision per screened paper, in order. A paper with no decision is excluded as
 * unscreened, never included by default.
 */
export function resolveScreeningDecisions(
  paperCount: number,
  decisionsByIndex: Map<number, ScreeningDecision>
): {
  decisions: ScreeningDecision[];
  includedCount: number;
  excludedCount: number;
  failedCount: number;
} {
  const decisions = Array.from(
    { length: paperCount },
    (_, i) => decisionsByIndex.get(i) ?? screeningFailureDecision()
  );
  const includedCount = decisions.filter((d) => d.isIncluded).length;
  return {
    decisions,
    includedCount,
    excludedCount: paperCount - includedCount,
    failedCount: decisions.filter((d) => d.screeningFailed).length,
  };
}
