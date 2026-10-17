/**
 * RAG Eval Pipeline CLI entry point.
 *
 * Usage:
 *   bun run eval:rag -- --dry-run                  # Validate fixtures
 *   bun run eval:rag -- --case agentic-patterns-20 # Needs RAG_EVAL_CONVEX_URL + RAG_EVAL_SECRET
 *   bun run eval:rag -- --prefix ml-               # ML NotebookLM fixture suite only
 *   bun run eval:rag -- --runner studio            # Studio runners (also --runner=report,quiz)
 *   bun run eval:rag -- --export-artifacts         # Export Ragas-compatible artifacts
 */

import { type ParseArgsConfig, parseArgs as parseNodeArgs } from "node:util";
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  CHAT_CONFIG_OVERRIDE_KEYS,
  type ChatConfigOverrides,
} from "../../convex/_agents/chat/chatConfigOverrides";
import { DEFAULT_SMART_MODEL_ID } from "../../convex/_lib/defaultSmartModel";
import { caseFileStem } from "./caseFile";
import { parseChatConfigFlag } from "./chatConfigFlag";
import { mapWithConcurrency } from "./concurrency";
import {
  type ActualCaseCost,
  type CostHistoryRecord,
  estimateRunCost,
  formatActualCost,
  formatEstimate,
  formatUsd,
  type PlannedCase,
  priceUsage,
} from "./cost";
import {
  appendCostHistory,
  confirmOnTerminal,
  costHistoryPath,
  fetchModelRates,
  readCostHistory,
} from "./costIo";
import { getFixture, listFixtureIds, withSourceMatrix } from "./fixtures";
import { appendHistory, HISTORY_DIR, historyFilePath } from "./history";
import { parseConsistencyFraction, resolveJudgeSettings } from "./judgeSettings";
import { createLiveInvokers } from "./liveInvokers";
import { judgeConsistencyTally, resetJudgeConsistencyTally } from "./metrics/binaryJudges";
import { scoreAllMetrics } from "./metrics/scorers";
import {
  DEFAULT_JUDGE_MODEL,
  judgeTokenUsage,
  withJudgeUsageScope,
} from "./metrics/togetherLlmJudge";
import {
  buildJudgeCalibrationQueue,
  checkHoldoutPromotion,
  formatReport,
  formatWorkOrder,
  generateReport,
} from "./reports";
import {
  appendCalibrationLabels,
  combineLabels,
  loadCalibration,
} from "./reports/calibrationStore";
import { compareArtifactDirs, exportEvalRunArtifacts } from "./reports/compare";
import { formatJudgeCalibrationTable, scoreJudgeCalibration } from "./reports/judgeCalibration";
import type { JudgeCalibrationItem } from "./reports/judgeQueue";
import { FixtureFatalError, runFixtureAndFlush } from "./runFixture";
import { runEval } from "./runners";
import type { ChatAgentInvoker } from "./runners/chatRunner";
import type { StudioInvoker } from "./runners/convexStudioInvoker";
import type { LiteratureReviewInvoker } from "./runners/literatureReviewRunner";
import type { ResearchAgentInvoker } from "./runners/researchRunner";
import { parseEvalSourceChannels } from "./sourceChannels";
import { filterFixtureIdsBySplit } from "./splits";
import {
  type EvalBaseline,
  type EvalFixture,
  type EvalReport,
  type EvalRunArtifact,
  type EvalSplit,
  type MetricResult,
  RUNNER_KINDS,
  type RunnerKind,
  type SourcePolicyConfig,
  STUDIO_RUNNER_KINDS,
  type StudioRunnerKind,
} from "./types";
import { USE_CASE_PACKS } from "./usecases";
import { resolveUseCaseIds } from "./usecases/ids";
import { requireEvalConvexEnv } from "./usecases/prodGuard";
import {
  excludeUnselectedPackFixtures,
  formatPlannedJobs,
  PackNotReadyError,
  packSourceTextsFor,
  pinForDryRun,
  prepareUseCaseRun,
} from "./usecases/resolve";
import type { PackSeedApi } from "./usecases/seedClient";
import type { SourceText } from "./usecases/types";
import { formatPackProblems, missingExpectedPassages, packsToValidate } from "./usecases/validate";

/** Versioned judge calibration labels (committed); see evals/rag/calibration/README.md */
const CALIBRATION_DIR = "evals/rag/calibration";

// ─── CLI Options ─────────────────────────────────────────────

