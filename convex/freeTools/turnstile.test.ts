// convex/freeTools/turnstile.test.ts
import { describe, expect, test, vi } from "vitest";
import { TURNSTILE_SITEVERIFY_URL, verifyTurnstileToken } from "./turnstile";

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
});
