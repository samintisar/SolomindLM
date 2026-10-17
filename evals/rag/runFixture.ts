/**
 * Per-fixture work for the CLI: run the fixture `repeats` times, score each repeat, and merge
 * the repeats into one set of rows. Console output goes through a line buffer so concurrent
 * fixtures do not interleave; the caller flushes it when the fixture finishes.
 */

import type { ScoreAllMetricsOptions } from "./metrics/scorers";
import { aggregateRepeatMetrics } from "./reports/repeats";
import type { RunEvalOptions } from "./runners";
import type { EvalRunnerResult } from "./runners/types";
import type { EvalBaseline, EvalFixture, EvalRunArtifact, MetricResult } from "./types";

/** A console line held until its fixture finishes. */
export interface BufferedLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface FixtureLog {
  out(text?: string): void;
  err(text: string): void;
}

export function createLineBuffer(): { log: FixtureLog; lines: BufferedLine[] } {
  const lines: BufferedLine[] = [];
  return {
    lines,
    log: {
      out: (text = "") => lines.push({ stream: "stdout", text }),
      err: (text) => lines.push({ stream: "stderr", text }),
    },
  };
}

export function flushLines(lines: BufferedLine[]): void {
  for (const line of lines) {
    if (line.stream === "stdout") console.log(line.text);
    else console.error(line.text);
  }
}

/** The invoker failed for a fixture. Its message is already in the log; the CLI exits 2. */
export class FixtureFatalError extends Error {}

export interface FixtureRunDeps {
  repeats: number;
  verbose: boolean;
  runEval: (fixture: EvalFixture, options: RunEvalOptions) => Promise<EvalRunnerResult[]>;
  runEvalOptions: RunEvalOptions;
  scoreAllMetrics: (
    fixture: EvalFixture,
    artifact: EvalRunArtifact,
    baseline: EvalBaseline | undefined,
    options: ScoreAllMetricsOptions
  ) => Promise<MetricResult[]>;
  scoreOptionsFor: (fixture: EvalFixture) => ScoreAllMetricsOptions;
  loadBaseline: (caseId: string, runner: string) => EvalBaseline | undefined;
  /** Writes studio output for inspection and returns the path written. */
  saveStudioOutput: (artifact: EvalRunArtifact) => string;
  log: FixtureLog;
}

export interface FixtureRunResult {
  /** Artifacts of the first repeat only (export, Ragas) */
  artifacts: EvalRunArtifact[];
  /** Metrics of the first repeat only (judge queue) */
  firstRepeatMetrics: MetricResult[];
  /** Metrics aggregated over all repeats (report) */
  metrics: MetricResult[];
  /** Invocation-layer errors summed over all repeats */
  runtimeErrors: number;
}

export async function runFixtureWithRepeats(
  fixture: EvalFixture,
  deps: FixtureRunDeps
): Promise<FixtureRunResult> {
  const { log } = deps;
  log.out(`[${fixture.id}] ${fixture.question}`);

  const artifacts: EvalRunArtifact[] = [];
  const repeatRuns: MetricResult[][] = [];
  let runtimeErrors = 0;

  for (let repeat = 1; repeat <= deps.repeats; repeat++) {
    // Throws in real mode if no invoker is registered
    let results: EvalRunnerResult[];
    try {
      results = await deps.runEval(fixture, deps.runEvalOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.err(`  FATAL: ${message}`);
      log.err("  Use --dry-run to validate fixtures without invokers.");
      throw new FixtureFatalError(message);
    }

    const runMetrics: MetricResult[] = [];
    for (const { artifact, errors } of results) {
      artifact.useCase = fixture.useCase;
      if (errors.length > 0) {
        log.out(`  Errors: ${errors.join("; ")}`);
        runtimeErrors += errors.length;
      }

      if (repeat === 1) artifacts.push(artifact);

      if (artifact.studioOutput) {
        log.out(`  Output saved to: ${deps.saveStudioOutput(artifact)}`);
      }

      const baseline = deps.loadBaseline(fixture.id, artifact.runner);
      if (repeat === 1 && baseline) {
        log.out(`  Baseline loaded: ${baseline.latencyMs}ms, ${baseline.tokenUsage.total} tokens`);
      }

      runMetrics.push(
        ...(await deps.scoreAllMetrics(fixture, artifact, baseline, deps.scoreOptionsFor(fixture)))
      );
    }
    repeatRuns.push(runMetrics);

    if (deps.repeats > 1 && !deps.verbose) {
      const pass = runMetrics.filter((m) => m.status === "pass").length;
      const fail = runMetrics.filter((m) => m.status === "fail").length;
      log.out(`  repeat ${repeat}/${deps.repeats}: ${pass} pass, ${fail} fail`);
    }
  }

  const aggregated = aggregateRepeatMetrics(repeatRuns);
  for (const artifact of artifacts) {
    const rows = aggregated.filter(
      (m) => m.caseId === artifact.caseId && m.runner === artifact.runner
    );
    if (deps.verbose) {
      for (const m of rows) {
        const icon =
          m.status === "pass" ? "+" : m.status === "fail" ? "x" : m.status === "warn" ? "!" : "i";
        log.out(`  [${icon}] ${m.metric}: ${m.score.toFixed(2)} — ${m.detail}`);
      }
    } else {
      const pass = rows.filter((m) => m.status === "pass").length;
      const fail = rows.filter((m) => m.status === "fail").length;
      log.out(`  ${pass} pass, ${fail} fail (${artifact.runner}, ${artifact.latencyMs}ms)`);
    }
  }
  log.out();

  return {
    artifacts,
    firstRepeatMetrics: repeatRuns[0] ?? [],
    metrics: aggregated,
    runtimeErrors,
  };
}

/**
 * Run one fixture and hand its buffered lines to `flush` exactly once, including when the run
 * throws. The buffer is created here, so the caller only supplies the deps without a log.
 */
export async function runFixtureAndFlush(
  fixture: EvalFixture,
  deps: Omit<FixtureRunDeps, "log">,
  flush: (lines: BufferedLine[]) => void = flushLines
): Promise<FixtureRunResult> {
  const buffer = createLineBuffer();
  try {
    return await runFixtureWithRepeats(fixture, { ...deps, log: buffer.log });
  } finally {
    flush(buffer.lines);
  }
}
