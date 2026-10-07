import { computeConfigHash } from "../configHash";
import type { ConcreteRunnerKind, EvalFixture, EvalRunArtifact } from "../types";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";

/** Empty artifact returned for invalid fixtures, dry runs, and failed invocations. */
function stubArtifact(
  fixture: EvalFixture,
  runner: ConcreteRunnerKind,
  configHash: string
): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner,
    configHash,
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
}

interface HarnessSpec<Invoker> {
  runner: ConcreteRunnerKind;
  validate(fixture: EvalFixture): string[];
  /** Thrown when a real run has no invoker (a setup error, not a per-fixture failure). */
  missingInvokerMessage: string;
  /** Optional setup check on the invoker; throws like a missing invoker. */
  checkInvoker?(invoker: Invoker): void;
  /** Prefix for the per-fixture error when `invoke` throws, e.g. "Chat agent invocation failed". */
  failurePrefix: string;
  invoke(invoker: Invoker, configHash: string): Promise<EvalRunArtifact>;
}

/**
 * Shared runner skeleton: hash the config, validate the fixture, short-circuit dry runs,
 * require an invoker for real runs, and turn invocation errors into a stub artifact plus an
 * error string (so the CLI counts them as invocation-layer failures).
 */
export async function runWithHarness<Invoker>(
  options: EvalRunnerOptions,
  invoker: Invoker | undefined,
  spec: HarnessSpec<Invoker>
): Promise<EvalRunnerResult> {
  const { fixture, config, dryRun } = options;
  const configHash = computeConfigHash(config);
  const stub = () => stubArtifact(fixture, spec.runner, configHash);

  const validationErrors = spec.validate(fixture);
  if (validationErrors.length > 0) {
    return { artifact: stub(), errors: validationErrors };
  }

  if (dryRun) {
    return { artifact: stub(), errors: [] };
  }

  // Real run: invoker is required — fail fast rather than producing stub metrics
  if (!invoker) {
    throw new Error(spec.missingInvokerMessage);
  }
  spec.checkInvoker?.(invoker);

  try {
    return { artifact: await spec.invoke(invoker, configHash), errors: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { artifact: stub(), errors: [`${spec.failurePrefix}: ${message}`] };
  }
}
