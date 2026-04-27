import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { auth } from "./auth";

const http = httpRouter();

// Initialize Persistent Text Streaming
const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

// Add Convex Auth HTTP routes
auth.addHttpRoutes(http);

// CORS configuration - dev origins + SITE_URL from Convex (e.g. https://www.solomindlm.com, comma-separated for multiple).
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const getAllowedOrigins = (): string[] => {
  const siteUrl = process.env.SITE_URL || "http://localhost:5173";
  const fromEnv = siteUrl
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return [...new Set([...DEV_ORIGINS, ...fromEnv])];
};

// CORS for non-auth routes (health, chat/stream)
const getCorsHeaders = (origin?: string | null): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "origin",
  };
};

// ============================================================
// Stripe Webhook (Forward to Node Action)
// ============================================================

// GET so you can verify the endpoint is deployed (browser hits GET; Stripe sends POST)
http.route({
  path: "/stripe/webhook",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        message: "Stripe webhook endpoint. Stripe sends POST here.",
        method: "POST",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }),
});

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const payload = await request.text();

    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      await ctx.runAction(internal.billing.webhook.handleWebhook, {
        signature,
        payload,
      });

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("[Stripe webhook] Error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Webhook processing failed",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============================================================
// Health Check Endpoint
// ============================================================

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    return new Response(JSON.stringify({ status: "ok", timestamp: Date.now() }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }),
});

// ============================================================
// Audio Streaming Endpoint with Range Request Support
// ============================================================

// Authenticated audio playback by Convex storage ID.
// Requires a valid JWT via Authorization header (same as /chat/stream).
// Frontend resolves audio URLs to signed storage.getUrl links where possible;
// this endpoint serves as an authenticated fallback for legacy storage IDs.

// Handle OPTIONS preflight (Authorization header triggers CORS preflight)
http.route({
  path: "/audio/" + ":storageId",
  method: "OPTIONS",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }),
});

http.route({
  path: "/audio/" + ":storageId",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);
    const withCors = (extra: Record<string, string>) => ({ ...corsHeaders, ...extra });

    const errorResponse = (message: string, status: number) =>
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: withCors({ "Content-Type": "application/json" }),
      });

    // Auth check — same pattern as /chat/stream and /research/execute
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity?.subject) {
        return errorResponse("Authentication required", 401);
      }
    } catch (e) {
      console.warn("[Audio HTTP] getUserIdentity / OIDC verification failed:", e);
      return errorResponse("Session invalid or expired", 401);
    }

    // Extract storageId from URL path
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const storageId = pathParts[pathParts.length - 1] as any;

    try {
      const blob = await ctx.storage.get(storageId);

      if (blob === null) {
        return new Response("Audio file not found", {
          status: 404,
          headers: withCors({ "Content-Type": "text/plain" }),
        });
      }

      // Handle Range Requests for seeking
      const rangeHeader = request.headers.get("range");
      const fileSize = blob.size;

      if (rangeHeader) {
        // Parse Range header: "bytes=start-end"
        const ranges = rangeHeader.match(/bytes=(\d+)-(\d*)/);

        if (ranges) {
          const start = parseInt(ranges[1]);
          const end = ranges[2] ? parseInt(ranges[2]) : fileSize - 1;

          // Validate range
          if (start >= 0 && start < fileSize && end >= start && end < fileSize) {
            const chunkSize = end - start + 1;
            const chunk = blob.slice(start, end + 1);

            return new Response(chunk, {
              status: 206, // Partial Content
              headers: withCors({
                "Content-Type": blob.type || "audio/mpeg",
                "Content-Length": chunkSize.toString(),
                "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": "private, max-age=3600",
              }),
            });
          }
        }
      }

      // No Range header or invalid range - return entire file
      return new Response(blob, {
        status: 200,
        headers: withCors({
          "Content-Type": blob.type || "audio/mpeg",
          "Content-Length": fileSize.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        }),
      });
    } catch (error) {
      console.error("[Audio streaming] Error:", error);
      return new Response(JSON.stringify({ error: "Failed to serve audio file" }), {
        status: 500,
        headers: withCors({ "Content-Type": "application/json" }),
      });
    }
  }),
});

