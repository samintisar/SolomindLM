/**
 * RateLimitService - Database operations for rate limiting
 * Uses PostgreSQL functions for atomic operations
 * Limits are stored in rate_limit_config table (single source of truth)
 */

import { pgPool } from '../config/worker.js';
import type {
  ServiceType,
  RateLimitCheckResult,
  RateLimitStatus,
  UserTier,
} from '../types/rateLimit.js';

export class RateLimitService {
  /**
   * Check and increment rate limit atomically
   * Uses PostgreSQL function that looks up limits from rate_limit_config table
   * @param userId - User ID
   * @param serviceType - Service type to rate limit
   * @returns Rate limit check result
   */
  async checkAndIncrement(
    userId: string,
    serviceType: ServiceType
  ): Promise<RateLimitCheckResult> {
    // Use increment_and_check_rate_limit which looks up limit from rate_limit_config table
    const result = await pgPool.query(
      'SELECT * FROM increment_and_check_rate_limit($1, $2)',
      [userId, serviceType]
    );

    const data = result.rows[0];
    
    // Calculate reset_at (next day at midnight)
    const resetAt = new Date();
    resetAt.setDate(resetAt.getDate() + 1);
    resetAt.setHours(0, 0, 0, 0);

    return {
      allowed: data.allowed,
      limit: data.limit,
      remaining: data.remaining,
      reset_at: resetAt,
    };
  }

  /**
   * Get current rate limit status without incrementing
   * Uses PostgreSQL function that looks up limits from rate_limit_config table
   * @param userId - User ID
   * @param serviceType - Service type
   * @returns Current rate limit status
   */
  async getStatus(
    userId: string,
    serviceType: ServiceType
  ): Promise<RateLimitStatus> {
    // Use check_rate_limit which looks up limit from rate_limit_config table
    const result = await pgPool.query(
      'SELECT * FROM check_rate_limit($1, $2)',
      [userId, serviceType]
    );

    const data = result.rows[0];
    
    // Calculate reset_at (next day at midnight)
    const resetAt = new Date();
    resetAt.setDate(resetAt.getDate() + 1);
    resetAt.setHours(0, 0, 0, 0);

    return {
      limit: data.limit,
      remaining: data.remaining,
      used: data.used,
      reset_at: resetAt,
    };
  }

  /**
   * Get user tier from database
   * @param userId - User ID
   * @returns User tier ('free' or 'pro')
   */
  async getUserTier(userId: string): Promise<UserTier> {
    const result = await pgPool.query(
      'SELECT tier FROM user_profiles WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      return 'free'; // Default tier
    }

    return result.rows[0].tier as UserTier;
  }

  /**
   * Reset usage for testing purposes (admin only)
   * @param userId - User ID
   * @param serviceType - Optional service type to reset specific service
   */
  async resetUsage(userId: string, serviceType?: ServiceType): Promise<void> {
    if (serviceType) {
      await pgPool.query(
        'DELETE FROM rate_limit_usage WHERE user_id = $1 AND service_type = $2',
        [userId, serviceType]
      );
    } else {
      await pgPool.query(
        'DELETE FROM rate_limit_usage WHERE user_id = $1',
        [userId]
      );
    }
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService();
