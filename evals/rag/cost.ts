/**
 * Eval run cost: price recorded token usage, and estimate a planned run from past runs.
 *
 * Covers Together LLM tokens only (agent pipeline + LLM judges). Tavily searches, OpenAI
 * embeddings and Voyage rerank are billed elsewhere and are not included.
 *
 * Pure functions; pricing fetch and history I/O live in `costIo.ts`.
 */

/** USD per million tokens. `cachedInput` is absent when the model has no prompt-cache discount. */
export interface TokenRates {
  input: number;
  output: number;
  cachedInput?: number;
}

export type ModelRates = Map<string, TokenRates>;

export interface TokenCounts {
  prompt: number;
  /** Part of `prompt` served from the provider's prompt cache. */
  cachedPrompt: number;
  completion: number;
}

interface JudgeTokenCounts extends TokenCounts {
  calls: number;
}

/** Tokens one fixture used across all its repeats in one CLI run. */
export interface CostHistoryRecord {
  at: string;
  caseId: string;
  runner: string;
  /** Repeats the token counts below cover. */
  runs: number;
  /** Repeats that reported pipeline tokens; `pipeline` sums only these. Absent in old records. */
  pipelineRuns?: number;
  /** Model the agent pipeline ran on (its smart model). */
  pipelineModel: string;
  judgeModel: string;
  pipeline: TokenCounts;
  judge: JudgeTokenCounts;
  /** "estimated" when the pipeline reported chars/4 estimates instead of provider counts. */
  pipelineSource?: "provider" | "estimated" | "mixed";
}

export interface PlannedCase {
  caseId: string;
  runner: string;
  pipelineModel: string;
  judgeModel: string;
}

/** How a case's estimate was made: its own past runs, its runner's, or not at all. */
type EstimateBasis = "case" | "runner" | "unknown";

interface CaseEstimate extends PlannedCase {
  basis: EstimateBasis;
  /** Estimated USD for all repeats; undefined when basis is "unknown". */
  cost?: number;
}

export interface RunEstimate {
  cases: CaseEstimate[];
  /** Fixture runs (cases × repeats). */
  runs: number;
  /** Sum over cases with an estimate. */
  total: number;
  unknownCases: string[];
  unpricedModels: string[];
}

const PER_MILLION = 1_000_000;
/** Recent runs of a case the estimate looks at. */
const RECENT_RUNS = 5;

/** Cost of `tokens` at `rates`; undefined when the model has no price. */
export function priceTokens(
  tokens: TokenCounts,
  rates: TokenRates | undefined
): number | undefined {
  if (!rates) return undefined;
  const cached = Math.min(tokens.cachedPrompt, tokens.prompt);
  const uncached = tokens.prompt - cached;
  const cachedRate = rates.cachedInput ?? rates.input;
  return (
    (uncached * rates.input + cached * cachedRate + tokens.completion * rates.output) / PER_MILLION
  );
}

export interface UsageCost {
  pipeline: number;
  judge: number;
  total: number;
  unpricedModels: string[];
}

/** Cost of a record's pipeline and judge tokens, each at its own model's rates. */
export function priceUsage(
  usage: Pick<CostHistoryRecord, "pipeline" | "judge" | "pipelineModel" | "judgeModel">,
  rates: ModelRates
): UsageCost {
  const unpriced = new Set<string>();
  const part = (tokens: TokenCounts, model: string): number => {
    if (!hasTokens(tokens)) return 0;
    const cost = priceTokens(tokens, rates.get(model));
    if (cost === undefined) {
      unpriced.add(model);
      return 0;
    }
    return cost;
  };
  const pipeline = part(usage.pipeline, usage.pipelineModel);
  const judge = part(usage.judge, usage.judgeModel);
  return { pipeline, judge, total: pipeline + judge, unpricedModels: [...unpriced] };
}

/** One run's tokens from a record covering `runs` repeats. */
export function perRunUsage(
  record: CostHistoryRecord
): Pick<CostHistoryRecord, "pipeline" | "judge"> {
  const runs = Math.max(1, record.runs);
  return {
    pipeline: divide(record.pipeline, Math.max(1, record.pipelineRuns ?? record.runs)),
    judge: { ...divide(record.judge, runs), calls: record.judge.calls / runs },
  };
}

/**
 * Estimate a planned run. Each case uses the median per-run tokens of its last few runs; a case
 * that never ran uses the median of its runner's records. Tokens are priced at the planned
 * models' current rates, so a price change or model switch shows up without new history.
 */
