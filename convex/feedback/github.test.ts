/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

// The committed `convex/_lib/env.ts` snapshots `process.env` at module-eval
// time, and convex-test loads that module once per test file (on the first
// function call). Stub the admin allowlist at module scope so `env.ts` sees it
// when it first evaluates. The GitHub token is read directly from `process.env`
// by `feedback/github.ts` (NOT via the `env` snapshot), so per-test
// `vi.stubEnv("FEEDBACK_GITHUB_TOKEN", ...)` below takes effect at call time.
vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function makeT() {
  const t = convexTest(schema, modules);
  // convex-test 0.0.50 does not auto-register components; the `submit`
  // mutation used to seed rows calls into the rate-limiter component.
  registerRateLimiter(t);
  return t;
}

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
async function seedUser(t: ReturnType<typeof convexTest>, email?: string): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "T", ...(email ? { email } : {}) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("feedback.github.createGithubIssue", () => {
  test("creates an issue, stores number+url, is not repeatable", async () => {
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "ghp_test");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ number: 42, html_url: "https://github.com/acme/repo/issues/42" }),
          { status: 201 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = makeT();
    const admin = await seedUser(t, "boss@solomind.com");
    const user = await seedUser(t, "u@x.com");
    const { id } = await withAuth(t, user).mutation(api.feedback.index.submit, {
      type: "bug",
      body: "broken thing",
      route: "/x",
      surface: "web",
      appVersion: "1.0.0",
    });

    const out = await withAuth(t, admin).action(api.feedback.github.createGithubIssue, {
      feedbackId: id as Id<"feedback">,
    });
    expect(out).toEqual({ number: 42, url: "https://github.com/acme/repo/issues/42" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/repos/");
    expect(String(url)).toContain("/issues");
    const sent = JSON.parse(init.body as string);
    expect(sent.labels).toEqual(["type:bug", "status:triage"]);
    expect(sent.title).toContain("broken thing");

    const row = await t.run((ctx) => ctx.db.get(id as Id<"feedback">));
    expect(row?.githubIssueNumber).toBe(42);
    expect(row?.githubIssueUrl).toBe("https://github.com/acme/repo/issues/42");

    await expect(
      withAuth(t, admin).action(api.feedback.github.createGithubIssue, {
        feedbackId: id as Id<"feedback">,
      })
    ).rejects.toThrow(/already/i);
  });

  test("rejects a non-admin caller", async () => {
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "ghp_test");
    const t = makeT();
    const user = await seedUser(t, "u@x.com");
    const { id } = await withAuth(t, user).mutation(api.feedback.index.submit, {
      type: "feature",
      body: "please add dark mode",
      route: "/x",
      surface: "web",
      appVersion: "1.0.0",
    });
    await expect(
      withAuth(t, user).action(api.feedback.github.createGithubIssue, {
        feedbackId: id as Id<"feedback">,
      })
    ).rejects.toThrow(/authoriz/i);
  });

  test("throws a clear error when the token is missing", async () => {
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "");
    const t = makeT();
    const admin = await seedUser(t, "boss@solomind.com");
    const user = await seedUser(t, "u@x.com");
    const { id } = await withAuth(t, user).mutation(api.feedback.index.submit, {
      type: "bug",
      body: "x",
      route: "/x",
      surface: "web",
      appVersion: "1.0.0",
    });
    await expect(
      withAuth(t, admin).action(api.feedback.github.createGithubIssue, {
        feedbackId: id as Id<"feedback">,
      })
    ).rejects.toThrow(/FEEDBACK_GITHUB_TOKEN/);
  });
});
