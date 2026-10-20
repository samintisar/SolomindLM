/**
 * Per-use-case rubric judges (spec §4). One binary verdict per applicable
 * RubricCheck, named `rubric:<pack>:<check>`. Rubric text lives in eval code
 * only and must never be copied into production prompts.
 */
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { RubricCheck, SourceText, UseCasePack } from "../usecases/types";
import {
  CHUNK_CONTEXT_LIMIT as CHUNKS_LIMIT,
  formatChunks,
  parseBinaryResponse,
} from "./binaryJudges";
import { CUT_NOTE, formatSourceTexts, SOURCE_TEXTS_LIMIT } from "./evidence";
import { metricResult } from "./metricResult";

/** Long enough for a full report or a many-row spreadsheet, so the judge sees every row. */
const OUTPUT_LIMIT = 40_000;

interface Evidence {
  header: string;
  text: string;
  truncated: boolean;
}

export interface RubricJudgeOptions {
  invoke: (prompt: string) => Promise<string>;
  model: string;
  /** Pack source text, used when the artifact has no retrieved chunks (studio runners) */
  sourceTexts?: SourceText[];
  /** Check ids to run (`--rubric`); every applicable check when unset */
  onlyChecks?: string[];
}

export function rubricMetricName(packId: string, checkId: string): string {
  return `rubric:${packId}:${checkId}`;
}

function truncateOutput(output: string): string {
  if (output.length <= OUTPUT_LIMIT) return output;
  return `${output.slice(0, OUTPUT_LIMIT)}\n[… output truncated at ${OUTPUT_LIMIT} chars for judging]`;
}

function sourceEvidence(artifact: EvalRunArtifact, sourceTexts: SourceText[]): Evidence | null {
  if (artifact.selectedChunks.length > 0) {
    return {
      header:
        "Source passages retrieved for this answer:\n" +
        "Citation markers such as [7] in the output refer to the passage with that number.",
      ...formatChunks(artifact.selectedChunks, CHUNKS_LIMIT),
    };
  }
  if (sourceTexts.length === 0) return null;
  const formatted = formatSourceTexts(sourceTexts, SOURCE_TEXTS_LIMIT);
  return {
    header: formatted.truncated
      ? "Source text (some documents cut off):"
      : "Source text (complete):",
    ...formatted,
  };
}

export function buildRubricPrompt(
  pack: UseCasePack,
  check: RubricCheck,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  sourceTexts: SourceText[] = []
): string {
  // The check goes last: everything before it is the same for every check of one output, so
  // the judge's prompt cache serves that prefix (often the whole source text) after the first.
  const lines = [
    `You are checking an AI-generated ${artifact.runner} output made for ${pack.title}.`,
    "",
    `User request: ${fixture.question}`,
    "",
  ];
  if (check.evidence === "sources") {
    const evidence = sourceEvidence(artifact, sourceTexts);
    if (!evidence) {
      lines.push("Source text:", "(no source text recorded)", "");
    } else {
      lines.push(evidence.header);
      if (evidence.truncated) lines.push(CUT_NOTE);
      lines.push(evidence.text, "");
    }
  }
  lines.push(
    "Output:",
    truncateOutput(artifact.answer),
    "",
    `Check: ${check.question}`,
    "",
    "Answer the check for the output as a whole. Pass only if the answer is yes.",
    'Respond JSON only: {"pass": boolean, "reason": string}'
  );
  return lines.join("\n");
}

export async function scoreRubricMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  pack: UseCasePack,
  options: RubricJudgeOptions
): Promise<MetricResult[]> {
  const checks = pack.rubric.filter(
    (c) =>
      c.appliesTo.includes(artifact.runner) &&
      (!options.onlyChecks || options.onlyChecks.includes(c.id))
  );
  const judge = async (check: RubricCheck): Promise<MetricResult> => {
    const metric = rubricMetricName(pack.id, check.id);
    try {
      const raw = await options.invoke(
        buildRubricPrompt(pack, check, fixture, artifact, options.sourceTexts)
      );
      const { pass, reason } = parseBinaryResponse(raw);
      return metricResult(metric, fixture, artifact, pass ? "pass" : "fail", pass ? 1 : 0, reason, {
        model: options.model,
        pass,
        check: check.question,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // No verdict: a warning, so a flaky judge does not fail the run (scorecard counts it apart).
      return metricResult(metric, fixture, artifact, "warn", 0, `Rubric judge failed: ${message}`, {
        model: options.model,
        judgeError: true,
        error: message,
        check: check.question,
      });
    }
  };
  if (checks.length === 0) return [];
  // The first check runs alone so its prompt is cached before the others, which share its
  // prefix, run concurrently. Results keep rubric order.
  const first = await judge(checks[0]);
  return [first, ...(await Promise.all(checks.slice(1).map(judge)))];
}
