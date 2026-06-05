/**
 * LLM-as-a-judge metrics for RAG evaluation.
 *
 * These metrics use an LLM to evaluate answer quality when deterministic
 * expectedItem matching is insufficient (e.g., prose explanations,
 * comparisons, multi-hop reasoning).
 */

import type { EvalFixture, EvalRunArtifact, MetricResult } from "../types";

// ─── Types ─────────────────────────────────────────────────────────

export interface LlmJudgeOptions {
  /** LLM to use for judging (default: openai/gpt-oss-20b) */
  model?: string;
  /** Optional custom LLM invocation function */
  invoke?: (prompt: string) => Promise<string>;
}

export interface JudgeResult {
  score: number; // 0-1
  reasoning: string;
  status: "pass" | "warn" | "fail";
}

// ─── Prompts ───────────────────────────────────────────────────────

const CORRECTNESS_PROMPT = (opts: {
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  retrievedContext: string;
}) => `You are an expert RAG evaluator. Compare the actual answer to the expected answer.

**Question:** ${opts.question}

**Expected Answer:**
${opts.expectedAnswer}

**Actual Answer:**
${opts.actualAnswer}

**Retrieved Context:**
${opts.retrievedContext.slice(0, 3000)}${opts.retrievedContext.length > 3000 ? "..." : ""}

Evaluate on:
1. **Correctness**: Is the factual information accurate?
2. **Completeness**: Does it cover the key points from the expected answer?
3. **Faithfulness**: Does it stick to the retrieved context or hallucinate?

Respond in JSON:
{
  "score": <0.0 to 1.0>,
  "reasoning": "<brief explanation>",
  "hallucinations": ["any claims not supported by context"],
  "missing": ["key points from expected answer not covered"]
}`;

const FAITHFULNESS_PROMPT = (opts: {
  question: string;
  answer: string;
  retrievedContext: string;
}) => `You are a fact-checker. Identify hallucinations in the answer.

**Question:** ${opts.question}

**Answer:**
${opts.answer}

**Retrieved Context (the ONLY source you should verify against):**
${opts.retrievedContext}

For each claim in the answer, check if it's supported by the context.
Ignore general knowledge that wasn't asked about.

Respond in JSON:
{
  "score": <0.0 to 1.0, proportion of answer supported by context>,
  "reasoning": "<brief explanation>",
  "hallucinations": ["specific unsupported claims"],
  "supported_claims": ["claims that are well-supported"]
}`;

const COMPLETENESS_PROMPT = (opts: {
  question: string;
  answer: string;
  expectedBehavior: string;
  retrievedContext: string;
}) => `You are evaluating answer completeness for a RAG system.

**Question:** ${opts.question}

**Answer:**
${opts.answer}

**Expected Behavior:**
${opts.expectedBehavior}

**Retrieved Context:**
${opts.retrievedContext.slice(0, 3000)}${opts.retrievedContext.length > 3000 ? "..." : ""}

Did the answer fully address the expected behavior?
Check for:
- Missing key information
- Incomplete explanations
- Unaddressed parts of the question

Respond in JSON:
{
  "score": <0.0 to 1.0>,
  "reasoning": "<brief explanation>",
  "missing_aspects": ["what should have been included but wasn't"]
}`;

// ─── Helpers ───────────────────────────────────────────────────────

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: "pass" | "warn" | "fail",
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

function statusFromScore(score: number): "pass" | "warn" | "fail" {
  if (score >= 0.8) return "pass";
  if (score >= 0.6) return "warn";
  return "fail";
}

function combineChunkContents(chunks: Array<{ content: string }>): string {
  return chunks.map((c) => c.content).join("\n\n---\n\n");
}

/** Thrown when judge LLM output cannot be parsed into a score object. */
export class LlmJudgeParseError extends Error {
  readonly responsePreview: string;

  constructor(message: string, responsePreview: string) {
    super(message);
    this.name = "LlmJudgeParseError";
    this.responsePreview = responsePreview;
  }
}

function previewResponse(text: string, maxLen = 200): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLen ? oneLine : `${oneLine.slice(0, maxLen)}…`;
}

