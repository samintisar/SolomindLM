/**
 * Expands a fixture with `variants` (alternative phrasings of its question) into the base plus one
 * artifact per paraphrase, ids `<id>--p1`, `<id>--p2`, ... Everything else is copied, so only the
 * question differs. Reports group these back to the base (reports/paraphrase.ts).
 */
import type { EvalFixture } from "../types";

export function withParaphrases(base: EvalFixture): EvalFixture[] {
  const paraphrases = (base.variants ?? []).map((question, index): EvalFixture => {
    if (!question.trim()) {
      throw new Error(`${base.id}: paraphrase ${index + 1} is empty`);
    }
    return {
      ...base,
      id: `${base.id}--p${index + 1}`,
      question,
      schemaVersion: base.schemaVersion + 1,
      variants: undefined,
      tags: [...base.tags, "paraphrase"],
    };
  });
  return [base, ...paraphrases];
}
