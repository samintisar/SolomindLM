/**
 * Cache configuration and utilities
 * This file can be imported from any Convex function (query, mutation, action)
 */

// TTL configurations (in milliseconds)
export const CACHE_TTL = {
  agent: 60 * 60 * 1000, // 1 hour for agent runs
  embedding: 7 * 24 * 60 * 60 * 1000, // 7 days for embeddings

  // New TTLs (base values, jitter added at runtime)
  rerank: 15 * 60 * 1000, // 15 min for reranking
  search: 60 * 60 * 1000, // 1 hour for web search
  documentContent: 60 * 60 * 1000, // 1 hour for document content
  notebookList: 5 * 60 * 1000, // 5 min for notebook lists
  subscription: 60 * 1000, // 1 min for subscription status
  generatedContent: 7 * 24 * 60 * 60 * 1000, // 7 days for LLM outputs
  sourceSuggestions: 30 * 60 * 1000, // 30 min for source suggestions
} as const;

/**
 * Add jitter to TTL to prevent thundering herd (mass simultaneous cache expiration)
 * @param baseTtl - Base TTL in milliseconds
 * @param jitterPercent - Percentage of TTL to add as random jitter (default 10%)
 * @returns TTL with random jitter applied (±jitterPercent of baseTtl)
 */
export function withJitter(baseTtl: number, jitterPercent: number = 0.1): number {
  // Generate random jitter within ±jitterPercent
  const jitter = baseTtl * jitterPercent * (Math.random() * 2 - 1);
  return Math.round(baseTtl + jitter);
}
