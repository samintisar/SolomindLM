/**
 * Rate limiting middleware for SolomindLM
 * Enforces daily rate limits per user tier and service type
 */

import { type Request, type Response, type NextFunction } from 'express';
import { rateLimitService } from '../services/RateLimitService.js';
import type { ServiceType, RateLimitErrorResponse } from '../types/rateLimit.js';

/**
 * Middleware factory to apply rate limiting to specific endpoints
 *
 * @param serviceType - The service type to rate limit (e.g., 'chat', 'flashcard')
 * @returns Express middleware function
 *
 * Usage:
 *   router.post('/', rateLimiter('flashcard'), async (req, res) => { ... });
 */
export function rateLimiter(serviceType: ServiceType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Extract userId from request (following existing pattern in codebase)
    const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'];

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'userId is required',
      });
    }

    try {
      // Security: Avoid logging user ID to prevent correlation attacks
      console.log(`[RateLimit] Checking rate limit for service=${serviceType}`);

      // Check and increment rate limit atomically
      const result = await rateLimitService.checkAndIncrement(userId, serviceType);

      // Add rate limit headers to all responses (with null checks)
      if (result.limit != null) {
        res.setHeader('X-RateLimit-Limit', result.limit.toString());
      }
      if (result.remaining != null) {
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      }
      res.setHeader('X-RateLimit-Reset', result.reset_at.toISOString());
      res.setHeader('X-RateLimit-Service', serviceType);

      // Check if limit exceeded
      if (!result.allowed) {
        const userTier = await rateLimitService.getUserTier(userId);

        const errorResponse: RateLimitErrorResponse = {
          error: 'Rate limit exceeded',
          message: `Daily ${serviceType} limit reached for ${userTier} tier. Limit resets at ${result.reset_at.toISOString()}`,
          limit: result.limit,
          remaining: result.remaining,
          reset_at: result.reset_at.toISOString(),
          tier: userTier,
          service_type: serviceType,
        };

        console.log(
          `[RateLimit] Rate limit exceeded for service=${serviceType}, tier=${userTier}`
        );

        return res.status(429).json(errorResponse);
      }

      console.log(
        `[RateLimit] Rate limit check passed for service=${serviceType}, remaining=${result.remaining}`
      );

      // Attach rate limit info to request for use in handlers
      req.rateLimit = {
        limit: result.limit,
        remaining: result.remaining,
        reset_at: result.reset_at,
      };

      next();
    } catch (error) {
      console.error('[RateLimit] Error checking rate limit:', error);

      // Fail closed - reject request if rate limit check fails
      // This is more secure than fail-open for rate limiting
      return res.status(500).json({
        error: 'Unable to verify rate limit. Please try again later.',
        code: 'RATE_LIMIT_CHECK_FAILED',
      });
    }
  };
}

// Extend Express Request type to include rate limit info
declare global {
  namespace Express {
    interface Request {
      rateLimit?: {
        limit: number;
        remaining: number;
        reset_at: Date;
      };
    }
  }
}
