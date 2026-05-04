import { v } from "convex/values";
import { type JobErrorType } from "../../_agents/_shared/logging";

/**
 * Standard error metadata interface for job failures.
 */
export const jobErrorMetadataValidator = v.object({
  type: v.string(),
  phase: v.string(),
  message: v.string(),
  retryable: v.boolean(),
  timestamp: v.number(),
  stackTrace: v.optional(v.string()),
});

/**
 * Build enhanced error metadata for database storage.
 */
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildErrorMetadata(error: string, phase: string, metadata?: any): any {
  if (metadata?.errorType && metadata?.errorPhase) {
    return {
      error: {
        type: metadata.errorType,
        phase: metadata.errorPhase,
        message: error.length > 500 ? error.substring(0, 500) + "..." : error,
        retryable: metadata.retryable ?? false,
        timestamp: metadata.failedAt ?? Date.now(),
        stackTrace: metadata.stack,
      },
      failedAt: metadata.failedAt ?? Date.now(),
      phase: "failed",
    };
  }

  const errorType = metadata?.isTimeout ? "llm_timeout" : classifyErrorFromMessage(error);
  const retryable = isRetryableFromType(errorType);

  return {
    error: {
      type: errorType,
      phase: phase || metadata?.errorPhase || metadata?.phase || "unknown",
      message: error.length > 500 ? error.substring(0, 500) + "..." : error,
      retryable,
      timestamp: Date.now(),
      stackTrace: metadata?.stack,
    },
    failedAt: Date.now(),
    phase: "failed",
    errorPhase: phase || metadata?.phase || "unknown",
    isTimeout: metadata?.isTimeout ?? errorType === "llm_timeout",
    errorName: metadata?.errorName ?? "Error",
  };
}

function classifyErrorFromMessage(message: string): JobErrorType {
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("524")) {
    return "llm_timeout";
  }
  if (lower.includes("rate limit") || lower.includes("429")) {
    return "rate_limit";
  }
  if (lower.includes("embedding") || lower.includes("vector")) {
    return "embedding_failure";
  }
  if (lower.includes("parse") || lower.includes("json") || lower.includes("invalid")) {
    return "parsing_error";
  }
  if (lower.includes("ocr") || lower.includes("extract") || lower.includes("transcript")) {
    return "extraction_failure";
  }
  if (lower.includes("storage") || lower.includes("upload")) {
    return "storage_error";
  }

  return "unknown";
}

function isRetryableFromType(type: JobErrorType): boolean {
  return ["llm_timeout", "rate_limit", "storage_error", "extraction_failure"].includes(type);
}
