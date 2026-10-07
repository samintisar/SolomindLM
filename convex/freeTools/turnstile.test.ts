// convex/freeTools/turnstile.test.ts
import { describe, expect, test, vi } from "vitest";
import { SITEVERIFY_TIMEOUT_MS, TURNSTILE_SITEVERIFY_URL, verifyTurnstileToken } from "./turnstile";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("verifyTurnstileToken", () => {
  test("posts secret, token and IP to siteverify and accepts success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const result = await verifyTurnstileToken({
      token: "tok",
      secret: "sec",
      remoteIp: "203.0.113.9",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "sec", response: "tok", remoteip: "203.0.113.9" }),
      signal: expect.any(AbortSignal),
    });
  });

  test("omits remoteip when unknown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    await verifyTurnstileToken({ token: "tok", secret: "sec", remoteIp: null, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      secret: "sec",
      response: "tok",
    });
  });

  test("returns Cloudflare's error codes on failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl })).toEqual({
      ok: false,
      codes: ["timeout-or-duplicate"],
    });
  });

  test("treats HTTP errors and network failures as failures", async () => {
    const http = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: http })).toEqual({
      ok: false,
      codes: ["siteverify_http_500"],
    });
    const down = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: down })).toEqual({
      ok: false,
      codes: ["siteverify_unreachable"],
    });
  });

  test("treats a 200 with a non-JSON or null body as a failure instead of throwing", async () => {
    const html = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: html })).toEqual({
      ok: false,
      codes: ["siteverify_bad_response"],
    });
    const nul = vi.fn().mockResolvedValue(new Response("null", { status: 200 }));
    const result = await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: nul });
    expect(result.ok).toBe(false);
  });

  test("keeps only string error codes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, "error-codes": ["a", 5, null, "b"] }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl })).toEqual({
      ok: false,
      codes: ["a", "b"],
    });
    const notArray = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, "error-codes": "oops" }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: notArray })).toEqual({
      ok: false,
      codes: [],
    });
  });

  test("aborts a hung siteverify call after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const hung = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      );
      const pending = verifyTurnstileToken({
        token: "t",
        secret: "s",
        fetchImpl: hung as unknown as typeof fetch,
      });
      await vi.advanceTimersByTimeAsync(SITEVERIFY_TIMEOUT_MS);
      expect(await pending).toEqual({ ok: false, codes: ["siteverify_unreachable"] });
    } finally {
      vi.useRealTimers();
    }
  });
});
