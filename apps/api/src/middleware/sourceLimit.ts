/**
 * Source limit middleware - Checks if user can add more sources to a notebook
 * Enforces per-notebook source limits based on user tier
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database.js';
import { SOURCE_LIMITS } from '../config/rateLimits.js';
import { rateLimitService } from '../services/RateLimitService.js';
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
      .eq('note_id', noteId)
      .eq('user_id', userId);

    if (countError) {
      console.error('[SourceLimit] Error counting sources:', countError);
      // Fail open - allow request if count check fails
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
    console.error('[SourceLimit] Error checking source limit:', error);
    // Fail open - allow request if check fails
    next();
  }
}