// ============================================================
// Chat Streaming Endpoint
// ============================================================

// Handle OPTIONS preflight
http.route({
  path: "/chat/stream",
  method: "OPTIONS",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }),
});

// Handle POST requests - using Persistent Text Streaming
http.route({
  path: "/chat/stream",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    // Helper for error responses with CORS
    const errorResponse = (message: string, status: number) => {
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    };

    // Simplified auth check with Convex Auth.
    // getUserIdentity() throws if the JWT is malformed, expired, or fails OIDC verification
    // (e.g. wrong issuer vs auth.config) — return 401 instead of a 5xx to the client.
    let userId: string | undefined;
    try {
      const identity = await ctx.auth.getUserIdentity();
      // Subject is "userId|sessionId", extract just the userId
      userId = identity?.subject?.split("|")[0];
    } catch (e) {
      console.warn("[Chat stream] getUserIdentity / OIDC verification failed:", e);
      return errorResponse("Session invalid or expired. Please log in again.", 401);
    }

    if (!userId) {
      return errorResponse("Please log in to use chat", 401);
    }

    try {
      // Parse request body
      let body;
      try {
        body = (await request.json()) as {
          notebookId: string;
          message: string;
          documentIds?: string[];
          conversationId?: string;
          /** Id of the user row from sendMessageOptimistic (required for research plan linkage). */
          userMessageId?: string;
          deepResearch?: boolean;
          sourcePolicy?: {
            channels: string[];
            domainAllowlist?: string[];
            dateRange?: { start: number; end: number };
            maxResultsPerChannel?: number;
            credibilityTier?: string;
            requirePrimarySources?: boolean;
            recencyDays?: number;
            dedupeStrategy?: string;
          };
        };
      } catch (_error) {
        return errorResponse("Invalid JSON body", 400);
      }

      const {
        notebookId,
        message,
        documentIds,
        conversationId: bodyConversationId,
        userMessageId: bodyUserMessageId,
        deepResearch,
        sourcePolicy,
      } = body;

      // Validate request
      if (!notebookId || typeof notebookId !== "string") {
        return errorResponse("Invalid notebookId", 400);
      }

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return errorResponse("Message is required", 400);
      }

      if (message.length > 10000) {
        return errorResponse("Message too long (max 10000 characters)", 400);
      }

      console.log("[Chat] Processing message for user:", userId);

      const canReadNotebook = await ctx.runQuery(internal.notebooks.index.canReadNotebookInternal, {
        notebookId: notebookId as any,
        userId: userId as any,
      });
      if (!canReadNotebook) {
        return errorResponse("Notebook not found", 404);
      }

      // Create persistent stream
      const streamId = await streaming.createStream(ctx);
      console.log("[Chat] Created stream:", streamId);

      // Conversation and user message already added by client via sendMessageOptimistic
      const _conversationId = await ctx.runMutation(internal.chat.index.ensureConversation, {
        notebookId: notebookId as any,
        userId: userId as any,
        conversationId: bodyConversationId ? (bodyConversationId as any) : undefined,
      });

      // Chunks are added *during* generation by the node action (runWithStreamId) via
      // batched components.persistentTextStreaming.lib.addChunk (time/size thresholds;
      // protocol lines like \n__REFERENCES flush immediately). We relay to the client by
      // polling getStreamText every 50ms and writing to the HTTP response. We do not use
      // streaming.stream() because after our streamWriter returns the component tries to
      // flush pending with addChunk, but the stream is already "done" → timeout error.
      await ctx.scheduler.runAfter(0, internal.chat.stream.runWithStreamId, {
        streamId,
        userId,
        notebookId,
        message,
        documentIds: documentIds ?? undefined,
        conversationId: bodyConversationId ? (bodyConversationId as any) : undefined,
        ...(sourcePolicy != null ? { sourcePolicy: sourcePolicy as any } : {}),
        ...(deepResearch === true
          ? {
              deepResearch: true,
              ...(bodyUserMessageId ? { userMessageId: bodyUserMessageId as any } : {}),
            }
          : {}),
      });

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const pollIntervalMs = 50;
      const maxWaitMs = 120_000;
      const start = Date.now();
      let lastLength = 0;

      (async () => {
        try {
          while (Date.now() - start < maxWaitMs) {
            const { text, status } = await ctx.runQuery(
              components.persistentTextStreaming.lib.getStreamText,
              { streamId }
            );
            if (text.length > lastLength) {
              await writer.write(encoder.encode(text.slice(lastLength)));
              lastLength = text.length;
            }
            if (status === "done" || status === "error" || status === "timeout") {
              break;
            }
            await new Promise((r) => setTimeout(r, pollIntervalMs));
          }
        } finally {
          await writer.close();
        }
      })();

      const response = new Response(readable);

      // Add CORS headers to the response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      console.error("[Chat route] Unexpected error:", error);
      const errorMessage = error instanceof Error ? error.message : "Internal server error";
      return errorResponse(errorMessage, 500);
    }
  }),
});