/**
 * Parse JSON from LLM judge output. LLMs sometimes wrap JSON in markdown code blocks.
 * Throws {@link LlmJudgeParseError} on failure (callers should mark the metric as fail, not warn/pass).
 */
export function parseJsonResponse(response: string): Record<string, unknown> {
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gi, "")
    .trim();

  const tryParseObject = (raw: string): Record<string, unknown> | null => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // try next strategy
    }
    return null;
  };

  const direct = tryParseObject(cleaned);
  if (direct) return direct;

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    const extracted = tryParseObject(match[0]);
    if (extracted) return extracted;
  }

  throw new LlmJudgeParseError(
    "Failed to parse LLM judge response as JSON object",
    previewResponse(cleaned)
  );
}

export function requireJudgeScore(result: Record<string, unknown>): number {
  const score = result.score;
  if (typeof score !== "number" || Number.isNaN(score)) {
    throw new LlmJudgeParseError(
      "Judge response missing numeric score field",
      previewResponse(JSON.stringify(result))
    );
  }
  if (score < 0 || score > 1) {
    throw new LlmJudgeParseError(
      `Judge score must be between 0 and 1 (got ${score})`,
      previewResponse(JSON.stringify(result))
    );
  }
  return score;
}

// ─── Default LLM Invocation ───────────────────────────────────────

/**
 * Default LLM invocation - attempts to use Together AI if available.
 * Provide an explicit `invoke` function in LlmJudgeOptions for custom behavior.
 */
async function defaultLlmInvoke(
  prompt: string,
  model: string = "openai/gpt-oss-20b"
): Promise<string> {
  // Try to use Together AI via dynamic import (for eval scripts outside Convex)
  try {
    const { createTogetherJudgeInvoker } = await import("./togetherLlmJudge");
    const invoke = createTogetherJudgeInvoker({ model });
    return await invoke(prompt);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `LLM judge integration not available: ${detail}. Provide an \`invoke\` function in LlmJudgeOptions ` +
        "or ensure TOGETHER_AI_API_KEY is set."
    );
  }
}

// ─── Metrics ───────────────────────────────────────────────────────

/**
 * LLM-judge metric for overall answer correctness.
 * Compares actual answer to expected answer using semantic understanding.
 *
 * Requires: fixture.expectedAnswer to be set.
 */
