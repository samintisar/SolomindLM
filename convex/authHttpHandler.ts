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
    const auth = createAuth(ctx as any);
    const request = new Request(args.url, {
      method: args.method,
      headers: new Headers(args.headers),
      body: args.method !== "GET" && args.method !== "HEAD" ? args.body : undefined,
    });
    const response = await auth.handler(request);
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return { status: response.status, headers, body };
  },
});
