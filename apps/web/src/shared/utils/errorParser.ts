/**
 * Error parser utilities for handling limit errors from Convex backend.
 * Parses both new structured errors and legacy string-based errors.
 */

import { ConvexError } from "convex/values";
import type { DailyFeature } from "@/shared/types/index";

/** Pro-tier daily caps (must match convex/_lib/rateLimits.ts getProLimit). */
const PRO_DAILY_CAP: Record<DailyFeature, number> = {
  chat: 500,
  flashcard: 100,
  quiz: 100,
  report: 100,
  audio: 100,
  writtenQuestion: 100,
  spreadsheet: 100,
  infographic: 100,
};

function inferIsProFromDailyCap(feature: DailyFeature | undefined, limit: number): boolean {
  if (!feature) return false;
  return PRO_DAILY_CAP[feature] === limit;
}

function parseLimitFromConvexErrorData(error: unknown): ParsedLimitError | null {
  if (!(error instanceof ConvexError)) return null;
  const d = error.data;
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  const limitType = o.limitType;
  if (
    typeof o.code !== "string" ||
    typeof o.limit !== "number" ||
    typeof o.current !== "number" ||
    (limitType !== "notebook" && limitType !== "source" && limitType !== "daily")
  ) {
    return null;
  }
  return {
    isLimitError: true,
    code: o.code,
    limit: o.limit,
    current: o.current,
    limitType,
    feature: o.feature as DailyFeature | undefined,
    isPro: Boolean(o.isPro),
  };
}

/**
 * Parsed limit error data
 */
export interface ParsedLimitError {
  isLimitError: true;
  code: string;
  limit: number;
  current: number;
  limitType: "notebook" | "source" | "daily";
  feature?: DailyFeature;
  isPro: boolean;
}

/**
 * Type guard to check if an error is a LimitError from backend
 */
export function isLimitError(error: unknown): error is ParsedLimitError {
  if (!error || typeof error !== "object") return false;

  // Check for structured error with data property (from Convex serialization)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = error as any;
  if (err.data && typeof err.data === "object") {
    return (
      typeof err.data.code === "string" &&
      typeof err.data.limit === "number" &&
      typeof err.data.current === "number" &&
      typeof err.data.limitType === "string"
    );
  }

  // Check for direct LimitError properties
  return (
    typeof err.code === "string" &&
    typeof err.limit === "number" &&
    typeof err.current === "number" &&
    typeof err.limitType === "string"
  );
}

/**
 * Parse an error and extract limit-related information.
 * Handles both new structured errors and legacy string-based errors.
 */
export function parseLimitError(error: unknown): ParsedLimitError | null {
  if (!error) return null;

  const fromConvexData = parseLimitFromConvexErrorData(error);
  if (fromConvexData) return fromConvexData;

  // Handle Error objects
  if (error instanceof Error) {
    // Try to parse the error message for legacy errors
    const legacyParse = parseLegacyLimitError(error.message);
    if (legacyParse) {
      return legacyParse;
    }

    // Check if error has structured data attached
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err.data && isLimitError(err.data)) {
      const raw = err.data as Record<string, unknown>;
      return {
        isLimitError: true,
        code: String(raw.code),
        limit: Number(raw.limit),
        current: Number(raw.current),
        limitType: raw.limitType as ParsedLimitError["limitType"],
        feature: raw.feature as DailyFeature | undefined,
        isPro: Boolean(raw.isPro),
      };
    }
  }

  // Check if it's already a structured error
  if (isLimitError(error)) {
    return {
      isLimitError: true,
      code: error.code,
      limit: error.limit,
      current: error.current,
      limitType: error.limitType,
      feature: error.feature,
      isPro: error.isPro,
    };
  }

  // Handle plain objects with error data
  if (typeof error === "object" && error !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    if (err.data && isLimitError(err.data)) {
      const raw = err.data as Record<string, unknown>;
      return {
        isLimitError: true,
        code: String(raw.code),
        limit: Number(raw.limit),
        current: Number(raw.current),
        limitType: raw.limitType as ParsedLimitError["limitType"],
        feature: raw.feature as DailyFeature | undefined,
        isPro: Boolean(raw.isPro),
      };
    }
  }

  return null;
}

/**
 * Parse legacy string-based error messages.
 * This handles errors that don't have structured data but contain
 * recognizable patterns.
 */
function parseLegacyLimitError(message: string): ParsedLimitError | null {
  const lowerMessage = message.toLowerCase();

  // Notebook limit errors
  if (lowerMessage.includes("notebook limit")) {
    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: "NOTEBOOK_LIMIT_REACHED",
        limit,
        current,
        limitType: "notebook",
        isPro: limit > 5,
      };
    }
    // Try to extract just the limit number
    const limitMatch = message.match(/limit reached \((\d+)\)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return {
        isLimitError: true,
        code: "NOTEBOOK_LIMIT_REACHED",
        limit,
        current: limit,
        limitType: "notebook",
        isPro: limit > 5,
      };
    }
  }

  // Source limit errors
  if (lowerMessage.includes("source limit")) {
    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: "SOURCE_LIMIT_REACHED",
        limit,
        current,
        limitType: "source",
        isPro: limit > 20,
      };
    }
    const limitMatch = message.match(/limit reached \((\d+)\)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return {
        isLimitError: true,
        code: "SOURCE_LIMIT_REACHED",
        limit,
        current: limit,
        limitType: "source",
        isPro: limit > 20,
      };
    }
  }

  // Daily limit errors
  if (lowerMessage.includes("daily") && lowerMessage.includes("limit")) {
    // Try to detect feature type
    let feature: DailyFeature | undefined;
    if (lowerMessage.includes("chat")) feature = "chat";
    else if (lowerMessage.includes("flashcard")) feature = "flashcard";
    else if (lowerMessage.includes("quiz")) feature = "quiz";
    else if (lowerMessage.includes("report")) feature = "report";
    else if (lowerMessage.includes("audio")) feature = "audio";
    else if (lowerMessage.includes("written question")) feature = "writtenQuestion";
    else if (lowerMessage.includes("spreadsheet")) feature = "spreadsheet";
    else if (lowerMessage.includes("infographic")) feature = "infographic";

    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: "DAILY_LIMIT_REACHED",
        limit,
        current,
        limitType: "daily",
        feature,
        isPro: inferIsProFromDailyCap(feature, limit),
      };
    }
  }

  return null;
}