interface CliOptions {
  caseId?: string;
  /** Run fixtures whose id starts with this prefix (e.g. "ml-" for NotebookLM ML suite) */
  idPrefix?: string;
  /** Restrict to fixtures whose `runner` matches one of these kinds */
  runners?: RunnerKind[];
  /** Dataset split filter (default smoke for live runs) */
  split?: EvalSplit;
  /** Runs per fixture; default 3 for the smoke split, else 1. Dry runs always use 1. */
  repeats?: number;
  /** Fixtures in flight at once; default 3 live, 1 dry. Repeats of one fixture stay sequential. */
  concurrency?: number;
  /** Restrict to use-case pack fixtures (ids from evals/rag/usecases) */
  useCases?: string[];
  dryRun: boolean;
  verbose: boolean;
  output?: string;
  /** Export artifacts in Ragas-compatible format alongside the report */
  exportArtifacts: boolean;
  /** Directory for exported artifacts (default: evals/rag/generated) */
  artifactsDir: string;
  /** Comma-separated source channel combinations (e.g. "notebook,web+academic") */
  sourceMatrix?: string;
  /** Override the smart LLM model for studio agent reduce phases */
  smartLlm?: string;
  /** Enable legacy Likert 0–1 LLM judges */
  likertJudges: boolean;
  /** Judge model for binary judges (default DeepSeek Flash) */
  judgeModel?: string;
  /** Skip the cost confirmation prompt */
  yes: boolean;
  /** Abort a live run whose estimated cost is above this many USD */
  maxCost?: number;
  /** Rubric check ids to judge; every applicable check when unset */
  rubricChecks?: string[];
  /** `false` turns judge reasoning off */
  judgeReasoning?: boolean;
  /** Fraction (0–1) of judge calls re-run for self-consistency; default by run kind */
  judgeConsistency?: number;
  /** Pairwise compare two artifact directories and exit */
  compareA?: string;
  compareB?: string;
  /** Chat knob overrides for chat fixtures (`--chat-config key=value,…`) */
  chatConfigOverrides?: ChatConfigOverrides;
  /** Score a labeled judge-queue.json and exit */
  scoreJudgeQueue?: string;
  /** With --score-judge-queue: also append the queue's labelled rows to the calibration store */
  appendCalibration: boolean;
  /** Holdout promotion check: before/after EvalReport JSON paths */
  promotionCheckBefore?: string;
  promotionCheckAfter?: string;
  /** Append the live run's report to evals/rag/history/<split>.jsonl (never on dry runs) */
  appendHistory: boolean;
  /** Write the agent work order (markdown) after the report; live and dry runs */
  outputWorkOrder?: string;
  /** Chat fixtures only: retrieval and selection, no answer, no judges (cheap knob sweeps) */
  retrievalOnly?: boolean;
}

/**
 * `--runner` group aliases. `studio` is every studio kind except `audioScriptOnly` (the
 * script-only variant of `audioScript`), matching what `eval:studio` has always run.
 */
const RUNNER_GROUPS: Readonly<Record<string, readonly RunnerKind[]>> = {
  studio: STUDIO_RUNNER_KINDS.filter((kind) => kind !== "audioScriptOnly"),
};

function parseRunners(value: string): RunnerKind[] {
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const kinds: RunnerKind[] = [];
  for (const p of parts) {
    const group = RUNNER_GROUPS[p];
    if (group) {
      kinds.push(...group);
    } else if ((RUNNER_KINDS as readonly string[]).includes(p)) {
      kinds.push(p as RunnerKind);
    } else {
      throw new Error(
        `Unknown runner kind "${p}". Valid: ${[...RUNNER_KINDS, ...Object.keys(RUNNER_GROUPS)].join(", ")}`
      );
    }
  }
  return kinds;
}

function parseUseCases(value: string | undefined): string[] {
  const known = USE_CASE_PACKS.map((p) => p.pack.id);
  const ids = resolveUseCaseIds(value, known);
  for (const id of ids) {
    if (!known.includes(id)) {
      throw new Error(`Unknown use case "${id}". Registered: ${known.join(", ") || "(none)"}`);
    }
  }
  return ids;
}

function parseSplit(value: string): EvalSplit {
  if (value !== "smoke" && value !== "train" && value !== "holdout") {
    throw new Error(`Invalid --split "${value}". Use smoke, train, or holdout.`);
  }
  return value;
}

/** Asks before a live run estimated at or above this many USD (or with cases of unknown cost). */
const CONFIRM_ABOVE_USD = 0.25;

