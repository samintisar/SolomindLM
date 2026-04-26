"use node";
/**
 * Structured logging utility for LLM agent operations.
 *
 * Provides consistent, JSON-structured logging with timestamps,
 * correlation IDs, and context for production observability and debugging.
 */

/**
 * Job types supported by the logging system.
 */
export type JobType =
  | "report"
  | "flashcard"
  | "quiz"
  | "mindmap"
  | "audio"
  | "slides"
  | "spreadsheet"
  | "written_questions"
  | "document_embedding"
  /** Shared graph / node-builder paths without a Convex job document */
  | "agent_graph";

/**
 * Error types for classification.
 */
export type JobErrorType =
  | "llm_timeout"
  | "llm_error"
  | "embedding_failure"
  | "parsing_error"
  | "rate_limit"
  | "extraction_failure"
  | "storage_error"
  | "validation_error"
  | "unknown";

/**
 * Structured error metadata for database storage.
 */
export interface JobErrorMetadata {
  type: JobErrorType;
  phase: string;
  message: string;
  retryable: boolean;
  timestamp: number;
  stackTrace?: string;
}

/**
 * Log context interface for job logging.
 */
export interface JobLogContext {
  /** Job type identifier */
  jobType: JobType;
  /** Job document ID */
  jobId: string;
  /** Notebook ID (optional) */
  notebookId?: string;
  /** User ID (optional) */
  userId?: string;
}

/**
 * Internal log entry structure.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  jobType: JobType;
  jobId: string;
  phase: string;
  event: LogEvent;
  message?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  error?: {
    type: JobErrorType;
    message: string;
    retryable: boolean;
    stackTrace?: string;
  };
  correlationId?: string;
  notebookId?: string;
  userId?: string;
}

/**
 * Log level for filtering and categorization.
 */
export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

/**
 * Log event types for categorization.
 */
export type LogEvent =
  | "job_start"
  | "job_complete"
  | "job_error"
  | "phase_start"
  | "phase_complete"
  | "phase_error"
  | "phase_transition"
  | "info"
  | "warn";

/**
 * Generate a correlation ID for distributed tracing.
 */
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Classify error type from error object.
 */
export function classifyError(error: Error | unknown): JobErrorType {
  if (!(error instanceof Error)) {
    return "unknown";
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Timeout errors
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("524") ||
    message.includes("504")
  ) {
    return "llm_timeout";
  }

  // Rate limiting
  if (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests")
  ) {
    return "rate_limit";
  }

  // LLM errors
  if (
    name.includes("llm") ||
    message.includes("llm") ||
    message.includes("model") ||
    message.includes("openai") ||
    message.includes("together") ||
    message.includes("api key")
  ) {
    return "llm_error";
  }

  // Embedding errors
  if (
    message.includes("embedding") ||
    message.includes("vector") ||
    message.includes("dimension")
  ) {
    return "embedding_failure";
  }

  // Parsing errors
  if (
    name.includes("syntax") ||
    name.includes("parse") ||
    message.includes("json") ||
    message.includes("parse") ||
    message.includes("invalid") ||
    message.includes("malformed")
  ) {
    return "parsing_error";
  }

  // Extraction errors
  if (message.includes("ocr") || message.includes("extract") || message.includes("transcript")) {
    return "extraction_failure";
  }

  // Storage errors
  if (message.includes("storage") || message.includes("upload") || message.includes("download")) {
    return "storage_error";
  }

  // Validation errors
  if (
    name.includes("validation") ||
    name.includes("type") ||
    message.includes("invalid") ||
    message.includes("required")
  ) {
    return "validation_error";
  }

  return "unknown";
}

/**
 * Determine if an error is retryable.
 */
export function isRetryableError(errorType: JobErrorType): boolean {
  const retryableTypes: JobErrorType[] = [
    "llm_timeout",
    "rate_limit",
    "storage_error",
    "extraction_failure",
  ];
  return retryableTypes.includes(errorType);
}

/**
 * Create structured error metadata from an error.
 */
