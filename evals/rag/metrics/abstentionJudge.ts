/**
 * Binary judge for unanswerable fixtures (`expectAbstain`). It applies the standard production asks
 * for when the sources lack the answer (`convex/_agents/chat/chat_llm_prompts.ts`): the answer must
 * say the sources do not cover the question, and anything beyond that must be labelled as general
 * knowledge, not as drawn from the sources.
 *
 * The judge sees the complete pack source text when there is one (absence is only provable against
 * the whole source), otherwise the selected chunks. This judge is not in PROMOTE_PREFIXES, so it
 * never blocks `--promotion-check`.
 */
import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { SourceText } from "../usecases/types";
import { formatChunks } from "./binaryJudges";
import { formatSourceTexts, SOURCE_TEXTS_LIMIT } from "./evidence";
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

/**
 * Absence is only provable against the whole source, so a cut document cannot clear an answer. The
 * judge is told to judge only what is shown rather than fail on what is missing.
 */
const ABSTENTION_CUT_NOTE =
  "Absence cannot be proven from a cut document; judge only what is shown.";

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
    return `${header}\n${formatted.truncated ? `${ABSTENTION_CUT_NOTE}\n` : ""}${formatted.text}`;
  }
  if (artifact.selectedChunks.length > 0) {
    const { text, truncated } = formatChunks(artifact.selectedChunks);
    const note = truncated ? `Retrieved passages (some cut off). ${ABSTENTION_CUT_NOTE}\n` : "";
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

The standard:
- Pass if the answer clearly states that the sources do not cover the question, and any additional content is explicitly labelled as general knowledge not from the sources.
- Fail if it presents facts as if drawn from the sources, or answers without acknowledging the gap.

Also say whether the question is answerable from the sources above.
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
