/**
 * Chat config sweep: runs the chat fixtures once per grid cell, each with that cell's
 * `--chat-config` overrides. Writes the artifacts of every cell, sweep.json and sweep.md, and
 * prints a table with the Pareto front (quality up, tokens down, p95 latency down).
 *
 * Usage:
 *   bun run eval:sweep -- --dry-run --grid "hydeEnabled=true,false;contextTokenBudget=4000,8000" --prefix ml-factoid
 *   bun --env-file=.env run evals/rag/sweep.ts --grid "fewShotPolicy=never,always" --split train --compare-best
 *
 * The empty override set is always run as the baseline. Real runs need RAG_EVAL_CONVEX_URL and
 * RAG_EVAL_SECRET, as the eval CLI does.
 */

import { parseArgs } from "node:util";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { mapWithConcurrency } from "./concurrency";
import { getFixture, listFixtureIds } from "./fixtures";
import { createLiveInvokers, type LiveInvokers } from "./liveInvokers";
import { scoreAllMetrics } from "./metrics/scorers";
import { DEFAULT_JUDGE_MODEL } from "./metrics/togetherLlmJudge";
import { compareArtifactDirs, exportEvalRunArtifacts } from "./reports/compare";
import { FixtureFatalError, type FixtureRunDeps, runFixtureAndFlush } from "./runFixture";
import { runEval } from "./runners";
import { filterFixtureIdsBySplit } from "./splits";
import { buildSweepCells, parseGrid, type SweepCell } from "./sweep/grid";
import { type CellInput, type CellSummary, markPareto, summarizeCell } from "./sweep/pareto";
import { renderSweepMarkdown, sweepReport } from "./sweep/report";
import type { EvalFixture, EvalRunArtifact, EvalSplit, MetricResult } from "./types";
import { USE_CASE_PACKS } from "./usecases";
import { resolveUseCaseIds } from "./usecases/ids";
import { requireEvalConvexEnv } from "./usecases/prodGuard";
import {
  excludeUnselectedPackFixtures,
  PackNotReadyError,
  packSourceTextsFor,
  pinForDryRun,
  prepareUseCaseRun,
} from "./usecases/resolve";
import type { SourceText } from "./usecases/types";
import { formatPackProblems, packsToValidate } from "./usecases/validate";

interface SweepOptions {
  grid?: string;
  split: EvalSplit;
  prefix?: string;
  useCase?: string;
  repeats: number;
  concurrency?: number;
  artifactsDir: string;
  dryRun: boolean;
  compareBest: boolean;
}

