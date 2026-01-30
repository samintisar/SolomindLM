import { query, type QueryCtx, type MutationCtx, type ActionCtx } from "./_generated/server";

/**
 * Auth utilities for queries/mutations/actions (isolate runtime).
 * Uses Convex native auth - better-auth is only used in HTTP routes.
 */

/**
 * Get the authenticated user's ID using Convex native auth.
 * Better-Auth sets the identity subject field with the user ID.
 */
export const getAuthUserId = async (ctx: QueryCtx | MutationCtx | ActionCtx): Promise<string | null> => {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Better-Auth stores user ID in the subject field
    return identity.subject;
  } catch {
    return null;
  }
};

/**
 * Get current user with profile data
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    try {
      // Use Convex native auth instead of better-auth
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return null;

      return {
        id: identity.subject,
        email: identity.email ?? undefined,
        name: identity.name ?? undefined,
      };
    } catch {
      return null;
    }
  },
});
