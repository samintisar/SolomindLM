/**
 * Rate limiting configuration for SolomindLM
 * 
 * IMPORTANT: Daily rate limits are stored in the `rate_limit_config` database table.
 * To update rate limits, modify the database table directly:
 * 
 * UPDATE rate_limit_config 
 * SET daily_limit = <new_limit>
 * WHERE tier = '<free|pro>' AND service_type = '<service_type>';
 * 
 * Current limits (as of last sync):
 * Free tier: chat=50, flashcard=10, quiz=10, mindmap=10, report=5, audio_overview=1, written_questions=5
 * Pro tier: chat=1000, flashcard=500, quiz=500, mindmap=500, report=200, audio_overview=100, written_questions=200
 */

import { UserTier } from '../types/rateLimit.js';

/**
 * Source limits per notebook by user tier
 * These are permanent limits (not daily) enforced per notebook
 */
export const SOURCE_LIMITS: Record<UserTier, number> = {
  free: 20,
  pro: 100,
};

/**
 * Notebook limits per user by user tier
 * These are permanent limits (not daily) enforced per user account
 */
export const NOTEBOOK_LIMITS: Record<UserTier, number> = {
  free: 20,
  pro: 200,
};

/**
 * Default tier for new users
 */
export const DEFAULT_TIER: UserTier = 'free';
