/**
 * RAG Eval Pipeline CLI entry point.
 *
 * Usage:
 *   bun run eval:rag -- --dry-run                  # Validate fixtures
 *   bun run eval:rag -- --case agentic-patterns-20 # Needs RAG_EVAL_CONVEX_URL + RAG_EVAL_SECRET
 *   bun run eval:rag -- --prefix ml-               # ML NotebookLM fixture suite only
 *   bun run eval:rag -- --full                     # All fixtures, verbose
 *   bun run eval:rag -- --export-artifacts         # Export Ragas-compatible artifacts
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { getFixture, listFixtureIds, withSourceMatrix } from "./fixtures";
import type { SourcePolicyConfig } from "./types";
import { runEval, createConvexChatInvoker, createConvexStudioInvokers } from "./runners";
import { createConvexResearchInvoker } from "./runners/convexResearchInvoker";
import type { ChatAgentInvoker } from "./runners/chatRunner";
import type { ResearchAgentInvoker } from "./runners/researchRunner";
import type { StudioInvoker } from "./runners/convexStudioInvoker";
import type { StudioRunnerKind, RunnerKind } from "./types";
import { scoreAllMetrics } from "./metrics/scorers";
import { generateReport, formatReport } from "./reports";
import type { EvalBaseline, EvalRunArtifact, MetricResult, EvalFixture } from "./types";

// ─── CLI Options ─────────────────────────────────────────────

interface CliOptions {
  caseId?: string;
  /** Run fixtures whose id starts with this prefix (e.g. "ml-" for NotebookLM ML suite) */
  idPrefix?: string;
  /** Restrict to fixtures whose `runner` matches one of these kinds */
  runners?: RunnerKind[];
  dryRun: boolean;
  full: boolean;
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
}

const ALL_RUNNERS: ReadonlySet<RunnerKind> = new Set<RunnerKind>([
  "chat",
  "research",
  "both",
  "report",
  "flashcards",
  "quiz",
  "mindmap",
  "infographic",
  "spreadsheet",
  "writtenQuestions",
  "audioScript",
  "audioScriptOnly",
]);

function parseRunners(value: string): RunnerKind[] {
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (!ALL_RUNNERS.has(p as RunnerKind)) {
      throw new Error(`Unknown runner kind "${p}". Valid: ${Array.from(ALL_RUNNERS).join(", ")}`);
    }
  }
  return parts as RunnerKind[];
}

