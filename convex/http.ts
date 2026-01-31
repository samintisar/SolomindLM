import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { corsRouter } from "convex-helpers/server/cors";
import { auth } from "./auth";

const http = httpRouter();

// Initialize Persistent Text Streaming
const streaming = new PersistentTextStreaming(
  components.persistentTextStreaming
);

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
  const fromEnv = siteUrl.split(",").map((url) => url.trim()).filter(Boolean);
  return [...new Set([...DEV_ORIGINS, ...fromEnv])];
};

// CORS for non-auth routes (health, chat/stream)
const getCorsHeaders = (origin?: string | null): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins();
  const allowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "origin",
  };
};

// ============================================================
// Stripe Webhook (Forward to Node Action)
// ============================================================

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const payload = await request.text();

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      await ctx.runAction(internal.stripeWebhook.handleWebhook, {
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

    return new Response(
      JSON.stringify({ status: "ok", timestamp: Date.now() }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
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
      headers: corsHeaders
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
      return new Response(
        JSON.stringify({ error: message }),
        {
          status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    };

    // Simplified auth check with Convex Auth
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject;

    if (!userId) {
      return errorResponse("Please log in to use chat", 401);
    }

    try {
      // Parse request body
      let body;
      try {
        body = await request.json() as {
          notebookId: string;
          message: string;
          documentIds?: string[];
        };
      } catch (error) {
        return errorResponse("Invalid JSON body", 400);
      }

      const { notebookId, message, documentIds } = body;

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

      // Create persistent stream
      const streamId = await streaming.createStream(ctx);
      console.log("[Chat] Created stream:", streamId);

      // Conversation and user message already added by client via sendMessageOptimistic
      const conversationId = await ctx.runMutation(internal.chat.ensureConversation, {
        notebookId: notebookId as any,
        userId: userId as any,
      });

      // Chunks are added *during* generation by the node action (runWithStreamId) via
      // components.persistentTextStreaming.lib.addChunk for each token. We relay to the
      // client by polling getStreamText and writing to the HTTP response. We do not use
      // streaming.stream() because after our streamWriter returns the component tries to
      // flush pending with addChunk, but the stream is already "done" → timeout error.
      await ctx.scheduler.runAfter(0, internal.chatStreamAction.runWithStreamId, {
        streamId,
        userId,
        notebookId,
        message,
        documentIds: documentIds ?? undefined,
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

      let response = new Response(readable);

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

export default http;
