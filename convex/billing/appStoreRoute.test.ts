/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ExternalServiceError } from "../_lib/errors";
import schema from "../schema";

const { verifyTransaction, verifyNotification } = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  verifyNotification: vi.fn(),
}));

vi.mock("./appStoreVerifier", () => {
  class AppStoreVerificationError extends Error {}
  return { AppStoreVerificationError, verifyTransaction, verifyNotification };
});

const { AppStoreVerificationError } = await import("./appStoreVerifier");

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const JWS = "aaa.bbb.ccc";
const post = (t: ReturnType<typeof convexTest>, body: string) =>
  t.fetch("/appstore/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
const withPayload = (signedPayload: unknown) => JSON.stringify({ signedPayload });

beforeEach(() => {
  verifyNotification.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /appstore/notifications", () => {
  test("400 for a missing or non-string signedPayload", async () => {
    const t = convexTest(schema, modules);
    expect((await post(t, JSON.stringify({}))).status).toBe(400);
    expect((await post(t, withPayload(42))).status).toBe(400);
    expect((await post(t, "null")).status).toBe(400);
    expect(verifyNotification).not.toHaveBeenCalled();
  });

  test("400 for malformed JSON", async () => {
    const t = convexTest(schema, modules);
    expect((await post(t, "{not json")).status).toBe(400);
  });

  test("413 for an oversized body", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, withPayload("a".repeat(64 * 1024)));
    expect(res.status).toBe(413);
  });

  test("400 for a payload that is not a three-part JWS", async () => {
    const t = convexTest(schema, modules);
    expect((await post(t, withPayload("not a jws"))).status).toBe(400);
    expect((await post(t, withPayload("a.b"))).status).toBe(400);
    expect(verifyNotification).not.toHaveBeenCalled();
  });

  test("400 { result: invalid } when the verifier rejects the signature", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockRejectedValue(new AppStoreVerificationError("bad"));
    const res = await post(t, withPayload(JWS));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ result: "invalid" });
  });

  test("500 with a generic body on a transient failure", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockRejectedValue(
      new ExternalServiceError("app_store", "OCSP secret detail", { retryable: true })
    );
    const res = await post(t, withPayload(JWS));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Notification processing failed" });
  });

  test("200 on success", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-route",
      notificationType: "TEST",
      environment: "Sandbox",
    });
    const res = await post(t, withPayload(JWS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "ignored" });
  });
});