function parseArgs(args: string[]): CliOptions {
  const opts: CliOptions = {
    dryRun: false,
    full: false,
    verbose: false,
    exportArtifacts: false,
    artifactsDir: "evals/rag/generated",
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--case":
        opts.caseId = args[++i];
        break;
      case "--prefix":
        opts.idPrefix = args[++i];
        break;
      case "--runner":
        opts.runners = parseRunners(args[++i]);
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--full":
        opts.full = true;
        break;
      case "--verbose":
      case "-v":
        opts.verbose = true;
        break;
      case "--output":
      case "-o":
        opts.output = args[++i];
        break;
      case "--export-artifacts":
        opts.exportArtifacts = true;
        break;
      case "--artifacts-dir":
        opts.artifactsDir = args[++i];
        break;
      case "--source-matrix":
        opts.sourceMatrix = args[++i];
        break;
      case "--smart-llm":
        opts.smartLlm = args[++i];
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`
RAG Eval Pipeline

Usage:
  bun run eval:rag [options]

Options:
  --case <id>              Run a specific fixture by id
  --prefix <str>           Run fixtures whose id starts with prefix (e.g. ml-)
  --runner <kinds>         Comma-separated runner filter (chat,research,flashcards,…)
  --dry-run                Validate fixtures without running agents
  --full                   Run all fixtures with verbose output
  --verbose, -v            Show detailed metric output
  --output, -o <path>      Write JSON report to file
  --export-artifacts       Export Ragas-compatible artifacts alongside report
  --artifacts-dir <dir>    Directory for exported artifacts (default: evals/rag/generated)
  --source-matrix <combos>  Test fixture against multiple channel combinations (e.g. "notebook,web+academic")
  --smart-llm <model>      Override smart LLM for studio agent reduce phases (e.g. meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8)
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
  const path = join("evals/rag/baselines", `${caseId}.json`);
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
  const opts = parseArgs(process.argv.slice(2));

  let fixtureIds: string[];
  if (opts.caseId) {
    fixtureIds = [opts.caseId];
  } else {
    fixtureIds = listFixtureIds();
    if (opts.idPrefix) {
      fixtureIds = fixtureIds.filter((id) => id.startsWith(opts.idPrefix!));
    }
    if (opts.runners && opts.runners.length > 0) {
      const allowed = new Set(opts.runners);
      fixtureIds = fixtureIds.filter((id) => allowed.has(getFixture(id).runner));
    }
  }
  if (opts.caseId && opts.idPrefix) {
    console.warn("Warning: --prefix is ignored when --case is set.");
  }
  if (opts.caseId && opts.runners) {
    console.warn("Warning: --runner is ignored when --case is set.");
  }
  console.log(`Running ${fixtureIds.length} fixture(s)...${opts.dryRun ? " (dry-run)" : ""}\n`);

  // Real mode runs against your dev Convex deployment (never rely on accidental prod URLs)
  let chatInvoker: ChatAgentInvoker | undefined;
  let researchInvoker: ResearchAgentInvoker | undefined;
  let studioInvokers: Partial<Record<StudioRunnerKind, StudioInvoker>> | undefined;
  if (!opts.dryRun) {
    const convexUrl = process.env.RAG_EVAL_CONVEX_URL?.trim();
    const evalSecret = process.env.RAG_EVAL_SECRET?.trim();
    if (!convexUrl) {
      console.error(
        "FATAL: Set RAG_EVAL_CONVEX_URL to your dev Convex URL (https://….convex.cloud)."
      );
      console.error("  Do not point this at prod. Use --dry-run to validate fixtures offline.");
      process.exit(2);
    }
    if (!evalSecret) {
      console.error(
        "FATAL: Set RAG_EVAL_SECRET to match the RAG_EVAL_SECRET env var on that deployment."
      );
      console.error(
        "  Convex must also set RAG_EVALS_ENABLED=true on that deployment for eval actions."
      );
      console.error("  Use --dry-run to validate fixtures without Convex.");
      process.exit(2);
    }
    console.log(`Using Convex at ${convexUrl} (eval mode)`);
    chatInvoker = createConvexChatInvoker(convexUrl, { evalSecret });
    researchInvoker = createConvexResearchInvoker(convexUrl, { evalSecret });
    studioInvokers = createConvexStudioInvokers(convexUrl, { evalSecret });
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
        channels: combo.split("+"),
      }));
      expandedFixtures.push(...withSourceMatrix(fixture, matrix));
    } else {
      expandedFixtures.push(fixture);
    }
  }

  for (const fixture of expandedFixtures) {
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
        studioInvokers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FATAL: ${message}`);
      console.error("  Use --dry-run to validate fixtures without invokers.");
      process.exit(2);
    }

    for (const { artifact, errors } of results) {
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.join("; ")}`);
        runtimeErrorCount += errors.length;
      }

      allArtifacts.push(artifact);

      // Save studio output for manual inspection
      if (artifact.studioOutput) {
        const outputFile = `evals/rag/generated/${artifact.caseId}-${artifact.runner}-${Date.now()}.json`;
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

      const metrics = await scoreAllMetrics(fixture, artifact, baseline);
      allMetrics.push(...metrics);

      if (opts.verbose || opts.full) {
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
  });

  console.log(formatReport(report));

  // Write JSON report
  if (opts.output) {
    mkdirSync(dirname(opts.output), { recursive: true });
    writeFileSync(opts.output, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${opts.output}`);
  }

  // Export Ragas-compatible artifacts
  if (opts.exportArtifacts && allArtifacts.length > 0) {
    const outPath = exportRagasArtifacts(fixtureMeta, allArtifacts, opts.artifactsDir);
    console.log(`\nRagas artifacts exported to ${outPath}`);
    console.log(`  Run: python evals/ragas/run_ragas.py --dataset ${outPath}`);
  }

  if (runtimeErrorCount > 0) {
    console.error(
      `\n${runtimeErrorCount} fixture(s) failed at the invocation layer (auth, gate, or stream errors). ` +
        `These are NOT scored as metric failures and would otherwise be hidden.`
    );
    process.exit(2);
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
