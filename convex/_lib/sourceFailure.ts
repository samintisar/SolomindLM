/**
 * Why a source failed to process, in words the user can act on. Stored on the document
 * (`metadata.userMessage`) and shown in the source viewer; the raw error stays in logs.
 */

/** A processing failure whose cause the user can understand and act on. */
export class UserFacingSourceError extends Error {
  readonly userMessage: string;

  /** `message` is the internal detail (kept for logs and retry classification). */
  constructor(userMessage: string, message = userMessage, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UserFacingSourceError";
    this.userMessage = userMessage;
  }
}

const BUSY_MESSAGE =
  "The service that reads this source was busy. Try again in a few minutes with Refresh, or re-add it.";
const GENERIC_MESSAGE = "Something went wrong while processing this source.";

/** The message to show for a failed source, given the error and its job error type. */
export function sourceFailureMessage(error: unknown, errorType: string): string {
  if (error instanceof UserFacingSourceError) return error.userMessage;
  if (errorType === "rate_limit" || errorType === "llm_timeout") return BUSY_MESSAGE;
  return GENERIC_MESSAGE;
}
