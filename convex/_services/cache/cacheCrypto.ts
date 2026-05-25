/**
 * Cache utilities using Web Crypto API (works in both V8 and Node.js runtimes)
 * This file can be imported from any Convex function
 */

/**
 * Generate a hash using SHA-256 for better distribution
 */
export async function hashInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 16);
}

/**
 * Generate a cache key for agent invocations
 * Format: {agentType}:{version}:{hash}
 */
export async function generateAgentCacheKey(
  agentType: string,
  version: string,
  params: Record<string, unknown>
): Promise<string> {
  const paramsStr = JSON.stringify(params, Object.keys(params).sort());
  const hash = await hashInput(paramsStr);
  return `${agentType}:${version}:${hash}`;
}

/**
 * Generate cache key for embeddings
 */
export async function generateEmbeddingCacheKey(text: string): Promise<string> {
  const hash = await hashInput(text);
  return `embedding:${hash}`;
}
