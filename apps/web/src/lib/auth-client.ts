import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

// VITE_CONVEX_SITE_URL is the Convex deployment's .convex.site URL
// Required for auth to work (e.g. https://xxx.convex.site)
const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string;

if (!convexSiteUrl) {
  throw new Error(
    "VITE_CONVEX_SITE_URL environment variable is required. " +
    "Set it in .env.local for dev or in your hosting platform for prod."
  );
}

export const authBaseURL = `${convexSiteUrl.replace(/\/$/, "")}/auth`;

export const authClient = createAuthClient({
  baseURL: authBaseURL,
  plugins: [
    convexClient(),
    crossDomainClient(),
  ],
  fetchOptions: {
    credentials: "include",
    // Do NOT set mode explicitly - let Better Auth handle CORS properly
  },
});
