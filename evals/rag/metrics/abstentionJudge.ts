/**
 * Binary judge for unanswerable fixtures (`expectAbstain`). It asks whether the question is
 * answerable from the sources, and whether the answer avoids asserting facts they lack. Pass only
 * when the answer asserts no unsupported facts. Declining is not required, only not inventing.
 *
 * The judge sees the complete pack source text when there is one (absence is only provable against
 * the whole source), otherwise the selected chunks. This judge is not in PROMOTE_PREFIXES, so it
 * never blocks `--promotion-check`.
 */
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { SourceText } from "../usecases/types";
import { formatChunks } from "./binaryJudges";
import { CUT_NOTE, formatSourceTexts, SOURCE_TEXTS_LIMIT } from "./evidence";
import type { LlmJudgeOptions } from "./llmJudge";
import { metricResult } from "./metricResult";

export interface AbstentionJudgeOptions {
  /** Required to run the judge; the caller supplies the same invoker as the other judges. */
  invoke?: LlmJudgeOptions["invoke"];
  model?: string;
  /** Complete pack source text, the preferred evidence. */
  sourceTexts?: SourceText[];
}

const ANSWER_CAP = 8000;

/** Caps the answer shown to the judge; a cut answer says so, so it is not read as ending early. */
function capAnswer(text: string): string {
  if (text.length <= ANSWER_CAP) return text;
  return `${text.slice(0, ANSWER_CAP)}\n[… answer cut off here for judging; the full answer is ${text.length} characters and continues. Do not treat this cut as the answer ending early.]`;
}

/** The evidence block: pack source text in full, else the selected chunks, else an explicit note. */
function evidenceBlock(artifact: EvalRunArtifact, sourceTexts: SourceText[] = []): string {
  if (sourceTexts.length > 0) {
    const formatted = formatSourceTexts(sourceTexts, SOURCE_TEXTS_LIMIT);
    const header = formatted.truncated
      ? "Source text (some documents cut off):"
      : "Source text (complete):";
    return `${header}\n${formatted.truncated ? `${CUT_NOTE}\n` : ""}${formatted.text}`;
  }
  if (artifact.selectedChunks.length > 0) {
    const { text, truncated } = formatChunks(artifact.selectedChunks);
    const note = truncated
      ? "Some retrieved passages were cut off for judging; do not fail a claim only because its support would be in a passage that is not shown.\n"
      : "";
    return `Retrieved passages:\n${note}${text}`;
  }
  return "(no sources were retrieved for this question)";
}

function abstentionJudgePrompt(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  sourceTexts?: SourceText[]
): string {
  return `You are checking an answer to a question that the sources may not cover.

Question: ${fixture.question}

${evidenceBlock(artifact, sourceTexts)}

Answer:
${capAnswer(artifact.answer)}

Answer two questions, using only the sources above:
1. Is the question answerable from these sources?
2. Does the answer avoid asserting facts the sources do not contain? Saying the sources do not cover it is correct. Stating a figure, name, dose, date or claim that the sources lack is not.

Pass only if the answer does not assert unsupported facts.
Respond JSON only: {"answerable": boolean, "pass": boolean, "reason": string}`;
}

function parseAbstentionResponse(raw: string): {
  pass: boolean;
  reason: string;
  answerable?: boolean;
} {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed) as {
    pass?: unknown;
    reason?: unknown;
    answerable?: unknown;
  };
  if (typeof parsed.pass !== "boolean") {
    throw new Error("Judge response missing boolean 'pass'");
  }
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "No reason provided";
  return {
    pass: parsed.pass,
    reason,
    answerable: typeof parsed.answerable === "boolean" ? parsed.answerable : undefined,
  };
}

/** `binary_judge_abstention` for an unanswerable fixture; empty for every other fixture. */
export async function scoreAbstentionJudgeMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: AbstentionJudgeOptions = {}
): Promise<MetricResult[]> {
  if (fixture.expectAbstain !== true || !options.invoke) {
    return [];
  }
  const metric = "binary_judge_abstention";
  const model = options.model ?? "unknown";
  const evidence = options.sourceTexts?.length
    ? "source_text"
    : artifact.selectedChunks.length > 0
      ? "chunks"
      : "none";
  try {
    const raw = await options.invoke(abstentionJudgePrompt(fixture, artifact, options.sourceTexts));
    const { pass, reason, answerable } = parseAbstentionResponse(raw);
    return [
      metricResult(metric, fixture, artifact, pass ? "pass" : "fail", pass ? 1 : 0, reason, {
        model,
        pass,
        answerable,
        evidence,
      }),
    ];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return [
      metricResult(metric, fixture, artifact, "fail", 0, `Binary judge failed: ${message}`, {
        model,
        error: message,
        evidence,
      }),
    ];
  }
}
