/**
 * Reference-free context relevance (D2): one judge call per chat artifact that has no gold.
 *
 * The judge sees each selected chunk and says which ids the answer needs. That gives a precision
 * of the selected context (needed / selected) and the tokens spent on chunks nobody needed. It
 * runs only where retrieval has no deterministic gold (expectedItems, expectedPassages).
 */
import { createHash } from "node:crypto";
import type { ChunkSnapshot, EvalFixture, EvalRunArtifact, MetricResult } from "../types";
import type { LlmJudgeOptions } from "./llmJudge";
import { metricResult } from "./metricResult";

/** Characters of each passage the judge reads: enough to tell what a passage is about. */
export const CONTEXT_RELEVANCE_CHUNK_CHARS = 600;

export interface ContextRelevanceOptions {
  invoke: NonNullable<LlmJudgeOptions["invoke"]>;
  model: string;
}

interface ContextRelevanceVerdict {
  needed: string[];
  unknownIds: string[];
  reason: string;
}

/** In-process only: a repeat of the same question over the same chunks does not pay again. */
const verdictCache = new Map<string, ContextRelevanceVerdict>();

export function clearContextRelevanceCache(): void {
  verdictCache.clear();
}

/** The text a judge reads for a chunk: the passage as the model was shown it. */
const passageText = (chunk: ChunkSnapshot): string => chunk.contextText ?? chunk.content;

function cacheKey(question: string, chunkIds: string[]): string {
  return createHash("sha1")
    .update(`${question}\n${chunkIds.join("\n")}`)
    .digest("hex");
}

function contextRelevancePrompt(question: string, chunks: ChunkSnapshot[]): string {
  const passages = chunks
    .map((c) => `[${c.id}] ${passageText(c).slice(0, CONTEXT_RELEVANCE_CHUNK_CHARS)}`)
    .join("\n\n");
  return `You are checking which retrieved passages a question needs.

Question: ${question}

Passages (each starts with its id in brackets):
${passages}

A passage is needed when the correct answer to the question depends on its content. Passages that
are only about the same topic, and that the answer does not depend on, are not needed.

Respond JSON only: {"needed": string[], "reason": string}, where "needed" lists the ids of the needed passages.`;
}

/**
 * Reads the judge's JSON. Throws when `needed` is not a list of strings, so a malformed reply is a
 * judge error rather than an empty verdict. Ids that were not among the selected chunks are
 * dropped and returned in `unknownIds`.
 */
export function parseContextRelevance(raw: string, validIds: string[]): ContextRelevanceVerdict {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : trimmed) as {
    needed?: unknown;
    reason?: unknown;
  };
  if (!Array.isArray(parsed.needed) || !parsed.needed.every((id) => typeof id === "string")) {
    throw new Error("Judge response missing 'needed' list of chunk ids");
  }
  const claimed = new Set(parsed.needed as string[]);
  const valid = new Set(validIds);
  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "No reason provided";
  return {
    needed: validIds.filter((id) => claimed.has(id)),
    unknownIds: [...claimed].filter((id) => !valid.has(id)),
    reason,
  };
}

function judgeErrorRows(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  model: string,
  message: string
): MetricResult[] {
  const breakdown = { judgeError: true, error: message, model };
  return [
    metricResult(
      "llm_context_precision",
      fixture,
      artifact,
      "warn",
      0,
      `Context relevance judge failed: ${message}`,
      breakdown
    ),
    metricResult(
      "llm_context_waste_tokens",
      fixture,
      artifact,
      "warn",
      0,
      `Context relevance judge failed: ${message}`,
      breakdown
    ),
  ];
}

/**
 * Context precision (needed / selected) and waste (estimated tokens of unneeded chunk text), both
 * info. Empty when the artifact is not chat, has no selected chunks, or the fixture has gold.
 */
export async function scoreContextRelevance(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: ContextRelevanceOptions
): Promise<MetricResult[]> {
  if (artifact.runner !== "chat") return [];
  if (artifact.selectedChunks.length === 0) return [];
  if (fixture.expectedItems.length > 0 || (fixture.expectedPassages?.length ?? 0) > 0) return [];

  const chunks = artifact.selectedChunks;
  const chunkIds = chunks.map((c) => c.id);
  const key = cacheKey(fixture.question, chunkIds);

  let verdict = verdictCache.get(key);
  if (!verdict) {
    try {
      const raw = await options.invoke(contextRelevancePrompt(fixture.question, chunks));
      verdict = parseContextRelevance(raw, chunkIds);
      verdictCache.set(key, verdict);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return judgeErrorRows(fixture, artifact, options.model, message);
    }
  }

  const needed = verdict.needed;
  const neededSet = new Set(needed);
  const unneeded = chunkIds.filter((id) => !neededSet.has(id));
  const unneededChars = chunks
    .filter((c) => !neededSet.has(c.id))
    .reduce((sum, c) => sum + passageText(c).length, 0);
  const precision = needed.length / chunkIds.length;

  return [
    metricResult(
      "llm_context_precision",
      fixture,
      artifact,
      "info",
      precision,
      `${needed.length}/${chunkIds.length} selected chunks are needed to answer (judge).`,
      {
        needed,
        unneeded,
        unknownIds: verdict.unknownIds,
        selected: chunkIds.length,
        reason: verdict.reason,
        model: options.model,
      }
    ),
    metricResult(
      "llm_context_waste_tokens",
      fixture,
      artifact,
      "info",
      Math.ceil(unneededChars / 4),
      `About ${Math.ceil(unneededChars / 4)} tokens of selected context were not needed (judge).`,
      { unneeded, unneededChars, model: options.model }
    ),
  ];
}