function parsePositiveNumber(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} takes a positive number. See --help.`);
  }
  return n;
}

function parsePositiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1) {
    throw new Error(`--${name} takes a positive integer. See --help.`);
  }
  return n;
}

const CLI_OPTIONS = {
  case: { type: "string" },
  prefix: { type: "string" },
  runner: { type: "string" },
  split: { type: "string" },
  repeats: { type: "string" },
  concurrency: { type: "string" },
  "use-case": { type: "string" },
  "dry-run": { type: "boolean" },
  // Alias of --verbose (it never changed which fixtures run).
  full: { type: "boolean" },
  verbose: { type: "boolean", short: "v" },
  output: { type: "string", short: "o" },
  "export-artifacts": { type: "boolean" },
  "artifacts-dir": { type: "string", default: "evals/rag/generated" },
  "source-matrix": { type: "string" },
  "smart-llm": { type: "string" },
  "likert-judges": { type: "boolean" },
  "judge-model": { type: "string" },
  rubric: { type: "string" },
  "judge-reasoning": { type: "string" },
  "retrieval-only": { type: "boolean" },
  "judge-consistency": { type: "string" },
  yes: { type: "boolean", short: "y" },
  "max-cost": { type: "string" },
  "chat-config": { type: "string" },
  /** Takes two paths: `--compare <dirA> <dirB>` (the second is the next positional). */
  compare: { type: "string" },
  "score-judge-queue": { type: "string" },
  "append-calibration": { type: "boolean" },
  /** Takes two paths: `--promotion-check <before.json> <after.json>`. */
  "promotion-check": { type: "string" },
  "append-history": { type: "boolean" },
  "output-workorder": { type: "string" },
  help: { type: "boolean", short: "h" },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;

/** Options that take two values; the second is the positional right after the first. */
const TWO_VALUE_OPTIONS = new Set(["compare", "promotion-check"]);

/**
 * Parse CLI args strictly: unknown flags and stray arguments are errors, and both
 * `--runner report` and `--runner=report` work.
 */
function parseRubricChecks(value: string): string[] {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("--rubric takes one or more check ids. See --help.");
  return ids;
}

function parseOnOff(name: string, value: string): boolean {
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(`--${name} takes "on" or "off". See --help.`);
}

function parseArgs(args: string[]): CliOptions {
  const { values, tokens } = parseNodeArgs({
    args,
    options: CLI_OPTIONS,
    strict: true,
    allowPositionals: true,
    tokens: true,
  });

  // Pair each two-value option with the positional that directly follows it.
  const secondValues = new Map<string, string>();
  for (const [i, token] of tokens.entries()) {
    if (token.kind === "positional") {
      const prev = tokens[i - 1];
      if (
        prev?.kind === "option" &&
        TWO_VALUE_OPTIONS.has(prev.name) &&
        !secondValues.has(prev.name)
      ) {
        secondValues.set(prev.name, token.value);
        continue;
      }
      throw new Error(`Unexpected argument "${token.value}". See --help.`);
    }
  }
  for (const name of TWO_VALUE_OPTIONS) {
    if (values[name as keyof typeof values] !== undefined && !secondValues.has(name)) {
      throw new Error(`--${name} takes two paths. See --help.`);
    }
  }
  if (values["append-calibration"] && values["score-judge-queue"] === undefined) {
    throw new Error("--append-calibration needs --score-judge-queue <path>. See --help.");
  }

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    caseId: values.case,
    idPrefix: values.prefix,
    runners: values.runner !== undefined ? parseRunners(values.runner) : undefined,
    split: values.split !== undefined ? parseSplit(values.split) : undefined,
    repeats: values.repeats !== undefined ? parsePositiveInt("repeats", values.repeats) : undefined,
    concurrency:
      values.concurrency !== undefined
        ? parsePositiveInt("concurrency", values.concurrency)
        : undefined,
    useCases: values["use-case"] !== undefined ? parseUseCases(values["use-case"]) : undefined,
    dryRun: values["dry-run"] ?? false,
    verbose: (values.verbose ?? false) || (values.full ?? false),
    output: values.output,
    exportArtifacts: values["export-artifacts"] ?? false,
    artifactsDir: values["artifacts-dir"],
    sourceMatrix: values["source-matrix"],
    smartLlm: values["smart-llm"],
    likertJudges: values["likert-judges"] ?? false,
    judgeModel: values["judge-model"],
    yes: values.yes ?? false,
    maxCost:
      values["max-cost"] !== undefined
        ? parsePositiveNumber("max-cost", values["max-cost"])
        : undefined,
    rubricChecks: values.rubric !== undefined ? parseRubricChecks(values.rubric) : undefined,
    judgeReasoning:
      values["judge-reasoning"] !== undefined
        ? parseOnOff("judge-reasoning", values["judge-reasoning"])
        : undefined,
    judgeConsistency:
      values["judge-consistency"] !== undefined
        ? parseConsistencyFraction(values["judge-consistency"])
        : undefined,
    chatConfigOverrides:
      values["chat-config"] !== undefined ? parseChatConfigFlag(values["chat-config"]) : undefined,
    compareA: values.compare,
    compareB: secondValues.get("compare"),
    scoreJudgeQueue: values["score-judge-queue"],
    appendCalibration: values["append-calibration"] ?? false,
    promotionCheckBefore: values["promotion-check"],
    promotionCheckAfter: secondValues.get("promotion-check"),
    appendHistory: values["append-history"] ?? false,
    outputWorkOrder: values["output-workorder"],
    retrievalOnly: values["retrieval-only"] ?? false,
  };
}

function printHelp(): void {
  console.log(`
RAG Eval Pipeline

Usage:
  bun run eval:rag [options]     (--opt value and --opt=value both work; unknown flags error)

