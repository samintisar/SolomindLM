/**
 * RAG Eval Pipeline CLI entry point.
 *
 * Usage:
 *   bun run eval:rag -- --dry-run                  # Validate fixtures
 *   bun run eval:rag -- --case agentic-patterns-20 # Single fixture (needs invokers)
 *   bun run eval:rag -- --prefix ml-               # ML NotebookLM fixture suite only
 *   bun run eval:rag -- --full                     # All fixtures, verbose
 *   bun run eval:rag -- --export-artifacts         # Export Ragas-compatible artifacts
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { getFixture, listFixtureIds } from "./fixtures";
import { runEval, createConvexChatInvoker } from "./runners";
import type { ChatAgentInvoker } from "./runners/chatRunner";
import { scoreAllMetrics } from "./metrics/scorers";
import { generateReport, formatReport } from "./reports";
import type { EvalBaseline, EvalRunArtifact, MetricResult } from "./types";

// ─── CLI Options ─────────────────────────────────────────────

interface CliOptions {
  caseId?: string;
  /** Run fixtures whose id starts with this prefix (e.g. "ml-" for NotebookLM ML suite) */
  idPrefix?: string;
  dryRun: boolean;
  full: boolean;
  verbose: boolean;
  output?: string;
  /** Export artifacts in Ragas-compatible format alongside the report */
  exportArtifacts: boolean;
  /** Directory for exported artifacts (default: evals/rag/generated) */
  artifactsDir: string;
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
  --dry-run                Validate fixtures without running agents
  --full                   Run all fixtures with verbose output
  --verbose, -v            Show detailed metric output
  --output, -o <path>      Write JSON report to file
  --export-artifacts       Export Ragas-compatible artifacts alongside report
  --artifacts-dir <dir>    Directory for exported artifacts (default: evals/rag/generated)
  --help, -h               Show this help

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
  outDir: string,
): string {
  const rows: RagasExportRow[] = artifacts.map((art) => {
    const fix = fixtures.get(art.caseId);
    return {
      question: fix?.question ?? "",
      answer: art.answer,
      selectedChunks: art.selectedChunks.map((c) => ({ content: c.content })),
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
  }
  if (opts.caseId && opts.idPrefix) {
    console.warn("Warning: --prefix is ignored when --case is set.");
  }
  console.log(`Running ${fixtureIds.length} fixture(s)...${opts.dryRun ? " (dry-run)" : ""}\n`);

  // Auto-detect Convex URL and create invoker for real mode
  let chatInvoker: ChatAgentInvoker | undefined;
  if (!opts.dryRun) {
    const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL;
    if (convexUrl) {
      console.log(`Using Convex at ${convexUrl}`);
      chatInvoker = createConvexChatInvoker(convexUrl);
    } else {
      console.error("FATAL: No Convex URL found. Set VITE_CONVEX_URL or CONVEX_URL.");
      console.error("  Use --dry-run to validate fixtures without Convex.");
      process.exit(2);
    }
  }

  const allMetrics: MetricResult[] = [];
  const allArtifacts: EvalRunArtifact[] = [];
  const fixtureMeta = new Map<string, { question: string; expectedItems: string[] }>();

  for (const id of fixtureIds) {
    const fixture = getFixture(id);
    fixtureMeta.set(fixture.id, {
      question: fixture.question,
      expectedItems: fixture.expectedItems,
    });
    console.log(`[${fixture.id}] ${fixture.question}`);

    // Run the eval — throws in real mode if no invoker registered
    let results;
    try {
      results = await runEval(fixture, { dryRun: opts.dryRun, chatInvoker });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FATAL: ${message}`);
      console.error("  Use --dry-run to validate fixtures without invokers.");
      process.exit(2);
    }

    for (const { artifact, errors } of results) {
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.join("; ")}`);
      }

      allArtifacts.push(artifact);

      // Load baseline for this case+runner if available
      const baseline = loadBaseline(fixture.id, artifact.runner);
      if (baseline) {
        console.log(`  Baseline loaded: ${baseline.latencyMs}ms, ${baseline.tokenUsage.total} tokens`);
      }

      const metrics = scoreAllMetrics(fixture, artifact, baseline);
      allMetrics.push(...metrics);

      if (opts.verbose || opts.full) {
        for (const m of metrics) {
          const icon = m.status === "pass" ? "+" : m.status === "fail" ? "x" : m.status === "warn" ? "!" : "i";
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
