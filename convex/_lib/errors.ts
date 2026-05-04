/**
 * Structured error types for rate limiting and resource limits.
 * These errors can be serialized through Convex and parsed by the frontend.
 */

/**
 * Error codes for different types of limit errors
 */
export enum ErrorCode {
  NOTEBOOK_LIMIT_REACHED = "NOTEBOOK_LIMIT_REACHED",
  SOURCE_LIMIT_REACHED = "SOURCE_LIMIT_REACHED",
  DAILY_LIMIT_REACHED = "DAILY_LIMIT_REACHED",
}

/**
 * Types of limits that can be enforced
 */
export type LimitType = "notebook" | "source" | "daily";

/**
 * Features that have daily limits
 */
export type DailyFeature =
  | "chat"
  | "flashcard"
  | "quiz"
  | "report"
  | "audio"
  | "writtenQuestion"
  | "spreadsheet"
  | "infographic";

/**
 * Structured error data that can be serialized through Convex
 */
export interface LimitErrorData {
  code: string;
  limit: number;
  current: number;
  limitType: LimitType;
  feature?: DailyFeature;
  isPro?: boolean;
}

/**
 * Custom error class for limit-related errors.
 * This includes structured data that the frontend can parse
 * to show appropriate error messages and upgrade CTAs.
 */
export class LimitError extends Error {
  code: ErrorCode;
  limit: number;
  current: number;
  limitType: LimitType;
  feature?: DailyFeature;
  isPro: boolean;

  /**
   * Attach structured data for Convex serialization.
   * Convex can serialize plain objects but not class instances,
   * so we include this data property.
   */
  data: LimitErrorData;

  constructor(
    code: ErrorCode,
    message: string,
    limitType: LimitType,
    current: number,
    limit: number,
    feature?: DailyFeature,
    isPro: boolean = false
  ) {
    super(message);
    this.name = "LimitError";
    this.code = code;
    this.limitType = limitType;
    this.current = current;
    this.limit = limit;
    this.feature = feature;
    this.isPro = isPro;

    // Attach structured data for Convex serialization
    this.data = {
      code,
      limit,
      current,
      limitType,
      feature,
      isPro,
    };
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
  const message = `Source limit reached (${current}/${limit}). Please upgrade to add more sources.`;
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

/**
 * Create a daily limit error for a specific feature
 */
export function createDailyLimitError(
  feature: DailyFeature,
  current: number,
  limit: number,
  isPro: boolean = false
): LimitError {
  const featureNames: Record<DailyFeature, string> = {
    chat: "chat message",
    flashcard: "flashcard set",
    quiz: "quiz",
    report: "report",
    audio: "audio overview",
    writtenQuestion: "written question set",
    spreadsheet: "spreadsheet",
    infographic: "infographic",
  };

  const featureName = featureNames[feature] || feature;
  const message = `Daily ${featureName} limit reached (${current}/${limit}). Upgrade for higher limits.`;

  return new LimitError(
    ErrorCode.DAILY_LIMIT_REACHED,
    message,
    "daily",
    current,
    limit,
    feature,
    isPro
  );
}

/**
 * Get the pro tier limit for a feature
 */
export function getProLimit(feature: DailyFeature): number {
  const limits: Record<DailyFeature, number> = {
    chat: 500,
    flashcard: 100,
    quiz: 100,
    report: 100,
    audio: 100,
    writtenQuestion: 100,
    spreadsheet: 100,
    infographic: 100,
  };
  return limits[feature];
}

/**
 * Get the free tier limit for a feature
 */
export function getFreeLimit(feature: DailyFeature): number {
  const limits: Record<DailyFeature, number> = {
    chat: 50,
    flashcard: 5,
    quiz: 5,
    report: 5,
    audio: 1,
    writtenQuestion: 5,
    spreadsheet: 5,
    infographic: 5,
  };
  return limits[feature];
}

/**
 * Get the appropriate limit based on subscription status
 */
export function getFeatureLimit(feature: DailyFeature, isPro: boolean): number {
  return isPro ? getProLimit(feature) : getFreeLimit(feature);
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
