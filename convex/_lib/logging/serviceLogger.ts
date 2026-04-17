/**
 * Structured JSON logging for Convex services (dashboard + Log Streams).
 * One JSON object per line; include requestId when available for correlation with function.request_id in exports.
 */

export type ServiceLogLevel = "debug" | "info" | "warn" | "error";

export interface ServiceLoggerContext {
  userId?: string;
  notebookId?: string;
  /** Echo Convex log field function.request_id when the caller has it */
  requestId?: string;
  correlationId?: string;
}

export interface ServiceLogger {
  serviceName: string;
  operation: string;

  operationStart: (args?: Record<string, unknown>) => void;
  operationComplete: (result?: Record<string, unknown>) => void;
  operationError: (error: Error | unknown, meta?: Record<string, unknown>) => void;

  apiCall: (api: string, endpoint: string, meta?: Record<string, unknown>) => void;
  apiError: (
    api: string,
    endpoint: string,
    error: Error | unknown,
    meta?: Record<string, unknown>
  ) => void;
  apiSuccess: (
    api: string,
    endpoint: string,
    durationMs: number,
    meta?: Record<string, unknown>
  ) => void;

  cacheHit: (keyHint: string) => void;
  cacheMiss: (keyHint: string) => void;

  performance: (
    metric: string,
    value: number,
    unit: string,
    meta?: Record<string, unknown>
  ) => void;

  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, error?: Error | unknown, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

function baseFields(
  serviceName: string,
  operation: string,
  ctx?: ServiceLoggerContext
): Record<string, unknown> {
  const o: Record<string, unknown> = {
    topic: "service",
    service: serviceName,
    operation,
  };
  if (ctx?.userId) o.userId = ctx.userId;
  if (ctx?.notebookId) o.notebookId = ctx.notebookId;
  if (ctx?.requestId) o.requestId = ctx.requestId;
  if (ctx?.correlationId) o.correlationId = ctx.correlationId;
  return o;
}

function emit(
  level: ServiceLogLevel,
  base: Record<string, unknown>,
  payload: Record<string, unknown>
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    ...base,
    ...payload,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createServiceLogger(
  serviceName: string,
  operation: string,
  context?: ServiceLoggerContext
): ServiceLogger {
  const base = () => baseFields(serviceName, operation, context);

  return {
    serviceName,
    operation,

    operationStart(args) {
      emit("info", base(), { event: "operation_start", ...(args ?? {}) });
    },

    operationComplete(result) {
      emit("info", base(), { event: "operation_complete", ...(result ?? {}) });
    },

    operationError(error, meta) {
      const err =
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 6).join("\n"),
            }
          : { message: String(error) };
      emit("error", base(), { event: "operation_error", error: err, ...(meta ?? {}) });
    },

    apiCall(api, endpoint, meta) {
      emit("info", base(), { event: "api_call", api, endpoint, ...(meta ?? {}) });
    },

    apiError(api, endpoint, error, meta) {
      const err =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) };
      emit("error", base(), { event: "api_error", api, endpoint, error: err, ...(meta ?? {}) });
    },

    apiSuccess(api, endpoint, durationMs, meta) {
      emit("info", base(), {
        event: "api_success",
        api,
        endpoint,
        durationMs,
        ...(meta ?? {}),
      });
    },

    cacheHit(keyHint) {
      emit("debug", base(), { event: "cache_hit", keyHint });
    },

    cacheMiss(keyHint) {
      emit("debug", base(), { event: "cache_miss", keyHint });
    },

    performance(metric, value, unit, meta) {
      emit("info", base(), { event: "performance", metric, value, unit, ...(meta ?? {}) });
    },

    info(message, meta) {
      emit("info", base(), { event: "info", message, ...(meta ?? {}) });
    },

    warn(message, meta) {
      emit("warn", base(), { event: "warn", message, ...(meta ?? {}) });
    },

    error(message, error, meta) {
      const err =
        error instanceof Error
          ? { name: error.name, message: error.message }
          : error !== undefined
            ? { message: String(error) }
            : undefined;
      emit("error", base(), {
        event: "error",
        message,
        ...(err ? { error: err } : {}),
        ...(meta ?? {}),
      });
    },

    debug(message, meta) {
      emit("debug", base(), { event: "debug", message, ...(meta ?? {}) });
    },
  };
}
