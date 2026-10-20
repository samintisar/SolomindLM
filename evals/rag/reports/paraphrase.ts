/**
 * Paraphrase consistency: does a fixture get the same verdict when the user asks the same question
 * in other words? A paraphrase is an artifact whose id is `<base>--p<n>` (fixtures/paraphraseVariants.ts).
 * For each base case with paraphrases, the score is the share of paraphrases whose verdicts match the
 * base's on the compared metrics.
 */
import type { MetricResult, MetricStatus } from "../types";

const VARIANT_SEGMENT = /--p\d+(?=--|$)/;

/** Metrics a paraphrase must agree with the base on. Judges absent from the base are not compared. */
const COMPARED_METRICS = ["expected_item_recall", "binary_judge_chat_grounding"] as const;

/** A paraphrase artifact id (`<base>--p<n>`), as opposed to a base case id. */
export function isParaphraseVariant(caseId: string): boolean {
  return VARIANT_SEGMENT.test(caseId);
}

/** The base case id a paraphrase belongs to. Other ids are returned unchanged. */
export function paraphraseBaseId(caseId: string): string {
  return caseId.replace(VARIANT_SEGMENT, "");
}

/**
 * Two verdicts agree when both are fail, or both are not fail: a warn is a near pass, so pass and
 * warn agree. A missing row (no verdict) never agrees with anything.
 */
function sameVerdict(
  actual: MetricStatus | undefined,
  expected: MetricStatus | undefined
): boolean {
  if (actual === undefined || expected === undefined) return false;
  return (actual === "fail") === (expected === "fail");
}

interface VariantRow {
  caseId: string;
  statuses: Record<string, MetricStatus | undefined>;
  matches: boolean;
}

export function paraphraseConsistency(metrics: MetricResult[]): MetricResult[] {
  const groups = new Map<
    string,
    { baseId: string; runner: MetricResult["runner"]; variantIds: string[] }
  >();
  for (const m of metrics) {
    if (!isParaphraseVariant(m.caseId)) continue;
    const baseId = paraphraseBaseId(m.caseId);
    const key = `${baseId}::${m.runner}`;
    const group = groups.get(key) ?? { baseId, runner: m.runner, variantIds: [] };
    if (!group.variantIds.includes(m.caseId)) group.variantIds.push(m.caseId);
    groups.set(key, group);
  }

  // First row per (case, runner, metric) among the compared metrics.
  const statusOf = new Map<string, MetricStatus>();
  const configHashOf = new Map<string, string>();
  for (const m of metrics) {
    if (!(COMPARED_METRICS as readonly string[]).includes(m.metric)) continue;
    const key = `${m.caseId}::${m.runner}::${m.metric}`;
    if (!statusOf.has(key)) statusOf.set(key, m.status);
    if (!configHashOf.has(`${m.caseId}::${m.runner}`)) {
      configHashOf.set(`${m.caseId}::${m.runner}`, m.configHash);
    }
  }

  const results: MetricResult[] = [];
  for (const { baseId, runner, variantIds } of groups.values()) {
    const compared = COMPARED_METRICS.filter((metric) =>
      statusOf.has(`${baseId}::${runner}::${metric}`)
    );
    if (compared.length === 0) continue;

    const rows: VariantRow[] = variantIds.map((caseId) => {
      const statuses: Record<string, MetricStatus | undefined> = {};
      let matches = true;
      for (const metric of compared) {
        const expected = statusOf.get(`${baseId}::${runner}::${metric}`);
        const actual = statusOf.get(`${caseId}::${runner}::${metric}`);
        statuses[metric] = actual;
        if (!sameVerdict(actual, expected)) matches = false;
      }
      return { caseId, statuses, matches };
    });

    const matched = rows.filter((row) => row.matches).length;
    const score = matched / rows.length;
    const status: MetricStatus = score >= 0.8 ? "pass" : score >= 0.5 ? "warn" : "fail";
    results.push({
      metric: "paraphrase_consistency",
      caseId: baseId,
      runner,
      configHash: configHashOf.get(`${baseId}::${runner}`) ?? "",
      status,
      score,
      detail: `${matched}/${rows.length} paraphrases give the same ${compared.join(" and ")} verdict as the base question.`,
      breakdown: { compared, matched, total: rows.length, variants: rows },
    });
  }
  return results;
}
