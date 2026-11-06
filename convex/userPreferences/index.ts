import { ConvexError, v } from "convex/values";
import { VALID_LANGUAGE_CODES } from "../_agents/_shared/languageInstruction";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type MutationCtx, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { mutation } from "../functions";

type PreferenceFields = Partial<
  Omit<Doc<"userPreferences">, "_id" | "_creationTime" | "userId" | "updatedAt">
>;

/** Create or patch the caller's single preferences row. An `undefined` field is removed on patch. */
async function upsertPreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: PreferenceFields
): Promise<void> {
  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const updatedAt = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, updatedAt });
  } else {
    await ctx.db.insert("userPreferences", { userId, ...fields, updatedAt });
  }
}

export const getMyPreferences = query({
  args: {},
  returns: v.union(v.object({ outputLanguage: v.optional(v.string()) }), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const getPreferencesByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ outputLanguage: v.optional(v.string()) }), v.null()),
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const setOutputLanguage = mutation({
  args: { outputLanguage: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!VALID_LANGUAGE_CODES.includes(args.outputLanguage)) {
      throw new ConvexError("Unsupported language code");
    }
    await upsertPreferences(ctx, userId, { outputLanguage: args.outputLanguage });
    return null;
  },
});

/**
 * The mobile app's AI data-sharing consent. `signedIn: false` lets the web gate tell an auth blip
 * (the shell re-authenticating) apart from a user who has never answered.
 */
export const getMyAiConsent = query({
  args: {},
  returns: v.union(
    v.object({ signedIn: v.literal(false) }),
    v.object({
      signedIn: v.literal(true),
      version: v.union(v.number(), v.null()),
      declined: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false as const };
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      signedIn: true as const,
      version: prefs?.aiConsentVersion ?? null,
      declined: prefs?.aiConsentDeclinedAt !== undefined,
    };
  },
});

export const grantAiConsent = mutation({
  args: { version: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!Number.isInteger(args.version) || args.version < 1) {
      throw new ConvexError("Invalid consent version");
    }
    await upsertPreferences(ctx, userId, {
      aiConsentVersion: args.version,
      aiConsentAt: Date.now(),
      aiConsentDeclinedAt: undefined,
    });
    return null;
  },
});

/** "Not now" on the consent screen and Turn off in the avatar menu. */
export const declineAiConsent = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    const now = Date.now();
    await upsertPreferences(ctx, userId, {
      aiConsentVersion: undefined,
      aiConsentAt: now,
      aiConsentDeclinedAt: now,
    });
    return null;
  },
});
