/**
 * Structured logging utility for LLM agent operations.
 *
 * Provides consistent, JSON-structured logging with timestamps
 * and context for production observability and debugging.
 */

/**
 * Log context interface.
 * All logs include agent name, phase, and timestamp.
 * Additional context can be added via index signature.
 */
export interface LogContext {
  /** Agent name (e.g., 'ReportGraph', 'FlashcardGraph') */
  agent: string;
  /** Operation phase (e.g., 'map_process', 'reduce', 'collapse') */
  phase: string;
  /** ISO 8601 timestamp (auto-generated if not provided) */
  timestamp?: string;
  /** Additional context properties */
  [key: string]: any;
}

/**
 * Log level for filtering and categorization.
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

/**
 * Creates a log entry with timestamp and consistent structure.
 *
 * @param context - Log context
 * @param level - Log level
 * @param message - Optional message
 * @returns Formatted log entry object
 */
function createLogEntry(
  context: LogContext,
  level: LogLevel,
  message?: string
): Record<string, any> {
  return {
    timestamp: context.timestamp || new Date().toISOString(),
    level,
    agent: context.agent,
    phase: context.phase,
    ...Object.fromEntries(
      Object.entries(context).filter(([key]) => !['agent', 'phase', 'timestamp'].includes(key))
    ),
    ...(message && { message }),
  };
}

/**
 * Logs an informational message.
 *
 * @param context - Log context
 * @param message - Optional message
 *
 * @example
 * ```typescript
 * logInfo({
 *   agent: 'FlashcardGraph',
 *   phase: 'map_process',
 *   chunkIndex: 5,
 *   chunkLength: 15000
 * }, 'Processing chunk');
 * ```
 */
export function logInfo(context: LogContext, message?: string): void {
  const entry = createLogEntry(context, LogLevel.INFO, message);
  console.log(JSON.stringify(entry));
}

/**
 * Logs a warning message.
 *
 * @param context - Log context
 * @param message - Optional message
 *
 * @example
 * ```typescript
 * logWarn({
 *   agent: 'QuizGraph',
 *   phase: 'reduce',
 *   questionCount: 8
 * }, 'Generated fewer questions than target');
 * ```
 */
export function logWarn(context: LogContext, message?: string): void {
  const entry = createLogEntry(context, LogLevel.WARN, message);
  console.warn(JSON.stringify(entry));
}

/**
 * Logs an error message with error details.
 *
 * @param context - Log context (can include error or string error)
 * @param error - Error object or string message
 *
 * @example
 * ```typescript
 * logError({
 *   agent: 'FlashcardGraph',
 *   phase: 'map_process',
 *   chunkIndex: 3
 * }, new Error('LLM timeout'));
 * ```
 */
export function logError(context: LogContext, error: Error | string): void {
  const errorDetails =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines
        }
      : { message: error };

  const entry = createLogEntry(context, LogLevel.ERROR);
  console.error(JSON.stringify({ ...entry, error: errorDetails }));
}

/**
 * Logs a debug message (only in development/debug mode).
 *
 * @param context - Log context
 * @param message - Optional message
 *
 * @example
 * ```typescript
 * logDebug({
 *   agent: 'MindMapGraph',
 *   phase: 'parse_tree',
 *   treeDepth: 5
 * }, 'Parsed tree structure');
 * ```
 */
export function logDebug(context: LogContext, message?: string): void {
  const isDebug = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
  if (isDebug) {
    const entry = createLogEntry(context, LogLevel.DEBUG, message);
    console.debug(JSON.stringify(entry));
  }
}

/**
 * Logs the start of a phase with visual separator.
 *
 * @param context - Log context
 *
 * @example
 * ```typescript
 * logPhaseStart({
 *   agent: 'FlashcardGraph',
 *   phase: 'map_process',
 *   chunkIndex: 1
 * });
 * // Output: ===== MAP_PROCESS PHASE =====
 * ```
 */
