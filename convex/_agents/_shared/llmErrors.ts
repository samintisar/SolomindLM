/**
 * Typed errors for plain-text LLM calls. Kept free of Convex / Node imports so pure modules
 * (parsers, retry loops) can recognise them.
 */

/**
 * The provider returned a completion with no assistant text. Hybrid reasoning models do this when
 * `finish_reason` is `"length"`: the whole output budget went to reasoning before any answer.
 */
export class EmptyLlmResponseError extends Error {
  readonly model: string;
  readonly finishReason?: string;
  readonly completionTokens?: number;

  constructor(details: { model: string; finishReason?: string; completionTokens?: number }) {
    const parts = [
      details.finishReason ? `finish_reason=${details.finishReason}` : undefined,
      details.completionTokens !== undefined
        ? `completion_tokens=${details.completionTokens}`
        : undefined,
    ].filter(Boolean);
    super(`LLM returned empty text response${parts.length ? ` (${parts.join(", ")})` : ""}`);
    this.name = "EmptyLlmResponseError";
    this.model = details.model;
    this.finishReason = details.finishReason;
    this.completionTokens = details.completionTokens;
  }
}
