/**
 * Structured error types for rate limiting and resource limits.
 * These errors can be serialized through Convex and parsed by the frontend.
 */

import { ConvexError } from "convex/values";

/**
 * Error codes for different types of limit errors
 */
export enum ErrorCode {
  NOTEBOOK_LIMIT_REACHED = "NOTEBOOK_LIMIT_REACHED",
  SOURCE_LIMIT_REACHED = "SOURCE_LIMIT_REACHED",
  DAILY_LIMIT_REACHED = "DAILY_LIMIT_REACHED",
  FEATURE_REQUIRES_PRO = "FEATURE_REQUIRES_PRO",
  CONCURRENT_RUN_LIMIT_REACHED = "CONCURRENT_RUN_LIMIT_REACHED",
  RETRY_LIMIT_REACHED = "RETRY_LIMIT_REACHED",
}

/**
 * Types of limits that can be enforced. "daily" covers every usage window
 * (day, week, 30 days); `window` on the error says which. "plan" means the
 * feature is not on the user's plan at all.
 */
export type LimitType = "notebook" | "source" | "daily" | "plan" | "concurrent" | "retry";

/**
 * Features with a per-window usage limit. Named for the original daily-only
 * windows; some features now use a weekly or 30-day window (see `FeatureLimit`).
 */
export type DailyFeature =
  | "chat"
  | "flashcard"
  | "quiz"
  | "report"
  | "audio"
  | "writtenQuestion"
  | "spreadsheet"
  | "infographic"
  | "sourceGuide"
  | "mindmap"
  | "literatureReview"
  | "deepResearch";

/** Length of a usage-limit window. "month" is a rolling 30 days. */
export type LimitWindow = "day" | "week" | "month";

export interface FeatureLimit {
  rate: number;
  window: LimitWindow;
}

/**
 * Structured error data that can be serialized through Convex
 */
export type LimitErrorData = {
  code: string;
  /** Human-readable summary; also the error's `message` on the server. */
  message: string;
  limit: number;
  current: number;
  limitType: LimitType;
  feature?: DailyFeature;
  window?: LimitWindow;
  isPro?: boolean;
};

/**
 * Custom error class for limit-related errors.
 *
 * Extends ConvexError so production deployments pass `data` to the client
 * (plain Errors are redacted to "Server Error"), letting the frontend show
 * the right message and upgrade CTA.
 */
export class LimitError extends ConvexError<LimitErrorData> {
  code: ErrorCode;
  limit: number;
  current: number;
  limitType: LimitType;
  feature?: DailyFeature;
  window?: LimitWindow;
  isPro: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    limitType: LimitType,
    current: number,
    limit: number,
    feature?: DailyFeature,
    isPro: boolean = false,
    window?: LimitWindow
  ) {
    super({ code, message, limit, current, limitType, feature, window, isPro });
    // ConvexError builds its message from the data; keep the readable one.
    this.message = message;
    this.name = "LimitError";
    this.code = code;
    this.limitType = limitType;
    this.current = current;
    this.limit = limit;
    this.feature = feature;
    this.window = window;
    this.isPro = isPro;
  }
}

/**
 * Create a notebook limit error
 */
export function createNotebookLimitError(
  current: number,
  limit: number,
  isPro: boolean = false
): LimitError {
  const message = `Notebook limit reached (${current}/${limit}). Please upgrade to create more notebooks.`;
  return new LimitError(
    ErrorCode.NOTEBOOK_LIMIT_REACHED,
    message,
    "notebook",
    current,
    limit,
    undefined,
    isPro
  );
}

/**
 * Create a source limit error
 */
export function createSourceLimitError(
  current: number,
  limit: number,
  isPro: boolean = false
): LimitError {
  const message = isPro
    ? `Source limit reached (${current}/${limit} sources per notebook). Remove a source to add another.`
    : `Source limit reached (${current}/${limit} sources per notebook). Upgrade to Pro for up to 200 sources per notebook, or remove a source to add another.`;
  return new LimitError(
    ErrorCode.SOURCE_LIMIT_REACHED,
    message,
    "source",
    current,
    limit,
    undefined,
    isPro
  );
}