/**
 * Get a user-friendly error message for a limit error
 */
export function getLimitErrorMessage(parsedError: ParsedLimitError): string {
  const { limitType, limit, current, feature } = parsedError;

  if (limitType === "notebook") {
    return `You've reached your notebook limit (${current}/${limit}).`;
  }

  if (limitType === "source") {
    return `You've reached your source limit (${current}/${limit}).`;
  }

  if (limitType === "daily" && feature) {
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
    return `Daily ${featureName} limit reached (${current}/${limit}).`;
  }

  return `You've reached a limit (${current}/${limit}).`;
}

/**
 * Get the upgrade message for a limit error
 */
export function getUpgradeMessage(parsedError: ParsedLimitError): string {
  const { limitType, feature, isPro } = parsedError;

  if (isPro) {
    if (limitType === "daily") {
      return "This limit refreshes on a rolling day—try again later, or contact support if you need a higher cap.";
    }
    return "Contact support to increase your limits.";
  }

  if (limitType === "notebook") {
    return "Upgrade for up to 100 notebooks.";
  }

  if (limitType === "source") {
    return "Upgrade for more notebooks and higher daily generation limits. To add a source, remove one from this notebook first.";
  }

  if (limitType === "daily" && feature) {
    const proLimits: Record<DailyFeature, string> = {
      chat: "500 messages/day",
      flashcard: "100 flashcard sets/day",
      quiz: "100 quizzes/day",
      report: "100 reports/day",
      audio: "100 audio overviews/day",
      writtenQuestion: "100 question sets/day",
      spreadsheet: "100 spreadsheets/day",
      infographic: "100 infographics/day",
    };
    return `Upgrade for ${proLimits[feature]}.`;
  }

  return "Upgrade to Pro for higher limits.";
}

// --- Structured service errors (ConvexError.data.type from convex/_lib/errors.ts) ---

export type ParsedExternalServiceError = {
  kind: "external_service";
  service: string;
  retryable: boolean;
  statusCode?: number;
  endpoint?: string;
  detail?: string;
};

export type ParsedStorageError = {
  kind: "storage";
  operation: string;
  fileName?: string;
  storageId?: string;
  detail?: string;
};

export type ParsedInputValidationError = {
  kind: "input_validation";
  field?: string;
  detail?: string;
};

export type ParsedServiceError =
  | ParsedExternalServiceError
  | ParsedStorageError
  | ParsedInputValidationError;

function convexErrorDataObject(error: unknown): Record<string, unknown> | null {
  if (error instanceof ConvexError) {
    const d = error.data;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      return d as Record<string, unknown>;
    }
    return null;
  }
  if (error && typeof error === "object" && "data" in error) {
    const d = (error as { data: unknown }).data;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      return d as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Parse EXTERNAL_SERVICE_ERROR / STORAGE_ERROR / INPUT_VALIDATION_ERROR from ConvexError.data
 */
export function parseServiceError(error: unknown): ParsedServiceError | null {
  const o = convexErrorDataObject(error);
  if (!o) return null;

  const t = o.type;
  if (t === "EXTERNAL_SERVICE_ERROR") {
    if (typeof o.service !== "string" || typeof o.retryable !== "boolean") return null;
    return {
      kind: "external_service",
      service: o.service,
      retryable: o.retryable,
      statusCode: typeof o.statusCode === "number" ? o.statusCode : undefined,
      endpoint: typeof o.endpoint === "string" ? o.endpoint : undefined,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    };
  }
  if (t === "STORAGE_ERROR") {
    if (typeof o.operation !== "string") return null;
    return {
      kind: "storage",
      operation: o.operation,
      fileName: typeof o.fileName === "string" ? o.fileName : undefined,
      storageId: typeof o.storageId === "string" ? o.storageId : undefined,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    };
  }
  if (t === "INPUT_VALIDATION_ERROR") {
    return {
      kind: "input_validation",
      field: typeof o.field === "string" ? o.field : undefined,
      detail: typeof o.detail === "string" ? o.detail : undefined,
    };
  }
  return null;
}

export function getServiceErrorMessage(parsed: ParsedServiceError): string {
  switch (parsed.kind) {
    case "external_service":
      return (
        parsed.detail ||
        `${parsed.service} is temporarily unavailable${parsed.retryable ? ". Try again." : "."}`
      );
    case "storage":
      return parsed.detail || `Storage ${parsed.operation} failed.`;
    case "input_validation":
      return parsed.detail || "Invalid input.";
    default:
      return "Something went wrong.";
  }
}

/**
 * Limit errors first, then structured service errors.
 */
export function parseAppError(error: unknown): ParsedLimitError | ParsedServiceError | null {
  const limit = parseLimitError(error);
  if (limit) return limit;
  return parseServiceError(error);
}