export function createErrorMetadata(error: Error | unknown, phase: string): JobErrorMetadata {
  const type = classifyError(error);
  const message = error instanceof Error ? error.message : String(error);

  // Truncate message to 500 chars for storage
  const truncatedMessage = message.length > 500 ? message.substring(0, 500) + "..." : message;

  // Get stack trace (first 5 lines)
  let stackTrace: string | undefined;
  if (error instanceof Error && error.stack) {
    stackTrace = error.stack.split("\n").slice(0, 5).join("\n");
  }

  return {
    type,
    phase,
    message: truncatedMessage,
    retryable: isRetryableError(type),
    timestamp: Date.now(),
    stackTrace,
  };
}

/**
 * Serialize log entry to JSON.
 */
function serializeLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Output log entry to console.
 */
function outputLog(entry: LogEntry): void {
  const json = serializeLogEntry(entry);

  switch (entry.level) {
    case LogLevel.ERROR:
      console.error(json);
      break;
    case LogLevel.WARN:
      console.warn(json);
      break;
    case LogLevel.DEBUG:
      console.debug(json);
      break;
    default:
      console.log(json);
  }
}

/**
 * Job Logger instance returned by createJobLogger.
 */
export interface JobLogger {
  /** Job context */
  context: JobLogContext;
  /** Correlation ID for this job */
  correlationId: string;

  /** Log job start */
  jobStart: (meta?: Record<string, unknown>) => void;
  /** Log job completion */
  jobComplete: (meta?: Record<string, unknown>) => void;
  /** Log job error */
  jobError: (error: Error | unknown, meta?: Record<string, unknown>) => void;

  /** Log phase start */
  phaseStart: (phase: string, meta?: Record<string, unknown>) => void;
  /** Log phase completion */
  phaseComplete: (phase: string, meta?: Record<string, unknown>) => void;
  /** Log phase error */
  phaseError: (phase: string, error: Error | unknown, meta?: Record<string, unknown>) => void;
  /** Log phase transition */
  phaseTransition: (fromPhase: string, toPhase: string, meta?: Record<string, unknown>) => void;

  /** Log info message */
  info: (message: string, meta?: Record<string, unknown>) => void;
  /** Log warning message */
  warn: (message: string, meta?: Record<string, unknown>) => void;
  /** Log error message (without phase context) */
  error: (message: string, error: Error | unknown, meta?: Record<string, unknown>) => void;
  /** Log debug message */
  debug: (message: string, meta?: Record<string, unknown>) => void;

  /** Create a timer for measuring duration */
  createTimer: () => { end: () => number };
  /** Create a child logger with additional context */
  child: (additionalContext: Partial<JobLogContext>) => JobLogger;
}

/**
 * Create a job logger with structured logging.
 *
 * @param context - Job context including jobType, jobId, notebookId, userId
 * @returns JobLogger instance with phase-aware logging methods
 *
 * @example
 * ```typescript
 * const logger = createJobLogger({
 *   jobType: 'report',
 *   jobId: reportId,
 *   notebookId,
 *   userId
 * });
 *
 * logger.jobStart({ docCount: documentIds.length });
 *
 * logger.phaseStart('document_retrieval');
 * const documents = await retrieveDocuments(ctx, documentIds);
 * logger.phaseComplete('document_retrieval', { chunkCount: 45 });
 *
 * logger.phaseStart('llm_generation', { model: 'gpt-oss-20b' });
 * try {
 *   const result = await generateWithLLM(prompt);
 *   logger.phaseComplete('llm_generation', { tokensUsed: usage });
 * } catch (error) {
 *   logger.phaseError('llm_generation', error, { retryCount: 2 });
 *   throw error;
 * }
 *
 * logger.jobComplete({ contentLength: content.length });
 * ```
 */