const FEATURE_NAMES: Record<DailyFeature, string> = {
  chat: "chat message",
  flashcard: "flashcard set",
  quiz: "quiz",
  report: "report",
  audio: "audio overview",
  writtenQuestion: "written question set",
  spreadsheet: "spreadsheet",
  infographic: "infographic",
  sourceGuide: "source guide",
  mindmap: "mind map",
  literatureReview: "literature review",
  deepResearch: "deep research",
};

const WINDOW_LABELS: Record<LimitWindow, string> = {
  day: "Daily",
  week: "Weekly",
  month: "30-day",
};

/**
 * Create a usage limit error for a specific feature. The window defaults to
 * the feature's configured window on the user's plan.
 */
export function createDailyLimitError(
  feature: DailyFeature,
  current: number,
  limit: number,
  isPro: boolean = false,
  window: LimitWindow = getFeatureWindow(feature, isPro)
): LimitError {
  const message = `${WINDOW_LABELS[window]} ${FEATURE_NAMES[feature]} limit reached (${current}/${limit}). Upgrade for higher limits.`;

  return new LimitError(
    ErrorCode.DAILY_LIMIT_REACHED,
    message,
    "daily",
    current,
    limit,
    feature,
    isPro,
    window
  );
}

/** The feature is not available on the Free plan. */
export function createProRequiredError(feature: DailyFeature): LimitError {
  const name = FEATURE_NAMES[feature];
  const message = `${name.charAt(0).toUpperCase()}${name.slice(1)} is a Pro feature. Upgrade to Pro to use it.`;
  return new LimitError(ErrorCode.FEATURE_REQUIRES_PRO, message, "plan", 0, 0, feature, false);
}

/** Too many runs of a long-running feature are in progress at once. */
export function createConcurrentRunLimitError(
  feature: DailyFeature,
  current: number,
  limit: number,
  isPro: boolean
): LimitError {
  const message = `You already have ${current} ${FEATURE_NAMES[feature]} run${current === 1 ? "" : "s"} in progress (limit ${limit}). Wait for one to finish before starting another.`;
  return new LimitError(
    ErrorCode.CONCURRENT_RUN_LIMIT_REACHED,
    message,
    "concurrent",
    current,
    limit,
    feature,
    isPro
  );
}

/** A single run has been retried as many times as allowed. */
export function createRetryLimitError(
  feature: DailyFeature,
  current: number,
  limit: number,
  isPro: boolean
): LimitError {
  const message = `This ${FEATURE_NAMES[feature]} has already been retried ${current} times (limit ${limit}). Start a new run instead.`;
  return new LimitError(
    ErrorCode.RETRY_LIMIT_REACHED,
    message,
    "retry",
    current,
    limit,
    feature,
    isPro
  );
}

/**
 * Canonical per-feature usage limits. This is the single source of truth —
 * `rateLimits.ts` derives both its accessors and the rate-limiter window
 * config from these maps, so the numbers live in exactly one place.
 */
export const PRO_FEATURE_LIMITS: Record<DailyFeature, FeatureLimit> = {
  chat: { rate: 500, window: "day" },
  flashcard: { rate: 100, window: "day" },
  quiz: { rate: 100, window: "day" },
  report: { rate: 100, window: "day" },
  audio: { rate: 20, window: "day" },
  writtenQuestion: { rate: 100, window: "day" },
  spreadsheet: { rate: 100, window: "day" },
  infographic: { rate: 10, window: "day" },
  sourceGuide: { rate: 200, window: "day" },
  mindmap: { rate: 100, window: "day" },
  literatureReview: { rate: 10, window: "day" },
  deepResearch: { rate: 15, window: "day" },
};

/** `null` means the feature is Pro only. */
export const FREE_FEATURE_LIMITS: Record<DailyFeature, FeatureLimit | null> = {
  chat: { rate: 10, window: "day" },
  flashcard: { rate: 1, window: "day" },
  quiz: { rate: 1, window: "day" },
  report: { rate: 1, window: "day" },
  audio: { rate: 3, window: "week" },
  writtenQuestion: { rate: 1, window: "day" },
  spreadsheet: { rate: 1, window: "day" },
  infographic: null,
  sourceGuide: { rate: 50, window: "day" },
  mindmap: { rate: 1, window: "day" },
  literatureReview: { rate: 1, window: "month" },
  deepResearch: null,
};

/** Most runs of a long-running feature one user can have in progress at once. */
export const CONCURRENT_RUN_LIMITS: Record<
  "literatureReview" | "deepResearch",
  { free: number; pro: number }
