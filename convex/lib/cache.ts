"use node";
import { v } from "convex/values";
import crypto from "crypto";

// TTL configurations (in milliseconds)
export const CACHE_TTL = {
  agent: 60 * 60 * 1000, // 1 hour for agent runs
  embedding: 7 * 24 * 60 * 60 * 1000, // 7 days for embeddings
  vectorSearch: 5 * 60 * 1000, // 5 minutes for vector search results
} as const;

/**
 * Generate a hash using SHA-256 for better distribution
 */
export function hashInput(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Generate a cache key for agent invocations
 * Format: {agentType}:{version}:{hash}
 */
export function generateAgentCacheKey(
  agentType: string,
  version: string,
  params: Record<string, unknown>
): string {
  const paramsStr = JSON.stringify(params, Object.keys(params).sort());
  const hash = hashInput(paramsStr);
  return `${agentType}:${version}:${hash}`;
}

/**
 * Generate cache key for embeddings
 */
export function generateEmbeddingCacheKey(text: string): string {
  const hash = hashInput(text);
  return `embedding:${hash}`;
}