export function logPhaseStart(context: LogContext): void {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${context.agent}] ===== ${context.phase.toUpperCase().replace(/_/g, ' ')} =====`);
  console.log('='.repeat(80));

  const entry = createLogEntry(context, LogLevel.INFO);
  console.log(JSON.stringify(entry));
}

/**
 * Logs the completion of a phase with timing and results.
 *
 * @param context - Log context (should include processingTimeMs if timing is needed)
 * @param result - Optional result data to include in log
 *
 * @example
 * ```typescript
 * logPhaseComplete({
 *   agent: 'FlashcardGraph',
 *   phase: 'map_process',
 *   chunkIndex: 1,
 *   processingTimeMs: 1250,
 *   cardsGenerated: 5
 * });
 * ```
 */
export function logPhaseComplete(context: LogContext, result?: any): void {
  const entry = createLogEntry(
    context,
    LogLevel.INFO,
    result ? `Completed in ${context.processingTimeMs}ms` : 'Completed'
  );

  if (result) {
    console.log(JSON.stringify({ ...entry, result }));
  } else {
    console.log(JSON.stringify(entry));
  }
}

/**
 * Logs a phase transition between operations.
 *
 * @param fromPhase - Source phase
 * @param toPhase - Destination phase
 * @param context - Log context
 *
 * @example
 * ```typescript
 * logPhaseTransition('map_process', 'collapse', {
 *   agent: 'FlashcardGraph',
 *   mapOutputsCount: 10
 * });
 * ```
 */
export function logPhaseTransition(
  fromPhase: string,
  toPhase: string,
  context: Omit<LogContext, 'phase'>
): void {
  logInfo({
    agent: context.agent,
    phase: 'transition',
    fromPhase,
    toPhase,
    timestamp: context.timestamp,
  });
}

/**
 * Creates a performance timer for measuring operation duration.
 *
 * @returns Timer object with start/end methods
 *
 * @example
 * ```typescript
 * const timer = createTimer();
 * // ... do work ...
 * const elapsed = timer.end();
 * logInfo({ agent: 'FlashcardGraph', phase: 'test', processingTimeMs: elapsed });
 * ```
 */
export function createTimer(): {
  end: () => number;
} {
  const startTime = Date.now();

  return {
    end: () => Date.now() - startTime,
  };
}

/**
 * Logs with a visual separator banner for important events.
 *
 * @param context - Log context
 * @param title - Banner title
 * @param style - Banner style character (default: '=')
 *
 * @example
 * ```typescript
 * logBanner({
 *   agent: 'FlashcardGraph',
 *   phase: 'generation_complete'
 * }, 'GENERATION COMPLETE', '=');
 * ```
 */
export function logBanner(context: LogContext, title: string, style: string = '='): void {
  const bannerLine = style.repeat(80);
  console.log(`\n${bannerLine}`);
  console.log(`[${context.agent}] ===== ${title} =====`);
  console.log(bannerLine);

  const entry = createLogEntry(context, LogLevel.INFO);
  console.log(JSON.stringify(entry));
}

/**
 * Creates a child logger with preset context.
 * Useful for creating phase-specific loggers.
 *
 * @param parentContext - Parent context to inherit
 * @returns Child logger functions with preset context
 *
 * @example
 * ```typescript
 * const mapLogger = createChildLogger({ agent: 'FlashcardGraph', phase: 'map_process' });
 * mapLogger.info({ chunkIndex: 5 }, 'Processing chunk');
 * // Output includes agent, phase, chunkIndex
 * ```
 */
export function createChildLogger(
  parentContext: Omit<LogContext, 'timestamp'>
): {
  info: (additionalContext: Partial<LogContext>, message?: string) => void;
  warn: (additionalContext: Partial<LogContext>, message?: string) => void;
  error: (additionalContext: Partial<LogContext>, error: Error | string) => void;
  debug: (additionalContext: Partial<LogContext>, message?: string) => void;
} {
  return {
    info: (additionalContext: Partial<LogContext> = {}, message?: string) => {
      logInfo({ ...parentContext, ...additionalContext } as LogContext, message);
    },
    warn: (additionalContext: Partial<LogContext> = {}, message?: string) => {
      logWarn({ ...parentContext, ...additionalContext } as LogContext, message);
    },
    error: (additionalContext: Partial<LogContext> = {}, error: Error | string) => {
      logError({ ...parentContext, ...additionalContext } as LogContext, error);
    },
    debug: (additionalContext: Partial<LogContext> = {}, message?: string) => {
      logDebug({ ...parentContext, ...additionalContext } as LogContext, message);
    },
  };
}

/**
 * Batch logs multiple entries as a single JSON array.
 * Useful for structured logging systems.
 *
 * @param entries - Array of log contexts
 * @param level - Log level for all entries
 *
 * @example
 * ```typescript
 * logBatch([
 *   { agent: 'FlashcardGraph', phase: 'chunk_1', processingTimeMs: 1000 },
 *   { agent: 'FlashcardGraph', phase: 'chunk_2', processingTimeMs: 1200 },
 * ], LogLevel.INFO);
 * ```
 */
export function logBatch(entries: LogContext[], level: LogLevel = LogLevel.INFO): void {
  const batchEntries = entries.map(entry => createLogEntry(entry, level));
  console.log(JSON.stringify(batchEntries));
}