export function createJobLogger(context: JobLogContext): JobLogger {
  const correlationId = generateCorrelationId();

  const createEntry = (
    level: LogLevel,
    phase: string,
    event: LogEvent,
    message?: string,
    meta?: Record<string, unknown>,
    errorInfo?: LogEntry["error"]
  ): LogEntry => ({
    timestamp: new Date().toISOString(),
    level,
    jobType: context.jobType,
    jobId: context.jobId,
    phase,
    event,
    correlationId,
    notebookId: context.notebookId,
    userId: context.userId,
    ...(message && { message }),
    ...(meta && { metadata: meta }),
    ...(errorInfo && { error: errorInfo }),
  });

  return {
    context,
    correlationId,

    jobStart: (meta?: Record<string, unknown>) => {
      const entry = createEntry(
        LogLevel.INFO,
        "init",
        "job_start",
        `Starting ${context.jobType} job`,
        meta
      );
      outputLog(entry);
    },

    jobComplete: (meta?: Record<string, unknown>) => {
      const entry = createEntry(
        LogLevel.INFO,
        "complete",
        "job_complete",
        `${context.jobType} job completed successfully`,
        meta
      );
      outputLog(entry);
    },

    jobError: (error: Error | unknown, meta?: Record<string, unknown>) => {
      const errorMeta = createErrorMetadata(error, "job");
      const entry = createEntry(
        LogLevel.ERROR,
        "error",
        "job_error",
        `${context.jobType} job failed: ${errorMeta.message}`,
        meta,
        {
          type: errorMeta.type,
          message: errorMeta.message,
          retryable: errorMeta.retryable,
          stackTrace: errorMeta.stackTrace,
        }
      );
      outputLog(entry);
    },

    phaseStart: (phase: string, meta?: Record<string, unknown>) => {
      const entry = createEntry(
        LogLevel.INFO,
        phase,
        "phase_start",
        `Starting phase: ${phase}`,
        meta
      );
      outputLog(entry);
    },

    phaseComplete: (phase: string, meta?: Record<string, unknown>) => {
      const entry = createEntry(
        LogLevel.INFO,
        phase,
        "phase_complete",
        `Completed phase: ${phase}`,
        meta
      );
      outputLog(entry);
    },

    phaseError: (phase: string, error: Error | unknown, meta?: Record<string, unknown>) => {
      const errorMeta = createErrorMetadata(error, phase);
      const entry = createEntry(
        LogLevel.ERROR,
        phase,
        "phase_error",
        `Error in phase ${phase}: ${errorMeta.message}`,
        meta,
        {
          type: errorMeta.type,
          message: errorMeta.message,
          retryable: errorMeta.retryable,
          stackTrace: errorMeta.stackTrace,
        }
      );
      outputLog(entry);
    },

    phaseTransition: (fromPhase: string, toPhase: string, meta?: Record<string, unknown>) => {
      const entry = createEntry(
        LogLevel.INFO,
        toPhase,
        "phase_transition",
        `Transitioning from ${fromPhase} to ${toPhase}`,
        { fromPhase, toPhase, ...meta }
      );
      outputLog(entry);
    },

    info: (message: string, meta?: Record<string, unknown>) => {
      const entry = createEntry(LogLevel.INFO, "general", "info", message, meta);
      outputLog(entry);
    },

    warn: (message: string, meta?: Record<string, unknown>) => {
      const entry = createEntry(LogLevel.WARN, "general", "warn", message, meta);
      outputLog(entry);
    },

    error: (message: string, error: Error | unknown, meta?: Record<string, unknown>) => {
      const errorMeta = createErrorMetadata(error, "general");
      const entry = createEntry(LogLevel.ERROR, "general", "info", message, meta, {
        type: errorMeta.type,
        message: errorMeta.message,
        retryable: errorMeta.retryable,
        stackTrace: errorMeta.stackTrace,
      });
      outputLog(entry);
    },

    debug: (message: string, meta?: Record<string, unknown>) => {
      const isDebug = process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
      if (!isDebug) return;

      const entry = createEntry(LogLevel.DEBUG, "general", "info", message, meta);
      outputLog(entry);
    },

    createTimer: () => {
      const startTime = Date.now();
      return {
        end: () => Date.now() - startTime,
      };
    },

    child: (additionalContext: Partial<JobLogContext>) => {
      return createJobLogger({
        ...context,
        ...additionalContext,
      });
    },
  };
}

/**
 * Structured logger for LangGraph nodes when logs are not tied to a Convex job row.
 * `jobId` is set to `agentName` for searchability; pass a concrete `jobType` when the graph matches a studio artifact.
 */
export function createAgentGraphLogger(
  agentName: string,
  jobType: JobType = "agent_graph"
): JobLogger {
  return createJobLogger({ jobType, jobId: agentName });
}
