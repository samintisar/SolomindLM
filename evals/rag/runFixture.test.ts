import { describe, expect, it, vi } from "vitest";
import {
  createLineBuffer,
  FixtureFatalError,
  type FixtureRunDeps,
  runFixtureAndFlush,
  runFixtureWithRepeats,
} from "./runFixture";
import type { EvalRunnerResult } from "./runners/types";
import type { EvalFixture, EvalRunArtifact, MetricResult } from "./types";

const fixture = {
  id: "case-x",
  question: "What is RAG?",
  runner: "chat",
  expectedItems: [],
} as unknown as EvalFixture;

const GROUNDING = "binary_judge_chat_grounding";

function metric(status: MetricResult["status"], name: string): MetricResult {
  return {
    metric: name,
    caseId: "case-x",
    runner: "chat",
    configHash: "h",
    status,
    score: status === "pass" ? 1 : 0,
    detail: "",
  };
}

/** Deps with a runner that errors on repeats 1 and 3, and a scorer that flips on repeat 2. */
function stubDeps(overrides: Partial<FixtureRunDeps> = {}) {
  const made: EvalRunArtifact[] = [];
  let runCalls = 0;
  let scoreCalls = 0;
  const runEval = vi.fn(async (): Promise<EvalRunnerResult[]> => {
    runCalls++;
    const artifact = {
      caseId: "case-x",
      runner: "chat",
      answer: `a${runCalls}`,
      latencyMs: 1,
    } as EvalRunArtifact;
    made.push(artifact);
    return [{ artifact, errors: runCalls % 2 === 1 ? ["auth error"] : [] }];
  });
  const scoreAllMetrics = vi.fn(async (): Promise<MetricResult[]> => {
    scoreCalls++;
    return [
      metric(scoreCalls === 2 ? "fail" : "pass", GROUNDING),
      metric("pass", "expected_item_recall"),
    ];
  });
  const deps: FixtureRunDeps = {
    repeats: 3,
    verbose: false,
    runEval,
    runEvalOptions: { dryRun: false },
    scoreAllMetrics,
    scoreOptionsFor: () => ({}),
    loadBaseline: () => undefined,
    saveStudioOutput: () => "unused.json",
    log: createLineBuffer().log,
    ...overrides,
  };
  return { deps, made, runEval, scoreAllMetrics };
}

describe("runFixtureWithRepeats", () => {
  it("calls the invoker once per repeat and returns aggregated rows", async () => {
    const { deps, runEval } = stubDeps();

    const result = await runFixtureWithRepeats(fixture, deps);

    expect(runEval).toHaveBeenCalledTimes(3);
    const grounding = result.metrics.filter((m) => m.metric === GROUNDING);
    expect(grounding).toHaveLength(1);
    // pass, fail, pass: a minority fail, so a flaky warning
    expect(grounding[0]).toMatchObject({ status: "warn", breakdown: { flaky: true, repeats: 3 } });
    expect(result.metrics.filter((m) => m.metric === "expected_item_recall")[0]?.status).toBe(
      "pass"
    );
  });

  it("sums runtime errors across repeats", async () => {
    const { deps } = stubDeps();
    const result = await runFixtureWithRepeats(fixture, deps);
    // Errors on repeats 1 and 3, one each
    expect(result.runtimeErrors).toBe(2);
  });

  it("returns only the first repeat's artifact, and first-repeat metrics for the judge queue", async () => {
    const { deps, made } = stubDeps();
    const result = await runFixtureWithRepeats(fixture, deps);

    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toBe(made[0]);
    expect(result.firstRepeatMetrics.find((m) => m.metric === GROUNDING)?.status).toBe("pass");
  });

  it("runs a single repeat without flakiness", async () => {
    const { deps, runEval } = stubDeps({ repeats: 1 });
    const result = await runFixtureWithRepeats(fixture, deps);

    expect(runEval).toHaveBeenCalledTimes(1);
    expect(result.metrics.find((m) => m.metric === GROUNDING)?.breakdown?.flaky).toBeUndefined();
  });

  it("writes the FATAL lines and throws FixtureFatalError when the invoker throws", async () => {
    const lines = createLineBuffer();
    const { deps, scoreAllMetrics } = stubDeps({
      log: lines.log,
      runEval: vi.fn(async () => {
        throw new Error("no invoker");
      }),
    });

    await expect(runFixtureWithRepeats(fixture, deps)).rejects.toThrow(FixtureFatalError);
    expect(scoreAllMetrics).not.toHaveBeenCalled();
    expect(lines.lines.map((l) => l.text)).toContain("  FATAL: no invoker");
  });
});

describe("runFixtureAndFlush", () => {
  it("flushes the buffered lines exactly once when the scorer throws", async () => {
    const flush = vi.fn();
    const { deps } = stubDeps({
      scoreAllMetrics: vi.fn(async () => {
        throw new Error("judge exploded");
      }),
    });

    await expect(runFixtureAndFlush(fixture, deps, flush)).rejects.toThrow("judge exploded");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes exactly once on success and returns the result", async () => {
    const flush = vi.fn();
    const { deps } = stubDeps();

    const result = await runFixtureAndFlush(fixture, deps, flush);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(result.artifacts).toHaveLength(1);
  });
});
