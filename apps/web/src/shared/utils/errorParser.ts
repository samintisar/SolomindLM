/**
 * Error parser utilities for handling limit errors from Convex backend.
 * Parses both new structured errors and legacy string-based errors.
 */

import type { DailyFeature } from '@/shared/types/index';

/**
 * Parsed limit error data
 */
export interface ParsedLimitError {
  isLimitError: true;
  code: string;
  limit: number;
  current: number;
  limitType: 'notebook' | 'source' | 'daily';
  feature?: DailyFeature;
  isPro: boolean;
}

/**
 * Type guard to check if an error is a LimitError from backend
 */
export function isLimitError(error: unknown): error is ParsedLimitError {
  if (!error || typeof error !== 'object') return false;

  // Check for structured error with data property (from Convex serialization)
  const err = error as any;
  if (err.data && typeof err.data === 'object') {
    return (
      typeof err.data.code === 'string' &&
      typeof err.data.limit === 'number' &&
      typeof err.data.current === 'number' &&
      typeof err.data.limitType === 'string'
    );
  }

  // Check for direct LimitError properties
  return (
    typeof err.code === 'string' &&
    typeof err.limit === 'number' &&
    typeof err.current === 'number' &&
    typeof err.limitType === 'string'
  );
}

/**
 * Parse an error and extract limit-related information.
 * Handles both new structured errors and legacy string-based errors.
 */
export function parseLimitError(error: unknown): ParsedLimitError | null {
  if (!error) return null;

  // Handle Error objects
  if (error instanceof Error) {
    // Try to parse the error message for legacy errors
    const legacyParse = parseLegacyLimitError(error.message);
    if (legacyParse) {
      return legacyParse;
    }

    // Check if error has structured data attached
    const err = error as any;
    if (err.data && isLimitError(err.data)) {
      return err.data;
    }
  }

  // Check if it's already a structured error
  if (isLimitError(error)) {
    return error as ParsedLimitError;
  }

  // Handle plain objects with error data
  if (typeof error === 'object' && error !== null) {
    const err = error as any;
    if (err.data && isLimitError(err.data)) {
      return err.data;
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
  if (lowerMessage.includes('notebook limit')) {
    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: 'NOTEBOOK_LIMIT_REACHED',
        limit,
        current,
        limitType: 'notebook',
        isPro: limit > 5,
      };
    }
    // Try to extract just the limit number
    const limitMatch = message.match(/limit reached \((\d+)\)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return {
        isLimitError: true,
        code: 'NOTEBOOK_LIMIT_REACHED',
        limit,
        current: limit,
        limitType: 'notebook',
        isPro: limit > 5,
      };
    }
  }

  // Source limit errors
  if (lowerMessage.includes('source limit')) {
    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: 'SOURCE_LIMIT_REACHED',
        limit,
        current,
        limitType: 'source',
        isPro: limit > 20,
      };
    }
    const limitMatch = message.match(/limit reached \((\d+)\)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      return {
        isLimitError: true,
        code: 'SOURCE_LIMIT_REACHED',
        limit,
        current: limit,
        limitType: 'source',
        isPro: limit > 20,
      };
    }
  }

  // Daily limit errors
  if (lowerMessage.includes('daily') && lowerMessage.includes('limit')) {
    // Try to detect feature type
    let feature: DailyFeature | undefined;
    if (lowerMessage.includes('chat')) feature = 'chat';
    else if (lowerMessage.includes('flashcard')) feature = 'flashcard';
    else if (lowerMessage.includes('quiz')) feature = 'quiz';
    else if (lowerMessage.includes('report')) feature = 'report';
    else if (lowerMessage.includes('audio')) feature = 'audio';
    else if (lowerMessage.includes('written question')) feature = 'writtenQuestion';
    else if (lowerMessage.includes('spreadsheet')) feature = 'spreadsheet';
    else if (lowerMessage.includes('slide')) feature = 'slide';

    const match = message.match(/(\d+)\/(\d+)/);
    if (match) {
      const current = parseInt(match[1], 10);
      const limit = parseInt(match[2], 10);
      return {
        isLimitError: true,
        code: 'DAILY_LIMIT_REACHED',
        limit,
        current,
        limitType: 'daily',
        feature,
        isPro: limit > 50, // Rough check
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

  if (limitType === 'notebook') {
    return `You've reached your notebook limit (${current}/${limit}).`;
  }

  if (limitType === 'source') {
    return `You've reached your source limit (${current}/${limit}).`;
  }

  if (limitType === 'daily' && feature) {
    const featureNames: Record<DailyFeature, string> = {
      chat: 'chat message',
      flashcard: 'flashcard set',
      quiz: 'quiz',
      report: 'report',
      audio: 'audio overview',
      writtenQuestion: 'written question set',
      spreadsheet: 'spreadsheet',
      slide: 'slide deck',
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
    return 'Contact support to increase your limits.';
  }

  if (limitType === 'notebook') {
    return 'Upgrade for up to 100 notebooks.';
  }

  if (limitType === 'source') {
    return 'Upgrade for up to 500 sources per notebook.';
  }

  if (limitType === 'daily' && feature) {
    const proLimits: Record<DailyFeature, string> = {
      chat: '500 messages/day',
      flashcard: '100 flashcard sets/day',
      quiz: '100 quizzes/day',
      report: '100 reports/day',
      audio: '5 audio overviews/day',
      writtenQuestion: '100 question sets/day',
      spreadsheet: '100 spreadsheets/day',
      slide: '10 slide decks/day',
    };
    return `Upgrade for ${proLimits[feature]}.`;
  }

  return 'Upgrade to Pro for higher limits.';
}
