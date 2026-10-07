// convex/freeTools/flashcardsHttp.test.ts
/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { invokeStructuredOutput } from "../_agents/_shared/structuredLlm";
import {
  FREE_FLASHCARD_GLOBAL_DAILY_ATTEMPTS,
  FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
  FREE_FLASHCARD_IP_DAILY_ATTEMPTS,
  FREE_FLASHCARD_LLM_PHASE,
  FREE_FLASHCARD_MAX_BODY_BYTES,
  FREE_FLASHCARD_MIN_WORDS,
} from "../_lib/freeToolBounds";
import { rateLimiter } from "../_lib/rateLimits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

vi.mock("../_agents/_shared/structuredLlm", () => ({ invokeStructuredOutput: vi.fn() }));

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./http.ts",
  "./freeTools/flashcards.ts",
  "./freeTools/flashcardsHttp.ts",
  "./freeTools/rateLimit.ts",
]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

const TEXT = `# Cell energy\n${Array.from({ length: FREE_FLASHCARD_MIN_WORDS + 20 }, (_, i) => `word${i}`).join(" ")}`;
const CARDS = Array.from({ length: 25 }, (_, i) => ({
  type: "wh-question",
  front: `What is distinct fact number ${i} about mitochondria?`,
  back: `Fact ${i}`,
  topic: "Biology",
}));

function makeT() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

const siteverify = vi.fn();

/** A fresh Response per call: a Response body can only be read once. */
function siteverifyReturns(body: unknown) {
  siteverify.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
}

function post(
  t: ReturnType<typeof makeT>,
  body: unknown,
  ip = "203.0.113.9",
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  return t.fetch("/tools/flashcards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      "x-forwarded-for": ip,
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = { text: TEXT, cardCount: 20, turnstileToken: "tok" };

beforeEach(() => {
  // restoreAllMocks does not reset call history on module-level vi.fn()s; clear it per test.
  vi.clearAllMocks();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
  vi.stubEnv("FREE_TOOL_IP_SALT", "test-salt");
  siteverifyReturns({ success: true });
  vi.stubGlobal("fetch", siteverify);
  vi.mocked(invokeStructuredOutput).mockResolvedValue({ flashcards: CARDS });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /tools/flashcards", () => {
  test("returns a titled deck of at most cardCount cards with CORS headers", async () => {
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const body = await res.json();
    expect(body.title).toBe("Cell energy");
    expect(body.cards).toHaveLength(20);
    expect(body.cards[0]).toMatchObject({ front: expect.any(String), back: expect.any(String) });
  });

  test("answers the CORS preflight", async () => {
    const t = makeT();
    const res = await t.fetch("/tools/flashcards", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("400 on invalid JSON and on short text, without calling Turnstile", async () => {
    const t = makeT();
    expect((await post(t, "{not json")).status).toBe(400);
    const short = await post(t, { ...validBody, text: "too short" });
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "text_too_short" });
    expect(siteverify).not.toHaveBeenCalled();
  });

  test("413 when the body is over the byte cap", async () => {
    const t = makeT();
    const res = await post(t, { ...validBody, text: "x".repeat(250_000) });
    expect(res.status).toBe(413);
  });

  test("accepts ~11k words of a 3-byte-per-character script: the byte header cap is not the real cap", async () => {
    const text = "नमस्ते दुनिया ".repeat(5_500);
    // Sanity: it would have tripped a header precheck sized in characters.
    expect(new TextEncoder().encode(text).length).toBeGreaterThan(FREE_FLASHCARD_MAX_BODY_BYTES);
    const t = makeT();
    const body = JSON.stringify({ ...validBody, text });
    // Real clients send content-length; the precheck must not 413 on bytes alone.
    const res = await post(t, body, "203.0.113.9", {
      "content-length": String(new TextEncoder().encode(body).length),
    });
    expect(res.status).toBe(200);
  });

  test("403 when Turnstile rejects the token, without generating", async () => {
    siteverifyReturns({ success: false, "error-codes": ["invalid-input-response"] });
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "captcha_failed" });
    expect(invokeStructuredOutput).not.toHaveBeenCalled();
  });

  test("429 ip after 3 successful runs; a spoofed first hop does not reset it", async () => {
    const t = makeT();
    for (let i = 0; i < 3; i++) {
      expect((await post(t, validBody, `10.0.0.${i}, 203.0.113.9`)).status).toBe(200);
    }
    const res = await post(t, validBody, "10.9.9.9, 203.0.113.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "ip" });
  });

  test("a different IP is not affected by another IP's limit", async () => {
    const t = makeT();
    for (let i = 0; i < 3; i++) await post(t, validBody, "203.0.113.9");
    expect((await post(t, validBody, "198.51.100.7")).status).toBe(200);
  });

  test("429 global when the daily cap is used up", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await rateLimiter.limit(ctx, "freeToolFlashcardsGlobal", {
        count: FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
      });
    });
    const res = await post(t, validBody);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "global" });
  });

  test("a failed generation returns 502 and does not consume the success limit", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValueOnce(new Error("upstream 500"));
    const t = makeT();
    const failed = await post(t, validBody);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "generation_failed" });
    for (let i = 0; i < 3; i++) expect((await post(t, validBody)).status).toBe(200);
    const fourth = await post(t, validBody);
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toMatchObject({ error: "rate_limited", scope: "ip" });
  });

  test("failed generations count as attempts: the 7th request from one IP is refused", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValue(new Error("upstream 500"));
    const t = makeT();
    for (let i = 0; i < FREE_FLASHCARD_IP_DAILY_ATTEMPTS; i++) {
      expect((await post(t, validBody)).status).toBe(502);
    }
    const res = await post(t, validBody);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "ip" });
    expect(invokeStructuredOutput).toHaveBeenCalledTimes(FREE_FLASHCARD_IP_DAILY_ATTEMPTS);
  });

  test("429 global without an LLM call when the global attempts cap is used up", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await rateLimiter.limit(ctx, "freeToolFlashcardsGlobalAttempts", {
        count: FREE_FLASHCARD_GLOBAL_DAILY_ATTEMPTS,
      });
    });
    const res = await post(t, validBody);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "global" });
    expect(invokeStructuredOutput).not.toHaveBeenCalled();
  });

  test("a timeout returns 504", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValueOnce(
      new Error(`${FREE_FLASHCARD_LLM_PHASE} timeout after 90000ms`)
    );
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "timeout" });
  });

  test("an unrelated error that mentions a timeout is a 502, not a 504", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValueOnce(new Error("upstream socket timeout"));
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "generation_failed" });
  });

  test("503 when the server is not configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const t = makeT();
    expect((await post(t, validBody)).status).toBe(503);
  });
});
