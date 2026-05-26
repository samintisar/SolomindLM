/**
 * Helpers for plan-review extraction column suggestions.
 */

/** IDs from the legacy PLAN_REVIEW_PROMPT example — models often copy these verbatim. */
const LEGACY_GENERIC_COLUMN_IDS = [
  "study_design",
  "sample_size",
  "key_findings",
  "limitations",
  "methodology",
] as const;

export type SuggestedColumnLike = { id: string; name?: string };

/**
 * True when the model returned the five generic methodology columns from the old prompt template.
 */
export function isLegacyGenericColumnSet(columns: SuggestedColumnLike[]): boolean {
  if (columns.length !== LEGACY_GENERIC_COLUMN_IDS.length) {
    return false;
  }
  const ids = columns.map((c) => c.id.trim().toLowerCase()).sort();
  const expected = [...LEGACY_GENERIC_COLUMN_IDS].sort();
  return ids.every((id, index) => id === expected[index]);
}

export const PLAN_REVIEW_COLUMN_RETRY_APPENDIX = `

IMPORTANT: Your suggestedColumns must be tailored to the research question above.
Do NOT return generic columns such as Study Design, Sample Size, Key Findings, Limitations, and Methodology unless the question is explicitly about comparing study methods across papers.
Name each column after concepts, entities, or outcomes the user cares about for this specific question.`;

/** Detect benchmark / predictive-validity style review questions. */
export function isBenchmarkReliabilityQuestion(query: string): boolean {
  const q = query.toLowerCase();
  return (
    (q.includes("benchmark") || q.includes("evaluation")) &&
    (q.includes("reliable") ||
      q.includes("reliability") ||
      q.includes("real-world") ||
      q.includes("real world") ||
      q.includes("predictive") ||
      q.includes("deployment"))
  );
}

/** Fallback columns when the model returns generic methodology columns for benchmark questions. */
export const BENCHMARK_RELIABILITY_SUGGESTED_COLUMNS: SuggestedColumnLike[] = [
  { id: "benchmark_name_type", name: "Benchmark Name & Type" },
  { id: "predictive_validity", name: "Predictive Validity Metric" },
  { id: "real_world_metric", name: "Real-World Performance Metric" },
  { id: "benchmark_deployment_gap", name: "Benchmark vs Deployment Gap" },
  { id: "domain", name: "Application Domain" },
  { id: "llms_tested", name: "LLMs Tested" },
  { id: "contamination_robustness", name: "Contamination / Robustness Issues" },
];
