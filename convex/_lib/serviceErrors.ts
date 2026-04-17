import { ConvexError, type Value } from "convex/values";
import { ExternalServiceError, InputValidationError, StorageError } from "./errors";

/**
 * Map structured service errors to ConvexError for public API boundaries.
 * ConvexError constructor accepts a single serializable `data` payload.
 */
export function toConvexError(err: unknown): ConvexError<Value> {
  if (err instanceof ExternalServiceError) {
    return new ConvexError(err.data);
  }
  if (err instanceof StorageError) {
    return new ConvexError(err.data);
  }
  if (err instanceof InputValidationError) {
    return new ConvexError(err.data);
  }
  if (err instanceof Error) {
    throw err;
  }
  throw new Error(String(err));
}

export function isStructuredServiceError(
  err: unknown
): err is ExternalServiceError | StorageError | InputValidationError {
  return (
    err instanceof ExternalServiceError ||
    err instanceof StorageError ||
    err instanceof InputValidationError
  );
}
