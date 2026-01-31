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
    const isOttVerify = url.pathname === "/auth/cross-domain/one-time-token/verify";

    console.log("[AuthHandler] Incoming request:", {
      method: args.method,
      pathname: url.pathname,
      search: url.search,
      isOauthCallback,
      hasOtt: url.searchParams.has("ott"),
      isGetSession,
      isConvexToken,
      isOttVerify,
    });

    // Log incoming cookies for debugging
    const cookieHeader = args.headers["cookie"] || args.headers["Cookie"] || "";
    const betterAuthCookieHeader = args.headers["better-auth-cookie"] || args.headers["Better-Auth-Cookie"] || "";
    console.log("[AuthHandler] Cookies:", {
      browserCookie: cookieHeader ? "Present" : "None",
      betterAuthCookie: betterAuthCookieHeader ? "Present" : "None",
      betterAuthCookiePreview: betterAuthCookieHeader ? betterAuthCookieHeader.substring(0, 100) : undefined,
    });

    // CRITICAL FIX: Convert Better-Auth-Cookie header to standard Cookie header
    // Better Auth only reads from the "cookie" header, not from custom headers
    // The cross-domain plugin sends cookies via "Better-Auth-Cookie" header for cross-origin requests
    // We need to convert it to the standard format that Better Auth expects
    const requestHeaders = new Headers(args.headers);

    if (betterAuthCookieHeader) {
      // Parse the Better-Auth-Cookie header value
      // Format: "; __Secure-better-auth.session_token=VAL; __Secure-better-auth.state=VAL"
      const cookieValue = betterAuthCookieHeader
        .split(';')
        .map(c => c.trim())
        .filter(c => c && !c.startsWith(';')) // Remove empty strings and leading semicolons
        .join('; ');

      // Combine with existing browser cookies (if any)
      const combinedCookies = cookieHeader
        ? `${cookieHeader}; ${cookieValue}`
        : cookieValue;

      requestHeaders.set('cookie', combinedCookies);
      console.log("[AuthHandler] Converted Better-Auth-Cookie to Cookie header", {
        combinedCookiesPreview: combinedCookies.substring(0, 150),
      });
    }

    const auth = createAuth(ctx as any);
    const request = new Request(args.url, {
      method: args.method,
      headers: requestHeaders,
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

    // Log OTT verify response
    if (isOttVerify) {
      console.log("[AuthHandler] OTT verify response:", {
        status: response.status,
        statusText: response.statusText,
        headers,
        hasSetBetterAuthCookie: Object.keys(headers).some(k =>
          k.toLowerCase().includes("set-better-auth-cookie")
        ),
        bodyPreview: body.substring(0, 500),
      });
    }

    return { status: response.status, headers, body };
  },
});