export function estimateRunCost(
  planned: PlannedCase[],
  repeats: number,
  history: CostHistoryRecord[],
  rates: ModelRates
): RunEstimate {
  const usable = history
    .filter((r) => hasTokens(r.pipeline) || hasTokens(r.judge))
    .sort((a, b) => b.at.localeCompare(a.at));
  const unpriced = new Set<string>();
  const cases: CaseEstimate[] = planned.map((plan) => {
    const own = usable.filter((r) => r.caseId === plan.caseId).slice(0, RECENT_RUNS);
    const sameRunner = own.length > 0 ? [] : usable.filter((r) => r.runner === plan.runner);
    const basisRecords = own.length > 0 ? own : sameRunner;
    if (basisRecords.length === 0) return { ...plan, basis: "unknown" };

    const perRun = basisRecords.map((r) => {
      const usage = perRunUsage(r);
      const cost = priceUsage(
        { ...usage, pipelineModel: plan.pipelineModel, judgeModel: plan.judgeModel },
        rates
      );
      for (const model of cost.unpricedModels) unpriced.add(model);
      return cost.total;
    });
    return {
      ...plan,
      basis: own.length > 0 ? "case" : "runner",
      cost: median(perRun) * repeats,
    };
  });

  return {
    cases,
    runs: planned.length * repeats,
    total: cases.reduce((sum, c) => sum + (c.cost ?? 0), 0),
    unknownCases: cases.filter((c) => c.basis === "unknown").map((c) => c.caseId),
    unpricedModels: [...unpriced],
  };
}

export function formatUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function hasTokens(tokens: TokenCounts): boolean {
  return tokens.prompt + tokens.completion > 0;
}

function divide(tokens: TokenCounts, by: number): TokenCounts {
  return {
    prompt: tokens.prompt / by,
    cachedPrompt: tokens.cachedPrompt / by,
    completion: tokens.completion / by,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

const BASIS_LABEL: Record<EstimateBasis, string> = {
  case: "",
  runner: " (runner median)",
  unknown: " (no history)",
};

/** The pre-run block: one line per case, then the total and what it leaves out. */
export function formatEstimate(
  estimate: RunEstimate,
  repeats: number,
  ratesSource: "live" | "fallback"
): string {
  const lines = [`Estimated cost (${estimate.runs} run(s), ${repeats} repeat(s) each):`];
  for (const c of estimate.cases) {
    const amount = c.cost === undefined ? "?" : formatUsd(c.cost);
    lines.push(`  ${amount.padStart(9)}  ${c.caseId}${BASIS_LABEL[c.basis]}`);
  }
  const unknown = estimate.unknownCases.length;
  lines.push(
    `  Total ≈ ${formatUsd(estimate.total)}${unknown > 0 ? ` + ${unknown} case(s) with no history` : ""}`
  );
  if (estimate.unpricedModels.length > 0) {
    lines.push(`  No price for: ${estimate.unpricedModels.join(", ")} (left out)`);
  }
  lines.push(
    `  Together LLM tokens only (pipeline + judges), ${ratesSource === "live" ? "live" : "built-in"} prices.`
  );
  return lines.join("\n");
}

export interface ActualCaseCost {
  caseId: string;
  runs: number;
  cost: UsageCost;
  /** Pipeline usage was a chars/4 estimate for some runs */
  pipelineEstimated: boolean;
  /** Runs that reported no pipeline tokens */
  pipelineMissingRuns: number;
}

/** The post-run block: what each case cost and the run total. */
export function formatActualCost(
  cases: ActualCaseCost[],
  ratesSource: "live" | "fallback"
): string {
  const lines = ["Run cost:"];
  let total = 0;
  const unpriced = new Set<string>();
  for (const c of cases) {
    total += c.cost.total;
    for (const model of c.cost.unpricedModels) unpriced.add(model);
    const notes = [
      `pipeline ${formatUsd(c.cost.pipeline)}`,
      `judges ${formatUsd(c.cost.judge)}`,
      c.pipelineEstimated ? "pipeline tokens estimated" : undefined,
      c.pipelineMissingRuns > 0
        ? `${c.pipelineMissingRuns} run(s) reported no pipeline tokens`
        : undefined,
    ].filter(Boolean);
    lines.push(
      `  ${formatUsd(c.cost.total).padStart(9)}  ${c.caseId} ×${c.runs} (${notes.join(", ")})`
    );
  }
  lines.push(`  Total: ${formatUsd(total)}`);
  if (unpriced.size > 0) lines.push(`  No price for: ${[...unpriced].join(", ")} (left out)`);
  lines.push(
    `  Together LLM tokens only, ${ratesSource === "live" ? "live" : "built-in"} prices; ` +
      "Tavily, embeddings and rerank not included."
  );
  return lines.join("\n");
}

/**
 * Median per-run pipeline tokens (prompt + completion) of a case's recent runs on `pipelineModel`,
 * counting only runs whose tokens were provider-reported. Undefined when there are none. Runs on
 * another model (a `--smart-llm` sweep) say nothing about this one's token use.
 */
export function caseTokenMedian(
  history: CostHistoryRecord[],
  caseId: string,
  pipelineModel: string
): number | undefined {
  const perRun = history
    .filter(
      (r) =>
        r.caseId === caseId &&
        r.pipelineModel === pipelineModel &&
        r.pipelineSource === "provider" &&
        r.pipeline.prompt + r.pipeline.completion > 0
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, RECENT_RUNS)
    .map((r) => perRunUsage(r).pipeline)
    .map((p) => p.prompt + p.completion);
  return perRun.length > 0 ? median(perRun) : undefined;
}