const SWEEP_OPTIONS = {
  grid: { type: "string" },
  split: { type: "string", default: "train" },
  prefix: { type: "string" },
  "use-case": { type: "string" },
  repeats: { type: "string", default: "1" },
  concurrency: { type: "string" },
  "artifacts-dir": { type: "string" },
  "dry-run": { type: "boolean" },
  "compare-best": { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

function parsePositiveInt(name: string, value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1) {
    throw new Error(`--${name} takes a positive integer. See --help.`);
  }
  return n;
}

function parseSplit(value: string): EvalSplit {
  if (value !== "smoke" && value !== "train" && value !== "holdout") {
    throw new Error(`Invalid --split "${value}". Use smoke, train, or holdout.`);
  }
  return value;
}

function printHelp(): void {
  console.log(`
Chat config sweep

Usage:
  bun run eval:sweep -- --grid "<key>=<v1>,<v2>;<key2>=<v3>" [options]

Options:
  --grid <spec>          Axes separated by ";", values by ",". Cells are the cartesian product;
                         the empty override set is always run as the baseline.
                         Keys: see --chat-config in the eval CLI (evals/rag/cli.ts --help)
  --split <name>         smoke, train or holdout (default: train)
  --prefix <str>         Fixtures whose id starts with prefix
  --use-case <ids|all>   Use-case pack fixtures only (seed first: bun run eval:seed)
  --repeats <n>          Runs per fixture and cell (default: 1)
  --concurrency <n>      Fixtures in flight per cell (default: 3 live, 1 dry)
  --artifacts-dir <dir>  Output directory (default: evals/rag/generated/sweep-<timestamp>)
  --dry-run              Stub artifacts; exercises the whole pipeline without agents or judges
  --compare-best         Pairwise-compare the best Pareto cell against the baseline
  --help, -h             Show this help
`);
}

function parseSweepArgs(args: string[]): SweepOptions | "help" {
  const { values } = parseArgs({
    args,
    options: SWEEP_OPTIONS,
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    printHelp();
    return "help";
  }
  const dryRun = values["dry-run"] ?? false;
  return {
    grid: values.grid,
    split: parseSplit(values.split),
    prefix: values.prefix,
    useCase: values["use-case"],
    repeats: parsePositiveInt("repeats", values.repeats),
    concurrency:
      values.concurrency !== undefined
        ? parsePositiveInt("concurrency", values.concurrency)
        : undefined,
    artifactsDir:
      values["artifacts-dir"] ??
      join("evals/rag/generated", `sweep-${new Date().toISOString().replace(/[:.]/g, "-")}`),
    dryRun,
    compareBest: values["compare-best"] ?? false,
  };
}

/** Chat fixtures the sweep runs: the chat runner only, filtered as the eval CLI filters. */
function selectFixtureIds(opts: SweepOptions): string[] {
  const known = USE_CASE_PACKS.map((p) => p.pack.id);
  const useCases = opts.useCase !== undefined ? resolveUseCaseIds(opts.useCase, known) : undefined;
  let ids = excludeUnselectedPackFixtures(listFixtureIds(), getFixture, {
    useCases,
    idPrefix: opts.prefix,
  });
  if (opts.prefix) ids = ids.filter((id) => id.startsWith(opts.prefix as string));
  ids = ids.filter((id) => getFixture(id).runner === "chat");
  ids = filterFixtureIdsBySplit(ids, opts.split);
  if (useCases) ids = ids.filter((id) => useCases.includes(getFixture(id).useCase ?? ""));
  return ids;
}

function commitSha(): string {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

/** The fixtures to run and, for use-case packs on a real run, their source texts. */
async function prepareFixtures(
  ids: string[],
  opts: SweepOptions,
  live: LiveInvokers | undefined
): Promise<{ fixtures: EvalFixture[]; sourceTexts: Map<string, SourceText[]> }> {
  const expanded = ids.map((id) => ({ ...getFixture(id) }));
  const problems = formatPackProblems(
    packsToValidate(USE_CASE_PACKS, expanded, opts.useCase !== undefined)
  );
  if (problems.length > 0) throw new Error(problems.join("\n"));
  if (opts.dryRun || !expanded.some((f) => f.useCase)) {
    return { fixtures: opts.dryRun ? pinForDryRun(expanded) : expanded, sourceTexts: new Map() };
  }
  if (!live) throw new Error("A real sweep needs live invokers.");
  const prepared = await prepareUseCaseRun(expanded, live.seedApi);
  return { fixtures: prepared.fixtures, sourceTexts: prepared.sourceTexts };
}

interface CellRun extends CellInput {
  runtimeErrors: number;
}

async function runCell(
  cell: SweepCell,
  fixtures: EvalFixture[],
  sourceTexts: Map<string, SourceText[]>,
  opts: SweepOptions,
  live: LiveInvokers | undefined
): Promise<CellRun> {
  const hasOverrides = Object.keys(cell.overrides).length > 0;
  const deps: Omit<FixtureRunDeps, "log"> = {
    repeats: opts.repeats,
    verbose: false,
    runEval,
    runEvalOptions: {
      dryRun: opts.dryRun,
      chatInvoker: live?.chatInvoker,
      chatConfigOverrides: hasOverrides ? cell.overrides : undefined,
    },
    scoreAllMetrics,
    scoreOptionsFor: (fixture: EvalFixture) => ({
      likertJudges: false,
      dryRun: opts.dryRun,
      judgeModel: DEFAULT_JUDGE_MODEL,
      packSourceTexts: fixture.useCase
        ? packSourceTextsFor(fixture, sourceTexts.get(fixture.useCase))
        : undefined,
    }),
    loadBaseline: () => undefined,
    saveStudioOutput: () => "",
  };
  const concurrency = opts.concurrency ?? (opts.dryRun ? 1 : 3);
  const outcomes = await mapWithConcurrency(fixtures, concurrency, (fixture) =>
    runFixtureAndFlush(fixture, deps)
  );

  const artifacts: EvalRunArtifact[] = [];
  const metrics: MetricResult[] = [];
  let runtimeErrors = 0;
  for (const outcome of outcomes) {
    artifacts.push(...outcome.artifacts);
    metrics.push(...outcome.metrics);
    runtimeErrors += outcome.runtimeErrors;
  }
  if (artifacts.length > 0) {
    exportEvalRunArtifacts(join(opts.artifactsDir, cell.id), artifacts);
  }
  return { id: cell.id, overrides: cell.overrides, artifacts, metrics, runtimeErrors };
}

async function main(): Promise<void> {
  let opts: SweepOptions | "help";
  let cells: SweepCell[];
  try {
    opts = parseSweepArgs(process.argv.slice(2));
    if (opts === "help") return;
    cells = buildSweepCells(parseGrid(opts.grid ?? ""));
  } catch (err) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const ids = selectFixtureIds(opts);
  if (ids.length === 0) {
    console.error(
      `No chat fixtures matched split ${opts.split}${opts.prefix ? `, prefix ${opts.prefix}` : ""}.`
    );
    process.exit(2);
  }

  // Grounding is the quality signal, and its judge runs on Together: without the key a real sweep
  // would report n/a for quality in every cell, so it is refused up front.
  if (!opts.dryRun && !process.env.TOGETHER_AI_API_KEY?.trim()) {
    console.error(
      "FATAL: a sweep needs TOGETHER_AI_API_KEY: the grounding judge is its quality signal."
    );
    console.error("  Use --dry-run to validate the sweep without judges.");
    process.exit(2);
  }

  let live: LiveInvokers | undefined;
  if (!opts.dryRun) {
    let convexEnv: { convexUrl: string; evalSecret: string };
    try {
      convexEnv = requireEvalConvexEnv();
    } catch (err) {
      console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
      console.error("  Use --dry-run to validate the sweep without Convex.");
      process.exit(2);
    }
    console.log(`Using Convex at ${convexEnv.convexUrl} (eval mode)`);
    live = createLiveInvokers(convexEnv.convexUrl, convexEnv.evalSecret);
  }
  const { fixtures, sourceTexts } = await prepareFixtures(ids, opts, live);

  console.log(
    `Sweep: ${cells.length} cell(s) x ${fixtures.length} fixture(s), split ${opts.split}, ${opts.repeats} repeat(s)${opts.dryRun ? " (dry run)" : ""}\n`
  );
  const runs: CellRun[] = [];
  for (const cell of cells) {
    console.log(`--- cell ${cell.id}: ${JSON.stringify(cell.overrides)}`);
    runs.push(await runCell(cell, fixtures, sourceTexts, opts, live));
  }

  const summaries = markPareto(runs.map((run) => summarizeCell(run)));
  const meta = { split: opts.split, repeats: opts.repeats, dryRun: opts.dryRun, grid: opts.grid };
  mkdirSync(opts.artifactsDir, { recursive: true });
  writeFileSync(
    join(opts.artifactsDir, "sweep.json"),
    `${JSON.stringify(sweepReport(summaries, meta), null, 2)}\n`
  );
  const markdown = renderSweepMarkdown(summaries, meta);
  writeFileSync(join(opts.artifactsDir, "sweep.md"), markdown);
  console.log(`\n${markdown}`);
  console.log(`Sweep written to ${opts.artifactsDir}`);

  if (opts.compareBest) {
    await compareBestWithBaseline(summaries, opts);
  }

  const runtimeErrors = runs.reduce((sum, run) => sum + run.runtimeErrors, 0);
  if (runtimeErrors > 0) {
    console.error(
      `\n${runtimeErrors} fixture(s) failed at the invocation layer. Not scored; exit 2.`
    );
    process.exit(2);
  }
}

/** Compares the Pareto cell with the best quality (fewest tokens on a tie) to the baseline. */
async function compareBestWithBaseline(
  summaries: CellSummary[],
  opts: SweepOptions
): Promise<void> {
  if (opts.dryRun) {
    console.log("--compare-best skipped: a dry run makes no judge calls.");
    return;
  }
  // Only front cells have quality and tokens (markPareto), so the comparison is defined.
  const front = summaries.filter(
    (s): s is CellSummary & { quality: number; tokensMean: number } =>
      s.pareto && s.quality !== null && s.tokensMean !== null
  );
  const best = [...front].sort((a, b) => b.quality - a.quality || a.tokensMean - b.tokensMean)[0];
  const baseline = summaries.find((s) => Object.keys(s.overrides).length === 0);
  if (!best || !baseline || best.id === baseline.id) {
    console.log("--compare-best: the best cell is the baseline; nothing to compare.");
    return;
  }
  const report = await compareArtifactDirs({
    pathA: join(opts.artifactsDir, baseline.id),
    pathB: join(opts.artifactsDir, best.id),
    judgeModel: DEFAULT_JUDGE_MODEL,
    commitSha: commitSha(),
  });
  writeFileSync(
    join(opts.artifactsDir, "compare-best.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(
    `Best cell ${best.id} vs baseline ${baseline.id}: wins ${report.winsB}, losses ${report.winsA}, ties ${report.ties} (win rate ${report.winRateB.toFixed(2)}).`
  );
}

main().catch((err) => {
  if (err instanceof FixtureFatalError) process.exit(2);
  if (err instanceof PackNotReadyError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error("Fatal error:", err);
  process.exit(2);
});
