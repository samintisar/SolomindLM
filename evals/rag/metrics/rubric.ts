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

/** Long enough for a full report or a many-row spreadsheet, so the judge sees every row. */
const OUTPUT_LIMIT = 40_000;
/**
 * Whole-pack source text: fits every current pack in full (the largest, Researchers, is about
 * 226K characters, roughly 60K tokens). A judge that sees only part of a paper fails values that
 * are in the part it never saw.
 */
const SOURCE_TEXTS_LIMIT = 240_000;
const CUT_NOTE =
  "Do not fail the check only because a value is missing from a document that was cut off.";

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
}

export function rubricMetricName(packId: string, checkId: string): string {
  return `rubric:${packId}:${checkId}`;
}

/**
 * Split `limit` chars evenly across documents; budget a short document leaves unused goes to the
 * rest. A document that is cut says how much of it is shown.
 */
export function formatSourceTexts(
  texts: SourceText[],
  limit: number
): { text: string; truncated: boolean } {
  if (texts.length === 0) return { text: "", truncated: false };
  const budgets = new Array<number>(texts.length);
  let remaining = limit;
  const shortestFirst = texts
    .map((_, i) => i)
    .sort((a, b) => texts[a].text.length - texts[b].text.length);
  shortestFirst.forEach((i, done) => {
    budgets[i] = Math.min(texts[i].text.length, Math.floor(remaining / (texts.length - done)));
    remaining -= budgets[i];
  });
  const text = texts
    .map((t, i) => {
      const cut = budgets[i] < t.text.length;
      const label = cut ? ` (first ${budgets[i]} of ${t.text.length} characters shown)` : "";
      return `[${t.fileName}]${label}\n${t.text.slice(0, budgets[i])}`;
    })
    .join("\n\n---\n\n");
  return { text, truncated: budgets.some((b, i) => b < texts[i].text.length) };
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
  const lines = [
    `You are checking an AI-generated ${artifact.runner} output made for ${pack.title}.`,
    "",
    `User request: ${fixture.question}`,
    "",
    `Check: ${check.question}`,
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
      // No verdict: a warning, so a flaky judge does not fail the run (scorecard counts it apart).
      results.push({
        ...base,
        status: "warn",
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
