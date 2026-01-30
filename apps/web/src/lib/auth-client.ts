import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

// Convex .convex.site does not route /api/* to custom httpRouter; use /auth so our routes match.
// In dev, use same-origin so Vite proxy forwards /auth to Convex (avoids CORS preflight issues).
const siteUrl = (import.meta.env.VITE_CONVEX_SITE_URL as string) ?? "";
const devOrigin =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
const baseURL = import.meta.env.DEV
  ? `${devOrigin}/auth`
  : siteUrl.endsWith("/auth")
    ? siteUrl
    : `${siteUrl.replace(/\/$/, "")}/auth`;

export const authClient = createAuthClient({
  baseURL,
  plugins: [convexClient(), crossDomainClient()],
  fetchOptions: {
    credentials: "include", // Required for CORS with cookies
  },
});
