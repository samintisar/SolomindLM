// convex/freeTools/flashcardsHttp.ts
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { allowedOrigins } from "../_lib/allowedOrigins";
import {
  countWords,
  FREE_FLASHCARD_MAX_BODY_BYTES,
  parseFreeFlashcardRequest,
} from "../_lib/freeToolBounds";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { clientIpFromHeaders, forwardedForHopCount, hashClientIp } from "./clientIp";
import { verifyTurnstileToken } from "./turnstile";

/** Anonymous endpoint: no credentials, so no Allow-Credentials and only Content-Type allowed. */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "origin",
  };
}

export async function handleFreeFlashcardsOptions(
  _ctx: ActionCtx,
  request: Request
): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/**
 * POST /tools/flashcards — the free no-signup flashcard tool.
 * Order matters for cost: cheap validation → Turnstile → rate limits → one LLM call.
 * Limits are consumed only after cards were generated. Raw IPs are never logged or stored.
 */
export async function handleFreeFlashcardsPost(
  ctx: ActionCtx,
  request: Request
): Promise<Response> {
  const headers = corsHeaders(request.headers.get("origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  const logger = createServiceLogger("free_tools", "flashcards");

  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (declaredBytes > FREE_FLASHCARD_MAX_BODY_BYTES) return json(413, { error: "too_large" });
  const raw = await request.text();
  if (raw.length > FREE_FLASHCARD_MAX_BODY_BYTES) return json(413, { error: "too_large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const parsed = parseFreeFlashcardRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { text, cardCount, turnstileToken } = parsed.value;

  // Read at call time (not the env.ts snapshot) so a rotated secret applies without a redeploy.
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const salt = process.env.FREE_TOOL_IP_SALT;
  if (!secret || !salt) {
    logger.error("free_tool_not_configured", undefined, { secret: !!secret, salt: !!salt });
    return json(503, { error: "unavailable" });
  }

  const ip = clientIpFromHeaders(request.headers);
  const hops = forwardedForHopCount(request.headers);
  const turnstile = await verifyTurnstileToken({ token: turnstileToken, secret, remoteIp: ip });
  if (!turnstile.ok) {
    logger.warn("turnstile_rejected", { codes: turnstile.codes });
    return json(403, { error: "captcha_failed" });
  }

  const ipKey = await hashClientIp(ip ?? "unknown", salt);
  const limit = await ctx.runMutation(internal.freeTools.rateLimit.checkFreeFlashcardLimits, {
    ipKey,
  });
  if (!limit.ok) {
    logger.info("rate_limited", { scope: limit.scope });
    return json(429, {
      error: "rate_limited",
      scope: limit.scope,
      retryAfterMs: limit.retryAfterMs,
    });
  }

  const startedAt = Date.now();
  try {
    const deck = await ctx.runAction(internal.freeTools.flashcards.generate, { text, cardCount });
    await ctx.runMutation(internal.freeTools.rateLimit.consumeFreeFlashcardLimits, { ipKey });
    logger.info("generated", {
      cards: deck.cards.length,
      requested: cardCount,
      words: countWords(text),
      durationMs: Date.now() - startedAt,
      xffHops: hops,
      ipKnown: ip !== null,
    });
    return json(200, deck);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.includes("timeout");
    logger.warn("generation_failed", { message, timedOut, durationMs: Date.now() - startedAt });
    return json(timedOut ? 504 : 502, { error: timedOut ? "timeout" : "generation_failed" });
  }
}
