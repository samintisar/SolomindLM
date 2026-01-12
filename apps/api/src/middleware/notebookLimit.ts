/**
 * Notebook limit middleware - Checks if user can create more notebooks
 * Enforces per-user notebook limits based on user tier
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database.js';
import { NOTEBOOK_LIMITS } from '../config/rateLimits.js';
import { rateLimitService } from '../services/RateLimitService.js';
import type { UserTier } from '../types/rateLimit.js';

interface NotebookLimitErrorResponse {
  error: string;
  message: string;
  limit: number;
  current: number;
  tier: UserTier;
}

/**
 * Middleware to check notebook count limit per user
 * Must be used after authentication that provides userId
 */
export async function checkNotebookLimit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract userId from the authenticated request
    // The userId should be set by the authenticate middleware which runs before this
    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = req.user.id;

    // Get user tier
    const userTier = await rateLimitService.getUserTier(userId);
    const limit = NOTEBOOK_LIMITS[userTier];

    // Get current notebook count for this user
    const { count, error: countError } = await supabase
      .from('notebooks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('[NotebookLimit] Error counting notebooks:', countError);
      // Fail open - allow request if count check fails
      next();
      return;
    }

    const currentCount = count || 0;

    // Check if limit would be exceeded
    if (currentCount >= limit) {
      const errorResponse: NotebookLimitErrorResponse = {
        error: 'Notebook limit exceeded',
        message: `You have reached the maximum of ${limit} notebooks for ${userTier} tier. Current notebooks: ${currentCount}. Please upgrade your plan to create more notebooks.`,
        limit,
        current: currentCount,
        tier: userTier,
      };

      console.log(
        `[NotebookLimit] Limit exceeded for user=${userId}, tier=${userTier}, current=${currentCount}, limit=${limit}`
      );

      res.status(403).json(errorResponse);
      return;
    }

    console.log(
      `[NotebookLimit] Check passed for user=${userId}, tier=${userTier}, current=${currentCount}, limit=${limit}`
    );

    next();
  } catch (error) {
    console.error('[NotebookLimit] Error checking notebook limit:', error);
    // Fail open - allow request if check fails
    next();
  }
}
