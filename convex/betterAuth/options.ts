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

export function createAuthOptions(): BetterAuthOptions {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error("SITE_URL environment variable is required");
  }
  // Auth API lives on Convex; links in emails (verify-email, reset-password) must point here.
  // CONVEX_SITE_URL is provided by Convex at runtime (built-in); fallback to SITE_URL if missing.
  const authBaseUrl = process.env.CONVEX_SITE_URL ?? siteUrl;

  return {
    baseURL: authBaseUrl,
    // Convex .convex.site does not route /api/* to custom httpRouter; use /auth to match client
    basePath: "/auth",
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
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
  };
}
