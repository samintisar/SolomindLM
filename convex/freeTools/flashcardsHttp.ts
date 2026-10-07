// convex/freeTools/flashcardsHttp.ts
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { allowedOrigins } from "../_lib/allowedOrigins";
import {
  countWords,
  FREE_FLASHCARD_LLM_PHASE,
  FREE_FLASHCARD_MAX_BODY_BYTES,
  FREE_FLASHCARD_MAX_BODY_UTF8_BYTES,
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

/** The body as text, or null once it passes `maxBytes`: stops reading rather than buffering it all. */
async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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
 * Each LLM call reserves an attempt first (the hard cost bound, failures included); the
 * success limits are consumed only after cards were generated. Raw IPs are never logged or stored.
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
  if (declaredBytes > FREE_FLASHCARD_MAX_BODY_UTF8_BYTES) return json(413, { error: "too_large" });
  // The header can be missing or wrong (chunked uploads), so the read itself is capped too.
  const raw = await readBodyCapped(request, FREE_FLASHCARD_MAX_BODY_UTF8_BYTES);
  // `raw.length` counts characters, so this is the real cap regardless of script.
  if (raw === null || raw.length > FREE_FLASHCARD_MAX_BODY_BYTES) {
    return json(413, { error: "too_large" });
  }

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
  if (ip === null) {
    // Without an address every caller would share one per-IP bucket; refuse loudly instead.
    logger.error("client_ip_unknown", undefined, { xffHops: hops });
    return json(503, { error: "unavailable" });
  }
  const turnstile = await verifyTurnstileToken({ token: turnstileToken, secret, remoteIp: ip });
  if (!turnstile.ok) {
    logger.warn("turnstile_rejected", { codes: turnstile.codes });
    return json(403, { error: "captcha_failed" });
  }

  const ipKey = await hashClientIp(ip, salt);
  const limit = await ctx.runMutation(internal.freeTools.rateLimit.reserveFreeFlashcardRun, {
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
    });
    return json(200, deck);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Only our own deadline (invokeWithTimeout's sentinel) is a 504; other errors are upstream failures.
    const timedOut = message.includes(`${FREE_FLASHCARD_LLM_PHASE} timeout after`);
    logger.warn("generation_failed", { message, timedOut, durationMs: Date.now() - startedAt });
    return json(timedOut ? 504 : 502, { error: timedOut ? "timeout" : "generation_failed" });
  }
}
