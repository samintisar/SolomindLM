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
    // Keep numbers out of the message: `isRetryableError` substring-matches status codes like
    // "500" / "429", so a token count there would change retry behaviour. Counts live on fields.
    super(
      `LLM returned empty text response${details.finishReason ? ` (finish_reason=${details.finishReason})` : ""}`
    );
    this.name = "EmptyLlmResponseError";
    this.model = details.model;
    this.finishReason = details.finishReason;
    this.completionTokens = details.completionTokens;
  }
}

/**
 * A structured (`json_schema` / `json_object`) request came back without a JSON payload. With
 * `finishReason` `"length"` and reasoning on, the model spent the budget thinking before it wrote
 * the object. The message stays fixed because callers match it as text.
 */
export class MissingStructuredJsonError extends Error {
  readonly model: string;
  readonly finishReason?: string;
  /** Tokens the failed call still used, so callers can count them. */
  readonly usage?: { promptTokens: number; completionTokens: number; totalTokens: number };

  constructor(details: {
    model: string;
    finishReason?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }) {
    super("LLM API returned no JSON payload for structured response");
    this.name = "MissingStructuredJsonError";
    this.model = details.model;
    this.finishReason = details.finishReason;
    this.usage = details.usage;
  }
}
