import { convexAuth } from "@convex-dev/auth/server";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { query, type QueryCtx, type MutationCtx, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Password({ verify: ResendOTP, reset: ResendOTPPasswordReset }),
  ],
});

/**
 * Auth utilities for queries/mutations/actions.
 * Uses Convex Auth (@convex-dev/auth).
 */

const AUTH_SUB_DIVIDER = "|";

/**
 * Get the authenticated user's ID using Convex Auth.
 * Convex Auth stores subject as "userId|sessionId"; we need the userId part.
 */
export const getAuthUserId = async (
  ctx: QueryCtx | MutationCtx | ActionCtx
): Promise<Id<"users"> | null> => {
  try {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    const [userId] = identity.subject.split(AUTH_SUB_DIVIDER);
    return (userId ?? null) as Id<"users"> | null;
  } catch (error) {
    console.error("Auth error:", error);
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
      const identity = await ctx.auth.getUserIdentity();
      if (!identity?.subject) return null;

      // Subject is "userId|sessionId"; we need the userId to fetch the user document
      const [userId] = identity.subject.split(AUTH_SUB_DIVIDER);
      if (!userId) return null;

      const user = await ctx.db.get(userId as Id<"users">);
      if (!user) return null;

      return {
        id: user._id.toString(),
        email: user.email ?? undefined,
        name: user.name ?? undefined,
      };
    } catch {
      return null;
    }
  },
});