Options:
  --case <id>              Run a specific fixture by id
  --prefix <str>           Run fixtures whose id starts with prefix (e.g. ml-)
  --runner <kinds>         Comma-separated runner filter (chat,research,literatureReview,…);
                           "studio" = every studio kind except audioScriptOnly
  --split <smoke|train|holdout>  Filter fixtures by dataset split (live default: smoke)
  --repeats <n>            Run each fixture n times; pass^k and mean per metric. Verdicts that
                           disagree are flaky: a majority of fails (>= half) merges to fail,
                           a minority of fails to a flaky warning (default: 3 for the smoke
                           split, else 1; dry runs use 1)
  --concurrency <n>        Fixtures run in parallel (default: 3 live, 1 dry). Each fixture's
                           output is printed when it finishes; the report is unchanged
  --use-case <ids|all>     Use-case pack fixtures only (seed first: bun run eval:seed)
  --dry-run                Validate fixtures without running agents
  --verbose, -v            Show detailed metric output (--full is an alias)
  --output, -o <path>      Write JSON report to file
  --export-artifacts       Export per-case JSON (for --compare) and Ragas jsonl
  --artifacts-dir <dir>    Directory for exported artifacts (default: evals/rag/generated)
  --source-matrix <combos>  Test fixture against multiple channel combinations
  --smart-llm <model>      Override smart LLM for studio agent reduce phases
  --likert-judges          Enable legacy Likert 0–1 LLM judges (default: binary only)
  --judge-model <model>    Judge model (default: ${DEFAULT_JUDGE_MODEL})
  --rubric <id[,id]>       Judge only these use-case rubric checks (e.g. findings-attributed)
  --judge-reasoning <on|off>  Judge reasoning (default: off on smoke, the model's on train/holdout;
                           off bills far fewer output tokens)
  --judge-consistency <0-1>  Share of binary judge calls re-run to measure self-consistency
                           (rubric judges are not sampled)
                           (default: 0.1 on live runs, 0 on dry runs; a flipped verdict is marked)
  --yes, -y                Skip the cost confirmation (asked at ${formatUsd(CONFIRM_ABOVE_USD)}+ or when
                           a case has no cost history; without a terminal the run
                           stops instead, unless --yes or --max-cost is given)
  --max-cost <usd>         Abort a live run whose estimated cost is above this
  --chat-config <k=v[,k=v]>  Override chat knobs for chat fixtures (experiments; recorded in
                           configHash). Keys: ${CHAT_CONFIG_OVERRIDE_KEYS.join(", ")}
  --compare <dirA> <dirB>  Pairwise compare artifact dirs (no agent runs)
  --score-judge-queue <path>  Score labeled judge-queue.json (plus evals/rag/calibration/) and exit
                           0 ready / 1 not ready / 2 under-labelled (or not a queue file)
  --append-calibration     With --score-judge-queue: append the queue's labelled rows to
                           evals/rag/calibration/ (versioned; deduped by labelKey)
  --promotion-check <before.json> <after.json>  Fail on new grounding/structure judge fails
  --append-history         After a live run, append the report to evals/rag/history/<split>.jsonl
                           (off by default; never on dry runs; skipped when invocation errors occur)
  --output-workorder <path>  Write a markdown task list for a coding agent (failure groups, target
                           files, re-run commands, rules). Written for live and dry runs
  --retrieval-only         Chat fixtures only: run retrieval and context selection, generate no
                           answer, run no judges. Use for retrieval-knob sweeps (~10x cheaper)
  --help, -h               Show this help

Real runs (non --dry-run) require env:
  RAG_EVAL_CONVEX_URL       Dev Convex https://….convex.cloud (avoid prod)
  RAG_EVAL_SECRET           Matches Convex dashboard env RAG_EVAL_SECRET (min 16 chars)
Also set on that Convex deployment: RAG_EVALS_ENABLED=true

Available fixtures:
  ${listFixtureIds().join("\n  ")}
