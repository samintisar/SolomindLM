/**
 * Per-use-case rubric judges (spec §4). One binary verdict per applicable
 * RubricCheck, named `rubric:<pack>:<check>`. Rubric text lives in eval code
 * only and must never be copied into production prompts.
 */
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { RubricCheck, SourceText, UseCasePack } from "../usecases/types";
import { parseBinaryResponse } from "./binaryJudges";

const OUTPUT_LIMIT = 10_000;
const SOURCES_LIMIT = 12_000;

export interface RubricJudgeOptions {
  invoke: (prompt: string) => Promise<string>;
  model: string;
  /** Pack source text, used when the artifact has no retrieved chunks (studio runners) */
  sourceTexts?: SourceText[];
}

export function rubricMetricName(packId: string, checkId: string): string {
  return `rubric:${packId}:${checkId}`;
}

/** Split `limit` chars evenly across documents. */
export function formatSourceTexts(texts: SourceText[], limit: number): string {
  if (texts.length === 0) return "";
  const perDoc = Math.floor(limit / texts.length);
  return texts.map((t) => `[${t.fileName}]\n${t.text.slice(0, perDoc)}`).join("\n\n---\n\n");
}

function truncateOutput(output: string): string {
  if (output.length <= OUTPUT_LIMIT) return output;
  return `${output.slice(0, OUTPUT_LIMIT)}\n[… output truncated at ${OUTPUT_LIMIT} chars for judging]`;
}

function sourceEvidence(artifact: EvalRunArtifact, sourceTexts: SourceText[]): string {
  if (artifact.selectedChunks.length > 0) {
    return artifact.selectedChunks
      .map((c) => `[${c.sourceTitle}]\n${c.content}`)
      .join("\n\n---\n\n")
      .slice(0, SOURCES_LIMIT);
  }
  return formatSourceTexts(sourceTexts, SOURCES_LIMIT);
}

export function buildRubricPrompt(
  pack: UseCasePack,
  check: RubricCheck,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  sourceTexts: SourceText[] = []
): string {
  const lines = [
    `You are checking an AI-generated ${artifact.runner} output made for ${pack.title}.`,
    "",
    `User request: ${fixture.question}`,
    "",
    `Check: ${check.question}`,
    "",
  ];
  if (check.evidence === "sources") {
    lines.push(
      "Source excerpts:",
      "(Excerpts may be truncated.)",
      sourceEvidence(artifact, sourceTexts) || "(no source excerpts recorded)",
      ""
    );
  }
  lines.push(
    "Output:",
    truncateOutput(artifact.answer),
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
  const results: MetricResult[] = [];
  for (const check of pack.rubric.filter((c) => c.appliesTo.includes(artifact.runner))) {
    const base = {
      metric: rubricMetricName(pack.id, check.id),
      caseId: fixture.id,
      runner: artifact.runner,
      configHash: artifact.configHash,
    };
    try {
      const raw = await options.invoke(
        buildRubricPrompt(pack, check, fixture, artifact, options.sourceTexts)
      );
      const { pass, reason } = parseBinaryResponse(raw);
      results.push({
        ...base,
        status: pass ? "pass" : "fail",
        score: pass ? 1 : 0,
        detail: reason,
        breakdown: { model: options.model, pass, check: check.question },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        ...base,
        status: "fail",
        score: 0,
        detail: `Rubric judge failed: ${message}`,
        breakdown: {
          model: options.model,
          judgeError: true,
          error: message,
          check: check.question,
        },
      });
    }
  }
  return results;
}
