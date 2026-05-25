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

/** Truncate text for prompt context budget. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...";
}

const CORRECTNESS_PROMPT = (opts: {
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  retrievedContext: string;
}) => `You are an expert RAG evaluator. Compare the actual answer to the expected answer.

**Question:** ${opts.question}

**Expected Answer:**
${truncate(opts.expectedAnswer, 2000)}

**Actual Answer:**
${truncate(opts.actualAnswer, 3000)}

**Retrieved Context:**
${truncate(opts.retrievedContext, 2000)}

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
${truncate(opts.answer, 3000)}

**Retrieved Context (the ONLY source you should verify against):**
${truncate(opts.retrievedContext, 3000)}

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
${truncate(opts.answer, 3000)}

**Expected Behavior:**
${opts.expectedBehavior}

**Retrieved Context:**
${truncate(opts.retrievedContext, 2000)}

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

/**
 * Parse JSON from LLM response with fallback.
 * LLMs sometimes wrap JSON in markdown code blocks.
 */
function parseJsonResponse(response: string): unknown {
  const cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/gi, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Return a safe fallback
      }
    }
    return {
      score: 0.5,
      reasoning: "Failed to parse LLM response",
      hallucinations: [],
      missing: [],
    };
  }
}

import { createTogetherClient } from "./togetherLlmJudge";

// ─── Default LLM Invocation ───────────────────────────────────────

/**
 * Default LLM invocation - uses Together AI.
 * Provide an explicit `invoke` function in LlmJudgeOptions for custom behavior.
 */
async function defaultLlmInvoke(
  prompt: string,
  model: string = "openai/gpt-oss-20b"
): Promise<string> {
  const client = createTogetherClient({ model });
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an expert RAG evaluator. Respond only with valid JSON. " +
          "Do not include markdown code blocks or additional text.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1024,
    temperature: 0.1,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM judge");
  return content;
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

    const result = parseJsonResponse(response) as {
      score?: number;
      reasoning?: string;
      hallucinations?: string[];
      missing?: string[];
    };

    const score = result.score ?? 0.5;
    const status = statusFromScore(score);

    let detail = result.reasoning ?? "No reasoning provided";
    if (result.missing?.length) {
      detail += `\nMissing: ${result.missing.join(", ")}`;
    }
    if (result.hallucinations?.length) {
      detail += `\nHallucinations: ${result.hallucinations.join(", ")}`;
    }

    return baseMetric("llm_judge_correctness", fixture, artifact, status, score, detail, {
      model,
      hallucinations: result.hallucinations ?? [],
      missing: result.missing ?? [],
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

    const result = parseJsonResponse(response) as {
      score?: number;
      reasoning?: string;
      hallucinations?: string[];
      supported_claims?: string[];
    };

    const score = result.score ?? 0.5;
    const status = statusFromScore(score);

    let detail = result.reasoning ?? "No reasoning provided";
    if (result.hallucinations?.length) {
      detail += `\nUnsupported claims: ${result.hallucinations.join(", ")}`;
    }

    return baseMetric("llm_judge_faithfulness", fixture, artifact, status, score, detail, {
      model,
      hallucinations: result.hallucinations ?? [],
      supportedClaims: result.supported_claims?.length ?? 0,
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

    const result = parseJsonResponse(response) as {
      score?: number;
      reasoning?: string;
      missing_aspects?: string[];
    };

    const score = result.score ?? 0.5;
    const status = statusFromScore(score);

    let detail = result.reasoning ?? "No reasoning provided";
    if (result.missing_aspects?.length) {
      detail += `\nMissing aspects: ${result.missing_aspects.join(", ")}`;
    }

    return baseMetric("llm_judge_completeness", fixture, artifact, status, score, detail, {
      model,
      missingAspects: result.missing_aspects ?? [],
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
export type { LlmJudgeOptions, JudgeResult };