`);
}

// ─── Baseline Loading ────────────────────────────────────────

function loadBaseline(caseId: string, runner: string): EvalBaseline | undefined {
  const path = join("evals/rag/baselines", `${caseFileStem(caseId)}.json`);
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    // Baselines are per-case; match the runner if multiple exist
    if (Array.isArray(raw)) {
      return raw.find((b: EvalBaseline) => b.runner === runner);
    }
    return raw as EvalBaseline;
  } catch {
    return undefined;
  }
}

// ─── Artifact Export ─────────────────────────────────────────

interface RagasExportRow {
  question: string;
  answer: string;
  selectedChunks: Array<{ content: string }>;
  expectedItems: string[];
  citations: string[];
  subQueries: string[];
  runner: string;
  configHash: string;
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

function exportRagasArtifacts(
  fixtures: Map<string, { question: string; expectedItems: string[] }>,
  artifacts: EvalRunArtifact[],
  outDir: string
): string {
  const rows: RagasExportRow[] = artifacts.map((art) => {
    const fix = fixtures.get(art.caseId);
    return {
      question: fix?.question ?? "",
      answer: art.answer,
      selectedChunks: art.selectedChunks.map((c) => ({
        id: c.id,
        sourceTitle: c.sourceTitle,
        sourceUrl: c.sourceUrl,
        content: c.content,
        similarity: c.similarity,
      })),
      expectedItems: fix?.expectedItems ?? [],
      citations: art.citations,
      subQueries: art.subQueries,
      runner: art.runner,
      configHash: art.configHash,
      latencyMs: art.latencyMs,
      tokenUsage: art.tokenUsage,
    };
  });

  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "ragas.jsonl");
  const lines = rows.map((r) => JSON.stringify(r));
  writeFileSync(outPath, lines.join("\n") + "\n");
  return outPath;
}

/** Write one studio artifact's output for manual inspection; returns the file path. */
function saveStudioOutput(artifact: EvalRunArtifact, smartLlm: string | undefined): string {
  const outputFile = `evals/rag/generated/${caseFileStem(artifact.caseId)}-${artifact.runner}-${Date.now()}.json`;
  mkdirSync("evals/rag/generated", { recursive: true });
  writeFileSync(
    outputFile,
    JSON.stringify(
      {
        caseId: artifact.caseId,
        runner: artifact.runner,
        smartLlm,
        answer: artifact.answer,
        raw: artifact.studioOutput?.raw,
        latencyMs: artifact.latencyMs,
      },
      null,
      2
    )
  );
  return outputFile;
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  if (opts.scoreJudgeQueue) {
    const { loadJudgeQueueFile } = await import("./reports/judgeQueueFile");
    let stored: ReturnType<typeof loadCalibration>;
    let items: JudgeCalibrationItem[];
    try {
      items = loadJudgeQueueFile(opts.scoreJudgeQueue);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FATAL: ${opts.scoreJudgeQueue} is not a judge queue file: ${message}`);
      console.error('  Expected the judge-queue.json an eval run writes: {"items": [...]}.');
      process.exit(2);
    }
    try {
      if (opts.appendCalibration) {
        const appended = appendCalibrationLabels(CALIBRATION_DIR, items, {
          commitSha: await getCommitSha(),
        });
        console.log(`Appended ${appended.written} labelled row(s) to ${CALIBRATION_DIR}`);
        if (appended.conflicts > 0) {
          console.log(
            `${appended.conflicts} labels conflict with the store; delete the old row to replace (not overwritten).`
          );
        }
      }
      stored = loadCalibration(CALIBRATION_DIR);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FATAL: calibration store ${CALIBRATION_DIR} is unreadable: ${message}`);
      process.exit(2);
    }
    const score = scoreJudgeCalibration(combineLabels(stored, items));
    for (const line of formatJudgeCalibrationTable(score)) console.log(line);
    console.log(JSON.stringify(score, null, 2));
    if (score.readyForPromptCompile) process.exit(0);
    if (score.labeled < 20) process.exit(2);
    process.exit(1);
  }

  if (opts.promotionCheckBefore && opts.promotionCheckAfter) {
    const before = JSON.parse(readFileSync(opts.promotionCheckBefore, "utf-8")) as EvalReport;
    const after = JSON.parse(readFileSync(opts.promotionCheckAfter, "utf-8")) as EvalReport;
    const decision = checkHoldoutPromotion(before, after);
    console.log(JSON.stringify(decision, null, 2));
    process.exit(decision.ok ? 0 : 1);
  }

  if (opts.compareA && opts.compareB) {
    const commitSha = await getCommitSha();
    const report = await compareArtifactDirs({
      pathA: opts.compareA,
      pathB: opts.compareB,
      judgeModel: opts.judgeModel ?? DEFAULT_JUDGE_MODEL,
      commitSha,
    });
    console.log(JSON.stringify(report, null, 2));
    if (opts.output) {
      mkdirSync(dirname(opts.output), { recursive: true });
      writeFileSync(opts.output, JSON.stringify(report, null, 2));
    }
    return;
  }

  if (!opts.dryRun && !opts.caseId && !opts.split) {
    opts.split = "smoke";
  }
  const judge = resolveJudgeSettings({
    split: opts.split,
    dryRun: opts.dryRun,
    judgeReasoning: opts.judgeReasoning,
    judgeConsistency: opts.judgeConsistency,
  });
  resetJudgeConsistencyTally();

  let fixtureIds: string[];
  if (opts.caseId) {
    fixtureIds = [opts.caseId];
  } else {
    fixtureIds = excludeUnselectedPackFixtures(listFixtureIds(), getFixture, opts);
    if (opts.idPrefix) {
      fixtureIds = fixtureIds.filter((id) => id.startsWith(opts.idPrefix!));
    }
    if (opts.runners && opts.runners.length > 0) {
      const allowed = new Set(opts.runners);
      fixtureIds = fixtureIds.filter((id) => allowed.has(getFixture(id).runner));
    }
    if (opts.split) {
      fixtureIds = filterFixtureIdsBySplit(fixtureIds, opts.split);
    }
    if (opts.useCases) {
      const allowed = new Set(opts.useCases);
      fixtureIds = fixtureIds.filter((id) => {
        const useCase = getFixture(id).useCase;
        return useCase !== undefined && allowed.has(useCase);
      });
    }
  }
  if (opts.retrievalOnly) {
    // Only chat has a retrieval stage to stop at; other runners would have to generate.
    const skipped = fixtureIds.filter((id) => getFixture(id).runner !== "chat");
    if (skipped.length > 0) {
      console.log(
        `--retrieval-only runs chat fixtures only; skipping ${skipped.length} other fixture(s).`
      );
    }
    fixtureIds = fixtureIds.filter((id) => getFixture(id).runner === "chat");
  }
  if (opts.useCases && !opts.caseId) {
    if (USE_CASE_PACKS.length === 0) {
      console.log("No use-case packs registered (evals/rag/usecases/index.ts).");
      process.exit(0);
    }
    if (fixtureIds.length === 0) {
      const filters = [
        `use cases: ${opts.useCases.join(", ") || "(none)"}`,
        opts.split && `split: ${opts.split}`,
        opts.runners?.length && `runner: ${opts.runners.join(", ")}`,
        opts.idPrefix && `prefix: ${opts.idPrefix}`,
      ].filter(Boolean);
      console.error(`No fixtures matched the filters (${filters.join("; ")}).`);
      process.exit(2);
    }
  }
  // Validate selected packs on live runs too, so a missing source fails with
  // "INVALID PACK" instead of a raw ENOENT when the run reads pack sources.
  const packProblems = formatPackProblems(
    packsToValidate(USE_CASE_PACKS, fixtureIds.map(getFixture), opts.useCases !== undefined)
  );
  if (packProblems.length > 0) {
    console.error(packProblems.join("\n"));
    process.exit(2);
  }
  if (opts.caseId && opts.idPrefix) {
    console.warn("Warning: --prefix is ignored when --case is set.");
  }
  if (opts.caseId && opts.runners) {
    console.warn("Warning: --runner is ignored when --case is set.");
  }
  if (opts.caseId && opts.useCases) {
    console.warn("Warning: --use-case is ignored when --case is set.");
  }
  // Repeats: the smoke split defaults to 3 so flaky verdicts show up; dry runs stay at 1.
  const repeats = opts.dryRun ? 1 : (opts.repeats ?? (opts.split === "smoke" ? 3 : 1));
  if (opts.dryRun && (opts.repeats ?? 1) > 1) {
    console.warn("Dry runs always use 1 repeat; --repeats only sizes the cost estimate.");
  }
  console.log(
    `Running ${fixtureIds.length} fixture(s)...${opts.dryRun ? " (dry-run)" : ""}${opts.split ? ` [split=${opts.split}]` : ""}${repeats > 1 ? ` [repeats=${repeats}]` : ""}\n`
  );
  if (opts.chatConfigOverrides) {
    console.log(`Chat config overrides: ${JSON.stringify(opts.chatConfigOverrides)}`);
    const otherFixtures = fixtureIds.filter(
      (id) => !["chat", "both"].includes(getFixture(id).runner)
    ).length;
    if (otherFixtures > 0) {
      console.log(
        `Note: --chat-config applies to chat fixtures only; ${otherFixtures} other fixture(s) run with production values.\n`
      );
    }
  }

  // Real mode runs against your dev Convex deployment (never rely on accidental prod URLs)
  let chatInvoker: ChatAgentInvoker | undefined;
  let researchInvoker: ResearchAgentInvoker | undefined;
  let literatureReviewInvoker: LiteratureReviewInvoker | undefined;
  let studioInvokers: Partial<Record<StudioRunnerKind, StudioInvoker>> | undefined;
  let seedApi: PackSeedApi | undefined;
  if (!opts.dryRun) {
    let convexUrl: string;
    let evalSecret: string;
    try {
      ({ convexUrl, evalSecret } = requireEvalConvexEnv());
    } catch (err) {
      console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
      console.error("  Use --dry-run to validate fixtures without Convex.");
      process.exit(2);
    }
    console.log(`Using Convex at ${convexUrl} (eval mode)`);
    const live = createLiveInvokers(convexUrl, evalSecret);
    chatInvoker = live.chatInvoker;
    researchInvoker = live.researchInvoker;
    literatureReviewInvoker = live.literatureReviewInvoker;
    studioInvokers = live.studioInvokers;
    seedApi = live.seedApi;
  }

  const allMetrics: MetricResult[] = [];
  const allArtifacts: EvalRunArtifact[] = [];
  const fixtureMeta = new Map<string, { question: string; expectedItems: string[] }>();
  // Tracks per-fixture invocation errors so an auth/gate regression (e.g. a
  // bad RAG_EVAL_SECRET) fails the run loudly instead of being absorbed into
  // a stub artifact with score 0.
  let runtimeErrorCount = 0;

  // Expand fixtures for source matrix testing and smartLlm override
  const expandedFixtures: EvalFixture[] = [];
  for (const id of fixtureIds) {
    const fixture: EvalFixture = { ...getFixture(id) };
    if (opts.smartLlm) {
      fixture.studioParams = { ...fixture.studioParams, smartLlm: opts.smartLlm };
    }
    if (opts.sourceMatrix) {
      const combos = opts.sourceMatrix.split(",").map((s) => s.trim());
      const matrix: SourcePolicyConfig[] = combos.map((combo) => ({
        channels: parseEvalSourceChannels(combo.split("+").map((channel) => channel.trim())),
      }));
      expandedFixtures.push(...withSourceMatrix(fixture, matrix));
    } else {
      expandedFixtures.push(fixture);
    }
  }

  // Cost: estimate from past runs before anything is billed, and ask on big runs.
  const judgeModel = opts.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const pipelineModelFor = (fixture: EvalFixture) =>
    fixture.studioParams?.smartLlm ?? DEFAULT_SMART_MODEL_ID;
  const { rates, source: ratesSource } = await fetchModelRates(process.env.TOGETHER_AI_API_KEY);
  const historyPath = costHistoryPath();
  const liveRepeats = opts.repeats ?? (opts.split === "smoke" ? 3 : 1);
  const planned: PlannedCase[] = expandedFixtures.map((f) => ({
    caseId: f.id,
    runner: f.runner,
    pipelineModel: pipelineModelFor(f),
    judgeModel,
  }));
  const estimate = estimateRunCost(planned, liveRepeats, readCostHistory(historyPath), rates);
  console.log(`${formatEstimate(estimate, liveRepeats, ratesSource)}
`);
  if (!opts.dryRun) {
    if (opts.maxCost !== undefined && estimate.total > opts.maxCost) {
      console.error(
        `Estimated ${formatUsd(estimate.total)} is above --max-cost ${formatUsd(opts.maxCost)}. Not running.`
      );
      process.exit(2);
    }
    const needsConfirm = estimate.total >= CONFIRM_ABOVE_USD || estimate.unknownCases.length > 0;
    if (needsConfirm && !opts.yes && opts.maxCost === undefined) {
      if (!process.stdin.isTTY) {
        console.error(
          "No terminal to ask on. Pass --yes, or --max-cost <usd> to run up to a limit. Not running."
        );
        process.exit(2);
      }
      if (!(await confirmOnTerminal("Run it?"))) {
        console.log("Cancelled. Nothing was run.");
        process.exit(0);
      }
    }
  }

  // Use-case packs: resolve seeded notebooks before any job runs, so an
  // unseeded pack costs nothing (spec §3).
  let fixturesToRun = opts.dryRun ? pinForDryRun(expandedFixtures) : expandedFixtures;
  let packSourceTexts = new Map<string, SourceText[]>();
  if (expandedFixtures.some((f) => f.useCase)) {
    console.log(`Planned use-case jobs:\n${formatPlannedJobs(expandedFixtures)}\n`);
    // Retrieval-only runs run no judges, so they need no key.
    if (!opts.dryRun && !opts.retrievalOnly && !process.env.TOGETHER_AI_API_KEY?.trim()) {
      console.error(
        "Use-case packs are scored by rubric judges: set TOGETHER_AI_API_KEY (repo-root .env)."
      );
      process.exit(2);
    }
    if (seedApi) {
      try {
        ({ fixtures: fixturesToRun, sourceTexts: packSourceTexts } = await prepareUseCaseRun(
          expandedFixtures,
          seedApi
        ));
      } catch (err) {
        if (err instanceof PackNotReadyError) {
          console.error(err.message);
          process.exit(2);
        }
        throw err;
      }
      // Gold passages must still be in the extracted text, or a drifted PDF would score as misses.
      const missingPassages = missingExpectedPassages(fixturesToRun, packSourceTexts);
      if (missingPassages.length > 0) {
        console.error(
          [
            "Expected passages not found in the pack's extracted source text (quote drift or OCR):",
            ...missingPassages.map((m) => `  - ${m}`),
          ].join("\n")
        );
        process.exit(2);
      }
    }
  }

  // Artifacts, Ragas export and the judge queue use the first repeat only (a flaky verdict
  // is not a calibration label); the report uses the aggregated rows of all repeats.
  const firstRepeatMetrics: MetricResult[] = [];

  const fixtureDeps = {
    repeats,
    verbose: opts.verbose,
    runEval,
    runEvalOptions: {
      dryRun: opts.dryRun,
      retrievalOnly: opts.retrievalOnly,
      chatInvoker,
      researchInvoker,
      literatureReviewInvoker,
      studioInvokers,
      chatConfigOverrides: opts.chatConfigOverrides,
    },
    scoreAllMetrics,
    scoreOptionsFor: (fixture: EvalFixture) => ({
      likertJudges: opts.likertJudges,
      dryRun: opts.dryRun,
      judgeModel,
      rubricChecks: opts.rubricChecks,
      judgeReasoning: judge.judgeReasoning,
      judgeConsistencySample: judge.judgeConsistencySample,
      packSourceTexts: fixture.useCase
        ? packSourceTextsFor(fixture, packSourceTexts.get(fixture.useCase))
        : undefined,
    }),
    loadBaseline,
    saveStudioOutput: (artifact: EvalRunArtifact) => saveStudioOutput(artifact, opts.smartLlm),
  };

  // Fixtures run through a bounded pool; outcomes are merged in fixture order, so the report
  // and exports do not depend on which fixture finished first.
  const concurrency = opts.concurrency ?? (opts.dryRun ? 1 : 3);
  const outcomes = await mapWithConcurrency(fixturesToRun, concurrency, async (fixture) => {
    fixtureMeta.set(fixture.id, {
      question: fixture.question,
      expectedItems: fixture.expectedItems,
    });
    const { result, judgeUsage } = await withJudgeUsageScope(() =>
      runFixtureAndFlush(fixture, fixtureDeps)
    );
    return { ...result, fixture, judgeUsage };
  });
  for (const outcome of outcomes) {
    allMetrics.push(...outcome.metrics);
    allArtifacts.push(...outcome.artifacts);
    firstRepeatMetrics.push(...outcome.firstRepeatMetrics);
    runtimeErrorCount += outcome.runtimeErrors;
  }

  // Generate report
  const commitSha = await getCommitSha();
  const useCaseByCase = new Map(
    fixturesToRun.flatMap((f): [string, string][] => (f.useCase ? [[f.id, f.useCase]] : []))
  );
  const consistency = judgeConsistencyTally();
  const report = generateReport(allMetrics, {
    commitSha,
    includeWarnings: true,
    retrievalOnly: allArtifacts.some((a) => a.retrievalOnly === true),
    groupBySourcePolicy: !!opts.sourceMatrix,
    split: opts.split,
    useCaseByCase,
    judgeConsistency:
      consistency.sampled > 0
        ? { ...consistency, rate: consistency.agreed / consistency.sampled }
        : undefined,
  });

  console.log(formatReport(report));

  // Write JSON report
  if (opts.output) {
    mkdirSync(dirname(opts.output), { recursive: true });
    writeFileSync(opts.output, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${opts.output}`);
  }

  if (opts.outputWorkOrder) {
    mkdirSync(dirname(opts.outputWorkOrder), { recursive: true });
    writeFileSync(opts.outputWorkOrder, formatWorkOrder(report, { repeats, split: opts.split }));
    console.log(`Work order written to ${opts.outputWorkOrder}`);
  }

  // History: live runs only. A run with invocation errors would record stub scores as metric
  // failures, so it is not appended.
  if (opts.appendHistory && !opts.dryRun) {
    if (runtimeErrorCount === 0) {
      const rows = appendHistory(HISTORY_DIR, report, {
        split: opts.split,
        runId: randomUUID(),
        useCaseByCase,
      });
      console.log(
        `History: ${rows} row(s) appended to ${historyFilePath(HISTORY_DIR, opts.split ?? report.split)}`
      );
    } else {
      console.warn("History not appended: the run had invocation-layer errors.");
    }
  }

  if (!opts.dryRun) {
    const at = new Date().toISOString();
    const records: CostHistoryRecord[] = outcomes.map(({ fixture, pipelineUsage, judgeUsage }) => ({
      at,
      caseId: fixture.id,
      runner: fixture.runner,
      runs: repeats,
      pipelineRuns: pipelineUsage.reported,
      pipelineModel: pipelineModelFor(fixture),
      judgeModel,
      pipeline: {
        prompt: pipelineUsage.prompt,
        cachedPrompt: pipelineUsage.cachedPrompt,
        completion: pipelineUsage.completion,
      },
      judge: {
        calls: judgeUsage.calls,
        prompt: judgeUsage.promptTokens,
        cachedPrompt: judgeUsage.cachedPromptTokens,
        completion: judgeUsage.completionTokens,
      },
      pipelineSource:
        pipelineUsage.estimated === 0
          ? "provider"
          : pipelineUsage.estimated === pipelineUsage.reported
            ? "estimated"
            : "mixed",
    }));
    const actual: ActualCaseCost[] = records.map((record, i) => {
      const usage = outcomes[i]?.pipelineUsage;
      return {
        caseId: record.caseId,
        runs: record.runs,
        cost: priceUsage(record, rates),
        pipelineEstimated: (usage?.estimated ?? 0) > 0,
        pipelineMissingRuns: Math.max(0, record.runs - (usage?.reported ?? 0)),
      };
    });
    console.log(`
${formatActualCost(actual, ratesSource)}`);
    appendCostHistory(historyPath, records);

    const usage = judgeTokenUsage();
    if (usage.calls > 0) {
      const cachedShare = usage.promptTokens
        ? Math.round((usage.cachedPromptTokens / usage.promptTokens) * 100)
        : 0;
      console.log(
        `
Judge tokens: ${usage.calls} calls, ${usage.promptTokens} prompt ` +
          `(${usage.cachedPromptTokens} cached, ${cachedShare}%), ${usage.completionTokens} completion`
      );
    }
    if (consistency.sampled > 0) {
      const rate = Math.round((consistency.agreed / consistency.sampled) * 100);
      console.log(
        `Judge self-consistency: ${consistency.agreed}/${consistency.sampled} (${rate}%)`
      );
    }
    // Retrieval-only runs have no judge verdicts to calibrate, so they write no queue.
    const queue = opts.retrievalOnly
      ? []
      : buildJudgeCalibrationQueue(firstRepeatMetrics, { limit: 20 });
    if (queue.length > 0) {
      const queuePath = join("evals/rag/generated", "judge-queue.json");
      mkdirSync(dirname(queuePath), { recursive: true });
      writeFileSync(
        queuePath,
        `${JSON.stringify(
          {
            instruction:
              "For each item, set humanAgree to true if you agree with the model verdict, false if you disagree.",
            items: queue,
          },
          null,
          2
        )}\n`
      );
      console.log(`\nJudge calibration queue (${queue.length} items): ${queuePath}`);
      if (queue.length >= 20) {
        console.log("Ready for human labeling — fill humanAgree on each item.");
      } else {
        console.log(
          `Need ${20 - queue.length} more judge verdicts before a 20-verdict calibration.`
        );
      }
    }
  }

  if (opts.exportArtifacts && allArtifacts.length > 0) {
    exportEvalRunArtifacts(opts.artifactsDir, allArtifacts);
    const outPath = exportRagasArtifacts(fixtureMeta, allArtifacts, opts.artifactsDir);
    console.log(
      `\nEval artifacts exported to ${opts.artifactsDir} (${allArtifacts.length} case file(s))`
    );
    console.log(`  Compare: bun run eval:compare -- ${opts.artifactsDir} <other-run-dir>`);
    console.log(`  Ragas:   python evals/ragas/run_ragas.py --dataset ${outPath}`);
  }

  if (runtimeErrorCount > 0) {
    console.error(
      `\n${runtimeErrorCount} fixture(s) failed at the invocation layer (auth, gate, or stream errors). ` +
        `These are NOT scored as metric failures and would otherwise be hidden.`
    );
    process.exit(2);
  }

  if (opts.dryRun) {
    process.exit(0);
  }

  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

async function getCommitSha(): Promise<string> {
  try {
    const { execSync } = await import("child_process");
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

main().catch((err) => {
  if (err instanceof FixtureFatalError) process.exit(2);
  console.error("Fatal error:", err);
  process.exit(2);
});
