"use node";

/**
 * Answer-key verification for generated quiz questions (#219).
 *
 * Each expanded question is checked against the source passage it was written
 * from (the candidate's `contextSnippet`): the keyed option must follow from the
 * passage, no other option may also be correct, and the explanation must agree.
 * The LLM call is injected (`judge`) so the batching and verdict mapping stay
 * testable; the job phase decides what to do with failed questions.
 */

import { z } from "zod";
import { allWithConcurrency } from "../_shared/concurrency.js";
import type { QuizQuestion } from "./prompts.js";

export const QuizVerificationSchema = z.object({
  verdicts: z
    .array(
      z.object({
        id: z.number().int().describe("The question number from its '### Question N' heading."),
        supported: z
          .boolean()
          .describe("True only if the question passes every check against its passage."),
        reason: z
          .string()
          .describe("One short sentence naming the problem when it fails; empty when it passes."),
      })
    )
    .describe("One verdict per question, in any order."),
});

export type QuizVerificationResponse = z.infer<typeof QuizVerificationSchema>;

export type VerifiableQuestion = {
  question: QuizQuestion;
  /** Source passage the question was generated from. */
  snippet: string;
};

export type QuestionVerification =
  | { status: "passed" }
  | { status: "failed"; reason: string }
  /** No verdict: the judge call failed, ran out of time, or skipped the question. */
  | { status: "unchecked"; reason?: string };

export const VERIFY_SYSTEM_PROMPT =
  "You are a meticulous exam reviewer. You check multiple-choice questions against the source passage each was written from, and you reject any question a careful student could fairly dispute. Questions and passages may be in any language; judge meaning, not wording, and write each reason in English.";

const OPTION_NUMBERS = ["(1)", "(2)", "(3)", "(4)"];

export function getVerificationPrompt(items: VerifiableQuestion[]): string {
  const blocks = items.map(({ question, snippet }, index) => {
    const options = question.options
      .map(
        (option, optionIndex) =>
          `${OPTION_NUMBERS[optionIndex] ?? `(${optionIndex + 1})`} ${option}`
      )
      .join("\n");
    const keyed = question.options[question.answer] ?? "";
    return `### Question ${index + 1}
Passage:
"""
${snippet}
"""
Question: ${question.question}
Options:
${options}
Keyed answer: ${OPTION_NUMBERS[question.answer] ?? `(${question.answer + 1})`} ${keyed}
Explanation: ${question.explanation}`;
  });

  return `Check each multiple-choice question below against its own passage. A question is supported only if ALL of these hold:
1. The keyed answer is correct according to the passage: the passage states it, or it follows directly from applying what the passage teaches.
2. No other option is also correct according to the passage.
3. The explanation agrees with the passage and with the keyed answer.

Mark a question unsupported if the passage contradicts the keyed answer, if the passage does not cover what the question asks, if two options are defensible, or if the explanation gives a reason the passage does not support. Do not use outside knowledge to rescue a question the passage does not back.

Return one verdict per question, using the number from its heading as the id.

${blocks.join("\n\n")}`;
}

export async function verifyQuizQuestions(
  items: VerifiableQuestion[],
  deps: {
    judge: (prompt: string) => Promise<QuizVerificationResponse>;
    batchSize?: number;
    concurrency?: number;
    onBatchError?: (error: unknown, batchIndex: number) => void;
  }
): Promise<QuestionVerification[]> {
  const batchSize = deps.batchSize ?? 8;
  const batches: VerifiableQuestion[][] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    batches.push(items.slice(start, start + batchSize));
  }

  const batchResults = await allWithConcurrency(
    batches.map((batch, batchIndex) => async (): Promise<QuestionVerification[]> => {
      try {
        const response = await deps.judge(getVerificationPrompt(batch));
        return batch.map((_, index) => {
          const verdict = response.verdicts.find((v) => v.id === index + 1);
          if (!verdict) {
            return { status: "unchecked", reason: "no verdict returned" };
          }
          return verdict.supported
            ? { status: "passed" }
            : { status: "failed", reason: verdict.reason || "not supported by the passage" };
        });
      } catch (error) {
        deps.onBatchError?.(error, batchIndex);
        return batch.map(() => ({ status: "unchecked", reason: "verification call failed" }));
      }
    }),
    deps.concurrency ?? 4
  );

  return batchResults.flat();
}

/** Up to `count` items spread evenly across `pool`, so a refill does not favour the first sources. */
export function pickSpread<T>(pool: T[], count: number): T[] {
  if (count <= 0) {
    return [];
  }
  if (count >= pool.length) {
    return [...pool];
  }
  const step = pool.length / count;
  return Array.from({ length: count }, (_, i) => pool[Math.floor(i * step)]);
}