export async function llmJudgeCorrectness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: LlmJudgeOptions = {}
): Promise<MetricResult> {
  if (!fixture.expectedAnswer) {
    return baseMetric(
      "llm_judge_correctness",
      fixture,
      artifact,
      "info",
      0,
      "Skipped: fixture.expectedAnswer not set. Use expectedItemRecall for list-based fixtures."
    );
  }

  const invoke = options.invoke ?? defaultLlmInvoke;
  const model = options.model ?? "openai/gpt-oss-20b";
  const retrievedContext = combineChunkContents(artifact.selectedChunks);

  try {
    const response = await invoke(
      CORRECTNESS_PROMPT({
        question: fixture.question,
        expectedAnswer: fixture.expectedAnswer,
        actualAnswer: artifact.answer,
        retrievedContext,
      })
    );

    const result = parseJsonResponse(response);
    const score = requireJudgeScore(result);
    const status = statusFromScore(score);

    const reasoning =
      typeof result.reasoning === "string" ? result.reasoning : "No reasoning provided";
    const missing = Array.isArray(result.missing)
      ? result.missing.filter((m): m is string => typeof m === "string")
      : [];
    const hallucinations = Array.isArray(result.hallucinations)
      ? result.hallucinations.filter((h): h is string => typeof h === "string")
      : [];

    let detail = reasoning;
    if (missing.length) {
      detail += `\nMissing: ${missing.join(", ")}`;
    }
    if (hallucinations.length) {
      detail += `\nHallucinations: ${hallucinations.join(", ")}`;
    }

    return baseMetric("llm_judge_correctness", fixture, artifact, status, score, detail, {
      model,
      hallucinations,
      missing,
    });
  } catch (err) {
    return baseMetric(
      "llm_judge_correctness",
      fixture,
      artifact,
      "fail",
      0,
      `LLM judge failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * LLM-judge metric for answer faithfulness.
 * Checks whether the answer is supported by retrieved context.
 *
 * Does not require fixture.expectedAnswer — evaluates against context alone.
 */
export async function llmJudgeFaithfulness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: LlmJudgeOptions = {}
): Promise<MetricResult> {
  const invoke = options.invoke ?? defaultLlmInvoke;
  const model = options.model ?? "openai/gpt-oss-20b";
  const retrievedContext = combineChunkContents(artifact.selectedChunks);

  if (retrievedContext.length < 50) {
    return baseMetric(
      "llm_judge_faithfulness",
      fixture,
      artifact,
      "info",
      0,
      "Skipped: insufficient retrieved context to evaluate faithfulness."
    );
  }

  try {
    const response = await invoke(
      FAITHFULNESS_PROMPT({
        question: fixture.question,
        answer: artifact.answer,
        retrievedContext,
      })
    );

    const result = parseJsonResponse(response);
    const score = requireJudgeScore(result);
    const status = statusFromScore(score);

    const reasoning =
      typeof result.reasoning === "string" ? result.reasoning : "No reasoning provided";
    const hallucinations = Array.isArray(result.hallucinations)
      ? result.hallucinations.filter((h): h is string => typeof h === "string")
      : [];
    const supportedClaims = Array.isArray(result.supported_claims)
      ? result.supported_claims.filter((c): c is string => typeof c === "string")
      : [];

    let detail = reasoning;
    if (hallucinations.length) {
      detail += `\nUnsupported claims: ${hallucinations.join(", ")}`;
    }

    return baseMetric("llm_judge_faithfulness", fixture, artifact, status, score, detail, {
      model,
      hallucinations,
      supportedClaims: supportedClaims.length,
    });
  } catch (err) {
    return baseMetric(
      "llm_judge_faithfulness",
      fixture,
      artifact,
      "fail",
      0,
      `LLM judge failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * LLM-judge metric for answer completeness.
 * Checks whether the answer fully addresses the expected behavior.
 *
 * Uses fixture.expectedBehavior as the completeness criterion.
 */
export async function llmJudgeCompleteness(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: LlmJudgeOptions = {}
): Promise<MetricResult> {
  const invoke = options.invoke ?? defaultLlmInvoke;
  const model = options.model ?? "openai/gpt-oss-20b";
  const retrievedContext = combineChunkContents(artifact.selectedChunks);

  try {
    const response = await invoke(
      COMPLETENESS_PROMPT({
        question: fixture.question,
        answer: artifact.answer,
        expectedBehavior: fixture.expectedBehavior,
        retrievedContext,
      })
    );

    const result = parseJsonResponse(response);
    const score = requireJudgeScore(result);
    const status = statusFromScore(score);

    const reasoning =
      typeof result.reasoning === "string" ? result.reasoning : "No reasoning provided";
    const missingAspects = Array.isArray(result.missing_aspects)
      ? result.missing_aspects.filter((m): m is string => typeof m === "string")
      : [];

    let detail = reasoning;
    if (missingAspects.length) {
      detail += `\nMissing aspects: ${missingAspects.join(", ")}`;
    }

    return baseMetric("llm_judge_completeness", fixture, artifact, status, score, detail, {
      model,
      missingAspects,
    });
  } catch (err) {
    return baseMetric(
      "llm_judge_completeness",
      fixture,
      artifact,
      "fail",
      0,
      `LLM judge failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Run all LLM judge metrics for a single fixture/artifact pair.
 */
export async function scoreAllLlmJudgeMetrics(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  options: LlmJudgeOptions = {}
): Promise<MetricResult[]> {
  const results: MetricResult[] = [];

  // Only run if expectedAnswer is set (otherwise LLM judge has nothing to compare to)
  if (fixture.expectedAnswer) {
    results.push(await llmJudgeCorrectness(fixture, artifact, options));
  }

  // Faithfulness and completeness don't require expectedAnswer
  results.push(await llmJudgeFaithfulness(fixture, artifact, options));
  results.push(await llmJudgeCompleteness(fixture, artifact, options));

  return results;
}

// Re-export types
export type { JudgeResult, LlmJudgeOptions };
