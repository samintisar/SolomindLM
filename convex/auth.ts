import Apple from "@auth/core/providers/apple";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { DEV_WEB_PORTS, extraOrigins, siteUrl } from "./_lib/allowedOrigins";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];

const LAN_HOSTNAME = /^192\.168\.\d{1,3}\.\d{1,3}$/;
/** Hosts a browser on the dev machine reaches a local web dev server on. */
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const NATIVE_APP_SCHEME = /^solomindlm:\/\//;
const EXPO_DEV_SCHEME = /^exp:\/\//;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** A plain-http URL with no userinfo, or null. */
function parsePlainHttpUrl(url: string): URL | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const { protocol, username, password } = parsed;
  return protocol === "http:" && !username && !password ? parsed : null;
}

/** True for a Vite dev server on the LAN: plain http, a `192.168.x.x` host, a dev web port. */
function isLanDevServerUrl(url: string): boolean {
  const parsed = parsePlainHttpUrl(url);
  if (!parsed || !LAN_HOSTNAME.test(parsed.hostname)) return false;
  const port = Number(parsed.port);
  return port >= DEV_WEB_PORTS.first && port <= DEV_WEB_PORTS.last;
}

/** True for a dev server on this machine: plain http, `localhost` / `127.0.0.1`, any port. */
function isLocalhostUrl(url: string): boolean {
  const parsed = parsePlainHttpUrl(url);
  return !!parsed && LOCALHOST_HOSTNAMES.has(parsed.hostname);
}

/**
 * A dev deployment: `SITE_URL` itself is a plain-http localhost origin. Production sets an
 * https `SITE_URL`, so this is false there. Pass `siteUrl()`, which falls back to
 * `http://localhost:5173` when `SITE_URL` is unset, so a deployment without it
 * (e.g. a preview) counts as dev.
 */
export function isLocalDevSite(site: string): boolean {
  return isLocalhostUrl(site);
}

/**
 * Compares parsed origins, never string prefixes: `https://<base>@evil.com` and
 * `https://<base>.evil.com` start with a base as strings but resolve to another host.
 */
function hasAllowedOrigin(url: string, bases: string[]): boolean {
  const parsed = parseUrl(url);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return false;
  return bases.some((base) => parseUrl(base)?.origin === parsed.origin);
}

interface RedirectPolicy {
  /**
   * Accept Expo Go (`exp://`), LAN Vite dev server targets, and `localhost` / `127.0.0.1` on
   * any port (so OAuth returns to the worktree dev server that started it). Dev deployments
   * only: on production they would hand the OAuth `?code=` to whoever holds that LAN IP,
   * Expo project or local port.
   */
  allowDevTargets?: boolean;
}

export function isAllowedRedirect(
  redirectTo: string,
  bases: string[],
  { allowDevTargets = false }: RedirectPolicy = {}
): boolean {
  if (NATIVE_APP_SCHEME.test(redirectTo)) {
    return true;
  }

  if (
    allowDevTargets &&
    (EXPO_DEV_SCHEME.test(redirectTo) ||
      isLanDevServerUrl(redirectTo) ||
      isLocalhostUrl(redirectTo))
  ) {
    return true;
  }

  if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
    return true;
  }

  return hasAllowedOrigin(redirectTo, bases);
}

/**
 * `@convex-dev/auth`'s Password provider throws plain `Error`s for these known,
 * user-facing conditions (see `retrieveAccount` / `Password.ts` in
 * node_modules/@convex-dev/auth). Convex redacts plain Error messages in
 * production, so the curated copy in authErrorMessage.ts on the client never
 * matched anything there. Rethrowing as ConvexError preserves `.data` to the
 * client even in production, restoring those mappings.
 *
 * `InvalidAccountId` and `InvalidSecret` both collapse to "Invalid credentials"
 * so the client can't tell unregistered emails from wrong passwords.
 */
const KNOWN_PASSWORD_ERROR_MESSAGES = new Map([
  ["InvalidAccountId", "Invalid credentials"],
  ["InvalidSecret", "Invalid credentials"],
  ["TooManyFailedAttempts", "TooManyFailedAttempts"],
  ["Invalid code", "Invalid code"],
  ["Invalid password", "Invalid password"],
  ["Invalid credentials", "Invalid credentials"],
]);

interface PasswordProviderInternals {
  options: {
    authorize: (params: Record<string, unknown>, ctx: unknown) => Promise<unknown>;
  };
}

function withKnownErrorsAsConvexErrors<T>(provider: T): T {
  const internals = provider as unknown as PasswordProviderInternals;
  const authorize = internals.options.authorize;
  internals.options.authorize = async (params, ctx) => {
    try {
      return await authorize(params, ctx);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      // A reset request for an unknown email must look like a successful one
      // (which also resolves to null once the reset code is "sent").
      if (params.flow === "reset" && error.message === "InvalidAccountId") {
        return null;
      }
      const message = KNOWN_PASSWORD_ERROR_MESSAGES.get(error.message);
      if (message !== undefined) {
        throw new ConvexError(message);
      }
      throw error;
    }
  };
  return provider;
}

/**
 * Sign in with Apple needs an Apple Services ID and a client-secret JWT (valid for at
 * most 6 months). Until both are set it stays off, and the sign-in UI hides its button.
 */
function isAppleSignInConfigured(): boolean {
  return Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    ...(isAppleSignInConfigured()
      ? [
          Apple({
            clientId: process.env.AUTH_APPLE_ID,
            clientSecret: process.env.AUTH_APPLE_SECRET,
            // Apple sends the name only on the first sign-in, and never an image.
            profile: (appleInfo) => {
              const name = appleInfo.user
                ? `${appleInfo.user.name.firstName} ${appleInfo.user.name.lastName}`.trim()
                : undefined;
              return { id: appleInfo.sub, name: name || undefined, email: appleInfo.email };
            },
          }),
        ]
      : []),
    withKnownErrorsAsConvexErrors(Password({ verify: ResendOTP, reset: ResendOTPPasswordReset })),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      const bases = [siteUrl(), ...extraOrigins(), ...MOBILE_DEV_WEB_ORIGINS];

      const allowDevTargets = isLocalDevSite(bases[0]);

      if (!isAllowedRedirect(redirectTo, bases, { allowDevTargets })) {
        throw new Error(`Invalid redirectTo ${redirectTo} for SITE_URL ${process.env.SITE_URL}`);
      }

      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${bases[0]}${redirectTo}`;
      }

      return redirectTo;
    },
  },
});

/** Which optional sign-in methods the sign-in screen should offer. */
export const getSignInOptions = query({
  args: {},
  returns: v.object({ apple: v.boolean() }),
  handler: async () => ({ apple: isAppleSignInConfigured() }),
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
  /** Profile photo URL (Google `picture`, stored by Convex Auth as `users.image`). */
  image: v.optional(v.string()),
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
        image: user.image ?? undefined,
      };
    } catch (e) {
      console.error("getCurrentUser", e);
      return null;
    }
  },
});
