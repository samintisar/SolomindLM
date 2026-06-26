import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

const LAN_VITE_ORIGIN = /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?/;
const NATIVE_APP_SCHEME = /^solomindlm:\/\//;
const EXPO_DEV_SCHEME = /^exp:\/\//;

function siteUrlBases(): string[] {
  const raw = process.env.SITE_URL ?? "http://localhost:5173";
  return raw
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isAllowedRedirect(redirectTo: string, bases: string[]): boolean {
  if (NATIVE_APP_SCHEME.test(redirectTo) || EXPO_DEV_SCHEME.test(redirectTo)) {
    return true;
  }

  if (LAN_VITE_ORIGIN.test(redirectTo)) {
    return true;
  }

  for (const origin of MOBILE_DEV_WEB_ORIGINS) {
    if (redirectTo === origin || redirectTo.startsWith(`${origin}/`)) {
      return true;
    }
  }

  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
    return true;
  }

  for (const base of bases) {
    if (!redirectTo.startsWith(base)) continue;
    const after = redirectTo[base.length];
    if (after === undefined || after === "?" || after === "/") {
      return true;
    }
  }

  return false;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Password({ verify: ResendOTP, reset: ResendOTPPasswordReset }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      const bases = [...siteUrlBases(), ...MOBILE_DEV_WEB_ORIGINS];

      if (!isAllowedRedirect(redirectTo, bases)) {
        throw new Error(`Invalid redirectTo ${redirectTo} for SITE_URL ${process.env.SITE_URL}`);
      }

      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${bases[0]}${redirectTo}`;
      }

      return redirectTo;
    },
  },
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
const currentUserValidator = v.object({
  id: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(v.null(), currentUserValidator),
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
    } catch (e) {
      console.error("getCurrentUser", e);
      return null;
    }
  },
});
