/**
 * Source limit middleware - Checks if user can add more sources to a notebook
 * Enforces per-notebook source limits based on user tier
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database.js';
import { SOURCE_LIMITS } from '../config/rateLimits.js';
import { rateLimitService } from '../services/RateLimitService.js';
import { AppError } from './error.js';
import type { UserTier } from '../types/rateLimit.js';

interface SourceLimitErrorResponse {
  error: string;
  message: string;
  limit: number;
  current: number;
  tier: UserTier;
  notebookId: string;
}

/**
 * Configuration for fail-open vs fail-closed behavior
 * In production, fail-closed is recommended for security
 * In development, fail-open may be preferred for debugging
 */
const FAIL_CLOSED = process.env.NODE_ENV === 'production';

/**
 * Middleware to check source count limit per notebook
 * Must be used after authentication middleware that sets userId
 */
export async function checkSourceLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, noteId } = req.body;

    if (!userId || !noteId) {
      res.status(400).json({ error: 'userId and noteId are required' });
      return;
    }

    // Get user tier
    const userTier = await rateLimitService.getUserTier(userId);
    const limit = SOURCE_LIMITS[userTier];

    // Get current source count for this notebook
    const { count, error: countError } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('notebook_id', noteId)
      .eq('user_id', userId);

    if (countError) {
      console.error('[SourceLimit] Error counting sources:', countError);

      // Fail closed in production, fail open in development
      if (FAIL_CLOSED) {
        throw new AppError(
          'Unable to verify source limit. Please try again later.',
          503,
          true,
          'RATE_LIMIT_CHECK_FAILED'
        );
      }

      // Log warning in development
      console.warn('[SourceLimit] Fail-open: allowing request due to database error');
      next();
      return;
    }

    const currentCount = count || 0;

    // Check if limit would be exceeded
    if (currentCount >= limit) {
      const errorResponse: SourceLimitErrorResponse = {
        error: 'Source limit exceeded',
        message: `You have reached the maximum of ${limit} sources per notebook for ${userTier} tier. Current sources: ${currentCount}`,
        limit,
        current: currentCount,
        tier: userTier,
        notebookId: noteId,
      };

      console.log(
        `[SourceLimit] Limit exceeded for user=${userId}, notebook=${noteId}, tier=${userTier}, current=${currentCount}, limit=${limit}`
      );

      res.status(403).json(errorResponse);
      return;
    }

    console.log(
      `[SourceLimit] Check passed for user=${userId}, notebook=${noteId}, tier=${userTier}, current=${currentCount}, limit=${limit}`
    );

    next();
  } catch (error) {
    // If it's an AppError, re-throw it to be handled by error middleware
    if (error instanceof AppError) {
      throw error;
    }

    console.error('[SourceLimit] Error checking source limit:', error);

    // Fail closed in production, fail open in development
    if (FAIL_CLOSED) {
      throw new AppError(
        'Unable to verify source limit. Please try again later.',
        503,
        true,
        'RATE_LIMIT_CHECK_FAILED'
      );
    }

    // Log warning in development
    console.warn('[SourceLimit] Fail-open: allowing request due to unexpected error');
    next();
  }
}