// ============================================================
// Deep Research Execute Endpoint
// ============================================================

http.route({
  path: "/research/execute",
  method: "OPTIONS",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }),
});

http.route({
  path: "/research/execute",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = getCorsHeaders(origin);

    const errorResponse = (message: string, status: number) =>
      new Response(JSON.stringify({ error: message }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    let userId: string | undefined;
    try {
      const identity = await ctx.auth.getUserIdentity();
      userId = identity?.subject?.split("|")[0];
    } catch (e) {
      console.warn("[Research execute] getUserIdentity / OIDC verification failed:", e);
      return errorResponse("Session invalid or expired. Please log in again.", 401);
    }
    if (!userId) return errorResponse("Please log in", 401);

    try {
      let body;
      try {
        body = (await request.json()) as { planId: string };
      } catch {
        return errorResponse("Invalid JSON body", 400);
      }

      const { planId } = body;
      if (!planId || typeof planId !== "string") {
        return errorResponse("planId is required", 400);
      }

      const plan = await ctx.runQuery(internal.research.index.getPlanInternal, {
        planId: planId as any,
      });
      if (!plan) return errorResponse("Plan not found", 404);
      if (plan.userId !== (userId as any)) return errorResponse("Not authorized", 403);
      if (plan.status !== "approved") return errorResponse("Plan not approved", 400);

      const latestRun = await ctx.runQuery(internal.research.index.getLatestResearchRunByPlan, {
        planId: planId as any,
      });

      const reusable =
        latestRun &&
        latestRun.streamId &&
        latestRun.status !== "failed" &&
        latestRun.status !== "cancelled";

      let streamId: string;
      let runId: any;

      if (reusable) {
        streamId = latestRun.streamId as string;
        runId = latestRun._id;
      } else {
        streamId = await streaming.createStream(ctx);
        runId = await ctx.runMutation(internal.research.index.createResearchRun, {
          planId: planId as any,
          userId,
          notebookId: plan.notebookId,
          conversationId: plan.conversationId,
          streamId,
        });

        await ctx.scheduler.runAfter(0, internal.chat.stream.runResearchExecute, {
          streamId,
          runId,
          userId,
        });
      }

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const pollIntervalMs = 50;
      const maxWaitMs = 180_000;
      const start = Date.now();
      let lastLength = 0;

      (async () => {
        try {
          while (Date.now() - start < maxWaitMs) {
            const { text, status } = await ctx.runQuery(
              components.persistentTextStreaming.lib.getStreamText,
              { streamId }
            );
            if (text.length > lastLength) {
              await writer.write(encoder.encode(text.slice(lastLength)));
              lastLength = text.length;
            }
            if (status === "done" || status === "error" || status === "timeout") break;
            await new Promise((r) => setTimeout(r, pollIntervalMs));
          }
        } finally {
          await writer.close();
        }
      })();

      const response = new Response(readable);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    } catch (error) {
      console.error("[Research Execute route] Unexpected error:", error);
      return errorResponse(
        error instanceof Error ? error.message : "Internal server error",
        500
      );
    }
  }),
});

export default http;
