import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { allowedOrigins } from "./_lib/allowedOrigins";
import { MAX_CSP_REPORT_BYTES, parseCspReport } from "./_lib/cspReport";
import { createServiceLogger } from "./_lib/logging/serviceLogger";
import { auth } from "./auth";
import { handleFreeFlashcardsOptions, handleFreeFlashcardsPost } from "./freeTools/flashcardsHttp";

const http = httpRouter();

// Initialize Persistent Text Streaming
const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

// Add Convex Auth HTTP routes
auth.addHttpRoutes(http);

// CORS for non-auth routes (health, chat/stream). Allowlist = dev origins +
// SITE_URL (single canonical origin) + CORS_EXTRA_ORIGINS — see convex/_lib/allowedOrigins.ts.
const getCorsHeaders = (origin?: string | null): Record<string, string> => {
  const allowed = allowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
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
// CSP violation reports
// ============================================================

// Target of `report-uri` in the Content-Security-Policy header (apps/web/vercel.json). Lives under
// /api/ so Vercel proxies it same-origin to Convex — browsers send reports without CORS.
// Unauthenticated by design (browsers attach no credentials): the body is size-capped, validated
// and stripped of query strings by parseCspReport, then logged for the Log Stream. No DB writes.
// Filter log exports with: topic:service service:csp
http.route({
  path: "/api/csp-report",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    const declaredBytes = Number(request.headers.get("content-length") ?? 0);
    if (declaredBytes > MAX_CSP_REPORT_BYTES) return new Response(null, { status: 413 });

    // content-length can be absent or wrong (chunked), so cap the actual body too.
    const text = await request.text();
    if (text.length > MAX_CSP_REPORT_BYTES) return new Response(null, { status: 413 });

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }

    const violation = parseCspReport(body);
    if (violation) {
      createServiceLogger("csp", "report").warn("csp_violation", { ...violation });
    }
    // 204 even for dropped/noise reports: the browser should not retry or surface an error.
    return new Response(null, { status: 204 });
  }),
});

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
          attachedDocumentIds?: string[];
          conversationId?: string;
          sourcePolicy?: {
            channels: string[];
            domainAllowlist?: string[];
            dateRange?: { start: number; end: number };
            maxResultsPerChannel?: number;
            credibilityTier?: string;
            requirePrimarySources?: boolean;
            recencyDays?: number;
            dedupeStrategy?: string;
            academicFilters?: {
              publicationYearFrom?: number;
              publicationYearTo?: number;
              minCitations?: number;
              openAccessOnly?: boolean;
              hasFullText?: boolean;
              fieldOfStudyTerms?: string[];
            };
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

      if (!latestRun || !latestRun.streamId) {
        return errorResponse("Research run not found or not ready yet", 404);
      }

      const streamId = latestRun.streamId as string;

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const pollIntervalMs = 50;
      const maxWaitMs = 280_000; // ~4.7 min — stay under Convex's ~5 min action limit
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
      return errorResponse(error instanceof Error ? error.message : "Internal server error", 500);
    }
  }),
});

// ============================================================
// Free tools (anonymous, Turnstile + per-IP/global rate limits)
// ============================================================

http.route({
  path: "/tools/flashcards",
  method: "OPTIONS",
  handler: httpAction(handleFreeFlashcardsOptions),
});

http.route({
  path: "/tools/flashcards",
  method: "POST",
  handler: httpAction(handleFreeFlashcardsPost),
});

export default http;
