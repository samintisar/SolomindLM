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
 * @returns ActionCache instance with .fetch() method
 */
export function createCachedAction(
  action: FunctionReference<"action", "internal", any, any>,
  options?: { ttl?: number; name?: string }
) {
  return new ActionCache(components.actionCache, {
    action,
    ttl: options?.ttl || CACHE_TTL.agent,
    name: options?.name,
  });
}
