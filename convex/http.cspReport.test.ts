/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_CSP_REPORT_BYTES } from "./_lib/cspReport";
import schema from "./schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const report = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    "csp-report": {
      "document-uri": "https://www.solomindlm.com/sign-in?code=SECRET",
      "blocked-uri": "https://analytics.google.com/g/collect?cid=123",
      "violated-directive": "connect-src",
      "effective-directive": "connect-src",
      disposition: "report",
      "source-file": "https://www.googletagmanager.com/gtag/js",
      "line-number": 304,
      ...overrides,
    },
  });

const post = (t: ReturnType<typeof convexTest>, body: string) =>
  t.fetch("/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/csp-report" },
    body,
  });

describe("POST /api/csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const loggedViolations = () =>
    warn.mock.calls
      .map(([line]) => (typeof line === "string" ? JSON.parse(line) : line))
      .filter((entry) => entry?.service === "csp");

  test("logs a violation without query strings and answers 204", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, report());

    expect(res.status).toBe(204);
    const [entry] = loggedViolations();
    expect(entry).toMatchObject({
      topic: "service",
      service: "csp",
      blockedUri: "https://analytics.google.com/g/collect",
      documentUri: "https://www.solomindlm.com/sign-in",
      effectiveDirective: "connect-src",
    });
    expect(JSON.stringify(entry)).not.toContain("SECRET");
  });

  test("answers 204 but logs nothing for browser-extension noise", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, report({ "source-file": "moz-extension://abc/inject.js" }));

    expect(res.status).toBe(204);
    expect(loggedViolations()).toHaveLength(0);
  });

  test("rejects a body that is not JSON with 400", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, "not json");

    expect(res.status).toBe(400);
    expect(loggedViolations()).toHaveLength(0);
  });

  test("rejects an oversized body with 413", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, report({ "original-policy": "x".repeat(MAX_CSP_REPORT_BYTES) }));

    expect(res.status).toBe(413);
    expect(loggedViolations()).toHaveLength(0);
  });

  test("answers 204 and logs nothing for JSON that is not a CSP report", async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, JSON.stringify({ hello: "world" }));

    expect(res.status).toBe(204);
    expect(loggedViolations()).toHaveLength(0);
  });
});
