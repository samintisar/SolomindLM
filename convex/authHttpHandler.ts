"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createAuth } from "./authComponent";

/**
 * Node-only auth HTTP handler. Called from http.ts (isolate) so that
 * better-auth and its deps (semver, etc.) stay out of the isolate bundle.
 */
export const handle = internalAction({
  args: {
    url: v.string(),
    method: v.string(),
    headers: v.record(v.string(), v.string()),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: number; headers: Record<string, string>; body: string }> => {
    // Debug logging
    const url = new URL(args.url);
    const isOauthCallback = url.searchParams.has("ott") || url.pathname.includes("/callback");
    const isGetSession = url.pathname === "/auth/get-session";
    const isConvexToken = url.pathname === "/auth/convex/token";

    console.log("[AuthHandler] Incoming request:", {
      method: args.method,
      pathname: url.pathname,
      search: url.search,
      isOauthCallback,
      hasOtt: url.searchParams.has("ott"),
      isGetSession,
      isConvexToken,
    });

    // Log incoming cookies for debugging
    const cookieHeader = args.headers["cookie"] || args.headers["Cookie"] || "";
    console.log("[AuthHandler] Cookies:", cookieHeader ? "Present" : "None");
    if (cookieHeader) {
      const hasBetterAuthCookie = cookieHeader.includes("__Secure-better-auth") || cookieHeader.includes("better-auth.session_token");
      console.log("[AuthHandler] Has Better Auth cookie:", hasBetterAuthCookie);
    }

    const auth = createAuth(ctx as any);
    const request = new Request(args.url, {
      method: args.method,
      headers: new Headers(args.headers),
      body: args.method !== "GET" && args.method !== "HEAD" ? args.body : undefined,
    });

    let response: Response;
    try {
      response = await auth.handler(request);
    } catch (error) {
      console.error("[AuthHandler] Handler error:", error);
      throw error;
    }

    const body = await response.text();

    // Build headers object for response and logging
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Log response for OAuth callbacks
    if (isOauthCallback) {
      console.log("[AuthHandler] OAuth callback response:", {
        status: response.status,
        statusText: response.statusText,
        headers,
        hasSetCookie: "set-cookie" in headers || "Set-Cookie" in headers,
      });
    }

    // Log session response
    if (isGetSession) {
      try {
        const sessionData = JSON.parse(body);
        console.log("[AuthHandler] Get-session response:", {
          hasData: !!sessionData.data,
          hasUser: !!sessionData.data?.user,
          user: sessionData.data?.user,
        });
      } catch {
        console.log("[AuthHandler] Get-session body (not JSON):", body.substring(0, 200));
      }
    }

    // Log convex token response
    if (isConvexToken) {
      console.log("[AuthHandler] Convex token response:", {
        status: response.status,
        hasToken: body.includes("token"),
      });
      if (response.status !== 200) {
        console.log("[AuthHandler] Convex token error body:", body);
      }
    }

    return { status: response.status, headers, body };
  },
});