> = {
  literatureReview: { free: 1, pro: 3 },
  deepResearch: { free: 1, pro: 3 },
};

/** Retries allowed per literature review or deep research run; retries don't use a run. */
export const MAX_RUN_RETRIES = 3;

/** True when Free users cannot use the feature at all. */
export function isProOnlyFeature(feature: DailyFeature): boolean {
  return FREE_FEATURE_LIMITS[feature] === null;
}

/**
 * Get the pro tier limit for a feature
 */
export function getProLimit(feature: DailyFeature): number {
  return PRO_FEATURE_LIMITS[feature].rate;
}

/**
 * Get the free tier limit for a feature (0 when the feature is Pro only)
 */
export function getFreeLimit(feature: DailyFeature): number {
  return FREE_FEATURE_LIMITS[feature]?.rate ?? 0;
}

/**
 * Get the appropriate limit based on subscription status
 */
export function getFeatureLimit(feature: DailyFeature, isPro: boolean): number {
  return isPro ? getProLimit(feature) : getFreeLimit(feature);
}

/** The usage window for a feature on a plan (Pro-only features fall back to Pro's). */
export function getFeatureWindow(feature: DailyFeature, isPro: boolean): LimitWindow {
  const limit = isPro ? PRO_FEATURE_LIMITS[feature] : FREE_FEATURE_LIMITS[feature];
  return (limit ?? PRO_FEATURE_LIMITS[feature]).window;
}

// --- Service / IO errors (Convex-serializable .data, discriminated by `type`) ---

export type ExternalServiceErrorData = {
  type: "EXTERNAL_SERVICE_ERROR";
  service: string;
  retryable: boolean;
  statusCode?: number;
  endpoint?: string;
  /** Safe, user-facing or developer-facing summary */
  detail?: string;
};

export class ExternalServiceError extends Error {
  service: string;
  statusCode?: number;
  retryable: boolean;
  endpoint?: string;
  data: ExternalServiceErrorData;

  constructor(
    service: string,
    message: string,
    options?: { statusCode?: number; retryable?: boolean; endpoint?: string; detail?: string }
  ) {
    super(message);
    this.name = "ExternalServiceError";
    this.service = service;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? isRetryableHttpStatus(options?.statusCode);
    this.endpoint = options?.endpoint;
    this.data = {
      type: "EXTERNAL_SERVICE_ERROR",
      service,
      retryable: this.retryable,
      statusCode: options?.statusCode,
      endpoint: options?.endpoint,
      detail: options?.detail ?? message,
    };
  }
}

export function isRetryableHttpStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export function createExternalServiceErrorFromResponse(
  service: string,
  status: number | undefined,
  endpoint: string | undefined,
  bodySnippet?: string
): ExternalServiceError {
  const retryable = isRetryableHttpStatus(status);
  const message = bodySnippet
    ? `${service} HTTP ${status ?? "error"}: ${bodySnippet.slice(0, 200)}`
    : `${service} HTTP ${status ?? "error"}`;
  return new ExternalServiceError(service, message, {
    statusCode: status,
    retryable,
    endpoint,
    detail: message,
  });
}

export type StorageErrorData = {
  type: "STORAGE_ERROR";
  operation: string;
  fileName?: string;
  storageId?: string;
  detail?: string;
};

export class StorageError extends Error {
  operation: string;
  fileName?: string;
  storageId?: string;
  data: StorageErrorData;

  constructor(
    operation: string,
    message: string,
    options?: { fileName?: string; storageId?: string }
  ) {
    super(message);
    this.name = "StorageError";
    this.operation = operation;
    this.fileName = options?.fileName;
    this.storageId = options?.storageId;
    this.data = {
      type: "STORAGE_ERROR",
      operation,
      fileName: options?.fileName,
      storageId: options?.storageId,
      detail: message,
    };
  }
}

export type InputValidationErrorData = {
  type: "INPUT_VALIDATION_ERROR";
  field?: string;
  detail?: string;
};

export class InputValidationError extends Error {
  field?: string;
  data: InputValidationErrorData;

  constructor(message: string, options?: { field?: string }) {
    super(message);
    this.name = "InputValidationError";
    this.field = options?.field;
    this.data = {
      type: "INPUT_VALIDATION_ERROR",
      field: options?.field,
      detail: message,
    };
  }
}
