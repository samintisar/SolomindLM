"use node";
import { ActionCache } from "@convex-dev/action-cache";
import { FunctionReference } from "convex/server";
import { components } from "../../_generated/api";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
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
   
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: FunctionReference<"action", "internal", any, any>,
  options?: { ttl?: number; name?: string }
) {
  const cache = new ActionCache(components.actionCache, {
    action,
    ttl: options?.ttl || CACHE_TTL.agent,
    name: options?.name,
  });

  // Wrap the fetch method to add lightweight validation logging
  // Note: ActionCache v0.3.0 doesn't expose cache hit information, so we don't track metrics
  const cacheName = options?.name || "unknown";
  return {
     
     
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async fetch(ctx: any, args: any): Promise<any> {
      const logger = createServiceLogger("action-cache", cacheName);
      const startTime = Date.now();
      const keyHint =
        typeof args?.query === "string"
          ? args.query.substring(0, 40)
          : typeof args?.text === "string"
            ? args.text.substring(0, 40)
            : "args";

      logger.debug("cache_fetch_start", { keyHint });
      const result = await cache.fetch(ctx, args);
      const duration = Date.now() - startTime;

      logger.performance("cache_fetch_ms", duration, "ms", { name: cacheName });

      if (result === null || result === undefined) {
        logger.warn("Null/undefined cache result", { durationMs: duration, name: cacheName });
      }

      return result;
    },
  };
}
