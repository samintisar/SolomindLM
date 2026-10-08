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
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { caseFileStem } from "./caseFile";
import { getFixture, listFixtureIds, withSourceMatrix } from "./fixtures";
import { scoreAllMetrics } from "./metrics/scorers";
import { DEFAULT_JUDGE_MODEL } from "./metrics/togetherLlmJudge";
import {
  buildJudgeCalibrationQueue,
  checkHoldoutPromotion,
  formatReport,
  generateReport,
} from "./reports";
import { compareArtifactDirs, exportEvalRunArtifacts } from "./reports/compare";
import {
  createConvexChatInvoker,
  createConvexLiteratureReviewInvoker,
  createConvexResearchInvoker,
  createConvexStudioInvokers,
  runEval,
} from "./runners";
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
import { createConvexSeedApi } from "./usecases/convexSeedApi";
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
import { formatPackProblems, packsToValidate } from "./usecases/validate";

// ─── CLI Options ─────────────────────────────────────────────

interface CliOptions {
  caseId?: string;
  /** Run fixtures whose id starts with this prefix (e.g. "ml-" for NotebookLM ML suite) */
  idPrefix?: string;
  /** Restrict to fixtures whose `runner` matches one of these kinds */
  runners?: RunnerKind[];
  /** Dataset split filter (default smoke for live runs) */
  split?: EvalSplit;
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
  /** Pairwise compare two artifact directories and exit */
  compareA?: string;
  compareB?: string;
  /** Score a labeled judge-queue.json and exit */
  scoreJudgeQueue?: string;
  /** Holdout promotion check: before/after EvalReport JSON paths */
  promotionCheckBefore?: string;
  promotionCheckAfter?: string;
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

const CLI_OPTIONS = {
  case: { type: "string" },
  prefix: { type: "string" },
  runner: { type: "string" },
  split: { type: "string" },
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
  /** Takes two paths: `--compare <dirA> <dirB>` (the second is the next positional). */
  compare: { type: "string" },
  "score-judge-queue": { type: "string" },
  /** Takes two paths: `--promotion-check <before.json> <after.json>`. */
  "promotion-check": { type: "string" },
  help: { type: "boolean", short: "h" },
} as const satisfies NonNullable<ParseArgsConfig["options"]>;

/** Options that take two values; the second is the positional right after the first. */
const TWO_VALUE_OPTIONS = new Set(["compare", "promotion-check"]);

/**
 * Parse CLI args strictly: unknown flags and stray arguments are errors, and both
 * `--runner report` and `--runner=report` work.
 */
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

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    caseId: values.case,
    idPrefix: values.prefix,
    runners: values.runner !== undefined ? parseRunners(values.runner) : undefined,
    split: values.split !== undefined ? parseSplit(values.split) : undefined,
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
    compareA: values.compare,
    compareB: secondValues.get("compare"),
    scoreJudgeQueue: values["score-judge-queue"],
    promotionCheckBefore: values["promotion-check"],
    promotionCheckAfter: secondValues.get("promotion-check"),
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
  --compare <dirA> <dirB>  Pairwise compare artifact dirs (no agent runs)
  --score-judge-queue <path>  Score labeled judge-queue.json and exit 0/1/2
  --promotion-check <before.json> <after.json>  Fail on new grounding/structure judge fails
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
    const { scoreJudgeCalibration } = await import("./reports/judgeCalibration");
    const items = loadJudgeQueueFile(opts.scoreJudgeQueue);
    const score = scoreJudgeCalibration(items);
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
  console.log(
    `Running ${fixtureIds.length} fixture(s)...${opts.dryRun ? " (dry-run)" : ""}${opts.split ? ` [split=${opts.split}]` : ""}\n`
  );

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
    chatInvoker = createConvexChatInvoker(convexUrl, { evalSecret });
    researchInvoker = createConvexResearchInvoker(convexUrl, { evalSecret });
    literatureReviewInvoker = createConvexLiteratureReviewInvoker(convexUrl, { evalSecret });
    studioInvokers = createConvexStudioInvokers(convexUrl, { evalSecret });
    seedApi = createConvexSeedApi(convexUrl, evalSecret);
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

