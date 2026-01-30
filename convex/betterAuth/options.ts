"use node";

import type { BetterAuthOptions } from "better-auth/minimal";
import {
  CONFIRM_SIGNUP_HTML,
  RESET_PASSWORD_HTML,
  fillTemplate,
} from "./emailTemplates";

const FROM = "SolomindLM <noreply@solomindlm.com>";

async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!response.ok) {
      const error = await response.text();
      console.error("Resend error:", error);
    }
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

export function createAuthOptions(): BetterAuthOptions {
  // BETTER_AUTH_URL is the Convex site URL for auth (e.g. https://xxx.convex.site/auth)
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  // SITE_URL is the frontend origin (e.g. http://localhost:5173 or https://solomindlm.com)
  const siteUrl = process.env.SITE_URL;

  if (!betterAuthUrl) {
    throw new Error("BETTER_AUTH_URL environment variable is required");
  }
  if (!siteUrl) {
    throw new Error("SITE_URL environment variable is required");
  }

  // Secret is critical for cookie signing (OAuth state, session tokens, etc.)
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  // Determine if we're in dev based on the site URL
  const isDev = siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1');

  // Build trusted origins list
  const siteUrls = siteUrl.split(",").map((u) => u.trim()).filter(Boolean);
  const trustedOrigins = isDev
    ? [...new Set([...DEV_ORIGINS, ...siteUrls])]
    : siteUrls;

  // Debug: verify Google OAuth env vars are present (Convex dashboard: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
  // Run `npx convex logs --prod --watch` and trigger sign-in to see this.
  const hasGoogleId = !!process.env.GOOGLE_CLIENT_ID;
  const hasGoogleSecret = !!process.env.GOOGLE_CLIENT_SECRET;
  if (!hasGoogleId || !hasGoogleSecret) {
    console.warn(
      "[Better Auth] Google OAuth env: GOOGLE_CLIENT_ID=" + (hasGoogleId ? "set" : "MISSING") +
        ", GOOGLE_CLIENT_SECRET=" + (hasGoogleSecret ? "set" : "MISSING") +
        ". Set them in Convex Dashboard → Settings → Environment Variables for this deployment."
    );
  }

  // Allowed callback URLs for OAuth. Any path on these origins is allowed (e.g. https://www.solomindlm.com/home).
  // Frontend passes callbackURL: window.location.href in signIn.social(); Better Auth validates origin against trustedOrigins.
  // Note: trustedOrigins is already computed above

  return {
    baseURL: betterAuthUrl,
    // Secret for signing cookies (OAuth state, session tokens, etc.)
    secret,
    // Convex .convex.site does not route /api/* to custom httpRouter; use /auth to match client
    basePath: "/auth",
    trustedOrigins,
    // Session cookie cache: disabled during debugging to avoid stale session issues
    session: {
      cookieCache: {
        enabled: false, // Disable until auth is stable
      },
    },
    // Cookie configuration for cross-origin OAuth (localhost → Convex)
    advanced: {
      useSecureCookies: true, // Always true for Convex (HTTPS)
      // Critical fix for state_mismatch error: allow cookies in cross-origin context
      defaultCookieAttributes: {
        sameSite: "none", // Required for cross-origin (localhost → Convex)
        secure: true, // Required when sameSite is "none"
        path: "/", // Make cookies available to all paths
        httpOnly: true, // Security: prevent JS access
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const html = fillTemplate(CONFIRM_SIGNUP_HTML, {
          confirmationUrl: url,
          siteUrl,
        });
        await sendEmailViaResend(
          user.email,
          "Welcome to SolomindLM - Confirm Your Email",
          html
        );
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        const html = fillTemplate(RESET_PASSWORD_HTML, {
          confirmationUrl: url,
          siteUrl,
        });
        await sendEmailViaResend(
          user.email,
          "Reset your SolomindLM password",
          html
        );
      },
    },
    // Google OAuth: add this EXACT redirect URI in Google Cloud Console to fix redirect_uri_mismatch:
    //   Production: https://<your-convex-site>.convex.site/auth/callback/google  (e.g. tame-gecko-736.convex.site)
    //   Dev:       https://<dev-deployment>.convex.site/auth/callback/google
    // Console → APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
  };
}
