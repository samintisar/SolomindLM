"use node";
import { ActionCache } from "@convex-dev/action-cache";
import { FunctionReference } from "convex/server";
import { components } from "../_generated/api";
import { CACHE_TTL } from "./cache";

/**
 * Create a cached action wrapper
 * ActionCache handles hashing, storage, and TTL automatically
 *
 * @param action - The internal action to cache (must be a FunctionReference)
 * @param options - TTL and name for versioning
 * @returns Object with .fetch() method that includes lightweight validation logging
 */
export function createCachedAction(
  action: FunctionReference<"action", "internal", any, any>,
  options?: { ttl?: number; name?: string }
) {
  const cache = new ActionCache(components.actionCache, {
    action,
    ttl: options?.ttl || CACHE_TTL.agent,
    name: options?.name,
  });

  // Wrap the fetch method to add lightweight validation logging
  return {
    async fetch(ctx: any, args: any): Promise<any> {
      const startTime = Date.now();
      const result = await cache.fetch(ctx, args);
      const duration = Date.now() - startTime;

      // Lightweight validation - just log, don't block
      // This helps detect stale cache issues without adding latency
      if (result === null || result === undefined) {
        console.warn(
          `[Cache] Null/undefined result for ${options?.name || "unknown"}`,
          { duration: `${duration}ms` }
        );
      } else if (typeof result !== "object" && typeof result !== "number") {
        console.warn(
          `[Cache] Unexpected result type for ${options?.name || "unknown"}`,
          { type: typeof result, duration: `${duration}ms` }
        );
      }

      // Log cache performance (heuristic: fast responses are likely cache hits)
      const cacheHit = duration < 100;
      console.log(
        `[Cache] ${options?.name || "unknown"}: ${cacheHit ? "HIT" : "MISS"} (${duration}ms)`
      );

      return result;
    },
  };
}