  // Use-case packs: resolve seeded notebooks before any job runs, so an
  // unseeded pack costs nothing (spec §3).
  let fixturesToRun = opts.dryRun ? pinForDryRun(expandedFixtures) : expandedFixtures;
  let packSourceTexts = new Map<string, SourceText[]>();
  if (expandedFixtures.some((f) => f.useCase)) {
    console.log(`Planned use-case jobs:\n${formatPlannedJobs(expandedFixtures)}\n`);
    if (!opts.dryRun && !process.env.TOGETHER_AI_API_KEY?.trim()) {
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
    }
  }

  for (const fixture of fixturesToRun) {
    fixtureMeta.set(fixture.id, {
      question: fixture.question,
      expectedItems: fixture.expectedItems,
    });
    console.log(`[${fixture.id}] ${fixture.question}`);

    // Run the eval — throws in real mode if no invoker registered
    let results;
    try {
      results = await runEval(fixture, {
        dryRun: opts.dryRun,
        chatInvoker,
        researchInvoker,
        literatureReviewInvoker,
        studioInvokers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FATAL: ${message}`);
      console.error("  Use --dry-run to validate fixtures without invokers.");
      process.exit(2);
    }

    for (const { artifact, errors } of results) {
      artifact.useCase = fixture.useCase;
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.join("; ")}`);
        runtimeErrorCount += errors.length;
      }

      allArtifacts.push(artifact);

      // Save studio output for manual inspection
      if (artifact.studioOutput) {
        const outputFile = `evals/rag/generated/${caseFileStem(artifact.caseId)}-${artifact.runner}-${Date.now()}.json`;
        mkdirSync("evals/rag/generated", { recursive: true });
        writeFileSync(
          outputFile,
          JSON.stringify(
            {
              caseId: artifact.caseId,
              runner: artifact.runner,
              smartLlm: opts.smartLlm,
              answer: artifact.answer,
              raw: artifact.studioOutput.raw,
              latencyMs: artifact.latencyMs,
            },
            null,
            2
          )
        );
        console.log(`  Output saved to: ${outputFile}`);
      }

      // Load baseline for this case+runner if available
      const baseline = loadBaseline(fixture.id, artifact.runner);
      if (baseline) {
        console.log(
          `  Baseline loaded: ${baseline.latencyMs}ms, ${baseline.tokenUsage.total} tokens`
        );
      }

      const metrics = await scoreAllMetrics(fixture, artifact, baseline, {
        likertJudges: opts.likertJudges,
        dryRun: opts.dryRun,
        judgeModel: opts.judgeModel ?? DEFAULT_JUDGE_MODEL,
        packSourceTexts: fixture.useCase
          ? packSourceTextsFor(fixture, packSourceTexts.get(fixture.useCase))
          : undefined,
      });
      allMetrics.push(...metrics);

      if (opts.verbose) {
        for (const m of metrics) {
          const icon =
            m.status === "pass" ? "+" : m.status === "fail" ? "x" : m.status === "warn" ? "!" : "i";
          console.log(`  [${icon}] ${m.metric}: ${m.score.toFixed(2)} — ${m.detail}`);
        }
      } else {
        const pass = metrics.filter((m) => m.status === "pass").length;
        const fail = metrics.filter((m) => m.status === "fail").length;
        console.log(`  ${pass} pass, ${fail} fail (${artifact.runner}, ${artifact.latencyMs}ms)`);
      }
    }
    console.log("");
  }

  // Generate report
  const commitSha = await getCommitSha();
  const report = generateReport(allMetrics, {
    commitSha,
    includeWarnings: true,
    groupBySourcePolicy: !!opts.sourceMatrix,
    split: opts.split,
    useCaseByCase: new Map(
      fixturesToRun.flatMap((f): [string, string][] => (f.useCase ? [[f.id, f.useCase]] : []))
    ),
  });

  console.log(formatReport(report));

  // Write JSON report
  if (opts.output) {
    mkdirSync(dirname(opts.output), { recursive: true });
    writeFileSync(opts.output, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${opts.output}`);
  }

  if (!opts.dryRun) {
    const queue = buildJudgeCalibrationQueue(allMetrics, { limit: 20 });
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
  console.error("Fatal error:", err);
  process.exit(2);
});
