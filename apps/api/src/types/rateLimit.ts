/**
 * Rate limiting type definitions for SolomindLM
 */

export type ServiceType =
  | 'chat'
  | 'flashcard'
  | 'quiz'
  | 'mindmap'
  | 'report'
  | 'audio_overview'
  | 'written_questions'
  | 'slides'
  | 'spreadsheet';

export type UserTier = 'free' | 'pro';

export interface RateLimitConfig {
  tier: UserTier;
  service_type: ServiceType;
  daily_limit: number;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitUsage {
  user_id: string;
  service_type: ServiceType;
  usage_date: Date;
  count: number;
  reset_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_at: Date;
}

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  used: number;
  reset_at: Date;
}

export interface RateLimitErrorResponse {
  error: string;
  message: string;
  limit: number;
  remaining: number;
  reset_at: string;
  tier: UserTier;
  service_type: ServiceType;
}
