// convex/freeTools/validators.ts
import { v } from "convex/values";

/**
 * One card of a free-tool deck. Shared by the Node `generate` action and the V8 `claimDeck`
 * mutation, so it lives in a runtime-neutral module (a V8 module cannot import a "use node" one).
 */
export const freeDeckCardValidator = v.object({
  type: v.union(
    v.literal("wh-question"),
    v.literal("fill-blank"),
    v.literal("true-false"),
    v.literal("definition"),
    v.literal("scenario")
  ),
  front: v.string(),
  back: v.string(),
  topic: v.optional(v.union(v.string(), v.null())),
});
