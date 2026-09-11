# In-App Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users report a bug or request a feature from inside the app; store submissions in Convex; give users a status list and staff a triage view that can push a submission to GitHub Issues.

**Architecture:** New `feedback` Convex table is the source of truth. A web modal (Bug/Idea) writes via a `feedback.submit` mutation that server-derives plan tier and rate-limits per user. Screenshots go to Convex file storage. Staff (gated by a `FEEDBACK_ADMIN_EMAILS` env allowlist) open `/admin/feedback`; one action calls the GitHub REST API to create a labelled issue and stores the returned number back on the row. The mobile Expo shell is a WebView over the same web routes, so no native code changes — the entry point appears there automatically.

**Tech Stack:** Convex 1.44+ (object-syntax functions, `v` validators), `@convex-dev/rate-limiter`, React 19 + Vite + React Router 7, TailwindCSS 4, `convex/react` hooks, vitest + `convex-test`.

**Deviations from issue #101:**
- `lastRequestId` is captured as an optional field with a module-level store (`setLastRequestId`) but no producers are wired in this plan — there is no reliable global request-id on the web client today. The column and plumbing exist; populating it is a follow-up.
- "My feedback" lives at its own route `/feedback` (there is no Settings page today) and is linked from the user menu and the success toast.
- Full modal rendering is verified by an optional Playwright task (Task 15), not vitest — per project rule "UI surfaces → Playwright". Deterministic logic (context capture, validation, issue-body formatting, shapers, auth gate) is unit-tested.

---

## File Structure

### Convex (backend)

| File | Responsibility |
|---|---|
| `convex/schema.ts` (modify) | Add additive `feedback` table + indexes. No backfill/migration (all new-or-optional columns). |
| `convex/_lib/env.ts` (modify) | Add `FEEDBACK_GITHUB_TOKEN`, `FEEDBACK_GITHUB_REPO`, `FEEDBACK_ADMIN_EMAILS`. |
| `convex/_lib/rateLimits.ts` (modify) | Add `feedbackSubmit` fixed-window (5 / hour). |
| `convex/_lib/feedbackAdmin.ts` (create) | `parseAdminEmails`, `isFeedbackAdminEmail`, `assertFeedbackAdmin`. |
| `convex/_lib/feedbackAdmin.test.ts` (create) | Unit tests for the pure allowlist helpers. |
| `convex/_model/feedback.ts` (create) | Pure helpers: `FEEDBACK_TYPES`, row shapers, `feedbackIssueTitle`, `feedbackIssueLabels`, `feedbackIssueBody`. |
| `convex/_model/feedback.test.ts` (create) | Unit tests for the pure helpers. |
| `convex/feedback/index.ts` (create) | `generateUploadUrl` (mutation), `submit` (mutation), `listMine` (query), `isAdmin` (query), `listAll` (query, admin), `getScreenshotUrl` (query, admin). |
| `convex/feedback/index.test.ts` (create) | `convex-test` coverage incl. negative authz. |
| `convex/feedback/github.ts` (create) | `createGithubIssue` (action, admin), `getForSync` (internalQuery), `attachGithubIssue` (internalMutation). |
| `convex/feedback/github.test.ts` (create) | `convex-test` with stubbed `fetch`. |

### Web (`apps/web/src`)

| File | Responsibility |
|---|---|
| `features/feedback/feedbackTypes.ts` (create) | Shared TS types, `captureFeedbackContext`, `validateFeedbackDraft`. |
| `features/feedback/lastRequestId.ts` (create) | Module store: `getLastRequestId`, `setLastRequestId`. |
| `features/feedback/feedbackTypes.test.ts` (create) | Unit tests for capture + validation. |
| `features/feedback/services/feedbackApi.ts` (create) | Convex hooks: submit, my list, upload url, isAdmin, all list, create-issue. |
| `features/feedback/FeedbackContext.tsx` (create) | Provider + `useFeedback()` (`isOpen`, `defaultType`, `open`, `close`). |
| `features/feedback/components/FeedbackModal.tsx` (create) | Bug/Idea modal, screenshot upload, validation, submit, success toast. |
| `features/feedback/components/MyFeedbackPage.tsx` (create) | Route `/feedback` — the user's own submissions + status. |
| `features/feedback/components/AdminFeedbackPage.tsx` (create) | Route `/admin/feedback` — triage list + "Open GitHub issue". |
| `App.tsx` (modify) | Mount `FeedbackProvider`, render `<FeedbackModal/>`, add the two routes. |
| `features/auth/components/AvatarDropdown.tsx` (modify) | Add "Send feedback" + "My feedback" (+ "Feedback triage" for admins) menu items. |

### Docs

| File | Responsibility |
|---|---|
| `docs/engineering/in-app-feedback.md` (create) | Operator notes: env vars, how the GitHub sync token is scoped, how to add a staff email. |

---

## Task 1: `feedback` table schema

**Files:**
- Modify: `convex/schema.ts` (insert a new table before the closing `});` of `defineSchema({...})`, after the `semanticScholarThrottle` table around line 977)

- [ ] **Step 1: Add the table definition**

In `convex/schema.ts`, add this table as the last entry inside `defineSchema({ ... })` (after `semanticScholarThrottle: defineTable({ lastRequestAt: v.number() }),`):

```typescript
  // In-app user feedback (bug reports + feature requests). Source of truth;
  // optionally mirrored to GitHub Issues by staff from /admin/feedback.
  feedback: defineTable({
    userId: v.id("users"),
    type: v.union(v.literal("bug"), v.literal("feature")),
    /** Primary free-text: "what happened" (bug) or "what do you want" (feature). */
    body: v.string(),
    /** Optional secondary free-text: "steps to reproduce" (bug) or "why" (feature). */
    detail: v.optional(v.string()),
    screenshotId: v.optional(v.id("_storage")),
    /** Auto-captured client context. */
    route: v.string(),
    surface: v.union(v.literal("web"), v.literal("mobile")),
    appVersion: v.string(),
    lastRequestId: v.optional(v.string()),
    /** Server-derived at submit time from the active Stripe subscription. */
    planTier: v.union(v.literal("free"), v.literal("pro")),
    status: v.union(
      v.literal("received"),
      v.literal("planned"),
      v.literal("shipped"),
      v.literal("closed")
    ),
    githubIssueNumber: v.optional(v.number()),
    githubIssueUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS (no errors). This also regenerates `convex/_generated` types locally if `convex dev` is running; if not, the `api.feedback.*` references in later tasks still typecheck once their files exist because tsgo reads the source.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(feedback): add feedback table schema"
```

---

## Task 2: Env vars + rate-limit window

**Files:**
- Modify: `convex/_lib/env.ts:76-78` (add three keys before the closing `};`)
- Modify: `convex/_lib/rateLimits.ts:43-47` (add one window)

- [ ] **Step 1: Add env keys**

In `convex/_lib/env.ts`, inside the `export const env = { ... }` object, add before `// Convex deployment info`:

```typescript
  // In-app feedback → GitHub Issues sync (staff-triggered)
  FEEDBACK_GITHUB_TOKEN: process.env.FEEDBACK_GITHUB_TOKEN || "",
  FEEDBACK_GITHUB_REPO: process.env.FEEDBACK_GITHUB_REPO || "samintisar/SolomindLM",
  /** Comma-separated email allowlist for /admin/feedback and the GitHub sync action. */
  FEEDBACK_ADMIN_EMAILS: process.env.FEEDBACK_ADMIN_EMAILS || "",
```

- [ ] **Step 2: Add the rate-limit window**

In `convex/_lib/rateLimits.ts`, inside `RATE_LIMIT_CONFIG`, add after the `notebookFork` line:

```typescript
  /** In-app feedback submissions (per user, per hour) */
  feedbackSubmit: { kind: "fixed window", rate: 5, period: HOUR },
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add convex/_lib/env.ts convex/_lib/rateLimits.ts
git commit -m "feat(feedback): add feedback env vars and submit rate limit"
```

---

## Task 3: Admin allowlist helper (TDD)

**Files:**
- Create: `convex/_lib/feedbackAdmin.ts`
- Test: `convex/_lib/feedbackAdmin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/_lib/feedbackAdmin.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isFeedbackAdminEmail, parseAdminEmails } from "./feedbackAdmin";

describe("feedbackAdmin", () => {
  it("parses a comma-separated list, trims, lowercases, drops blanks", () => {
    expect(parseAdminEmails(" A@x.com, b@Y.com ,, c@z.com ")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("returns [] for an empty string", () => {
    expect(parseAdminEmails("")).toEqual([]);
  });

  it("matches an email case-insensitively against the allowlist", () => {
    expect(isFeedbackAdminEmail("Dev@Solomind.com", "dev@solomind.com")).toBe(true);
  });

  it("rejects an email not on the allowlist", () => {
    expect(isFeedbackAdminEmail("other@x.com", "dev@solomind.com")).toBe(false);
  });

  it("rejects undefined/empty email", () => {
    expect(isFeedbackAdminEmail(undefined, "dev@solomind.com")).toBe(false);
    expect(isFeedbackAdminEmail("", "dev@solomind.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- feedbackAdmin`
Expected: FAIL with "Cannot find module './feedbackAdmin'"

- [ ] **Step 3: Write the implementation**

Create `convex/_lib/feedbackAdmin.ts`:

```typescript
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { env } from "./env";

/** Split "a@x.com, b@y.com" into a trimmed, lowercased, blank-free list. */
export function parseAdminEmails(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** True when `email` is on the allowlist (defaults to the env allowlist). */
export function isFeedbackAdminEmail(
  email: string | undefined | null,
  raw: string = env.FEEDBACK_ADMIN_EMAILS
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.toLowerCase());
}

/** Throws unless the given user's email is on the feedback-admin allowlist. */
export async function assertFeedbackAdmin(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!isFeedbackAdminEmail(user?.email ?? undefined)) {
    throw new Error("Not authorized: feedback admin only");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- feedbackAdmin`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/_lib/feedbackAdmin.ts convex/_lib/feedbackAdmin.test.ts
git commit -m "feat(feedback): add admin allowlist helper"
```

---

## Task 4: Pure model helpers (TDD)

**Files:**
- Create: `convex/_model/feedback.ts`
- Test: `convex/_model/feedback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/_model/feedback.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  FEEDBACK_TYPES,
  feedbackIssueBody,
  feedbackIssueLabels,
  feedbackIssueTitle,
  toAdminFeedbackRow,
  toMyFeedbackRow,
} from "./feedback";

const base = {
  _id: "fb1",
  _creationTime: 1000,
  type: "bug" as const,
  body: "Quiz won't submit\nmore detail on line 2",
  detail: "1. open quiz 2. click finish",
  status: "received",
  route: "/notebook/abc/quiz",
  planTier: "pro",
  surface: "web",
  appVersion: "2.4.1",
  githubIssueNumber: undefined as number | undefined,
  githubIssueUrl: undefined as string | undefined,
  createdAt: 1000,
};

describe("feedback model", () => {
  it("exposes the two feedback types", () => {
    expect(FEEDBACK_TYPES).toEqual(["bug", "feature"]);
  });

  it("toMyFeedbackRow keeps only user-facing fields", () => {
    expect(toMyFeedbackRow(base)).toEqual({
      id: "fb1",
      type: "bug",
      body: base.body,
      status: "received",
      createdAt: 1000,
    });
  });

  it("toAdminFeedbackRow keeps triage fields", () => {
    const row = toAdminFeedbackRow(base);
    expect(row).toMatchObject({
      id: "fb1",
      type: "bug",
      route: "/notebook/abc/quiz",
      planTier: "pro",
      surface: "web",
      appVersion: "2.4.1",
    });
  });

  it("feedbackIssueTitle uses the first line, prefixed and clipped", () => {
    expect(feedbackIssueTitle(base.body)).toBe("[Feedback] Quiz won't submit");
    expect(feedbackIssueTitle("x".repeat(200))).toHaveLength("[Feedback] ".length + 80);
    expect(feedbackIssueTitle("   ")).toBe("[Feedback] New submission");
  });

  it("feedbackIssueLabels maps type to the repo taxonomy", () => {
    expect(feedbackIssueLabels("bug")).toEqual(["type:bug", "status:triage"]);
    expect(feedbackIssueLabels("feature")).toEqual(["type:feature", "status:triage"]);
  });

  it("feedbackIssueBody is deterministic and includes context", () => {
    const md = feedbackIssueBody({ ...base, userId: "user123" });
    expect(md).toContain("Quiz won't submit");
    expect(md).toContain("### Steps to reproduce");
    expect(md).toContain("1. open quiz 2. click finish");
    expect(md).toContain("- Route: `/notebook/abc/quiz`");
    expect(md).toContain("- Plan: `pro`");
    expect(md).toContain("user123");
  });

  it("feedbackIssueBody labels the detail section by type and handles missing detail", () => {
    const md = feedbackIssueBody({
      ...base,
      type: "feature",
      detail: undefined,
      userId: "u1",
    });
    expect(md).toContain("### Why / what for");
    expect(md).toContain("_none provided_");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- _model/feedback`
Expected: FAIL with "Cannot find module './feedback'"

- [ ] **Step 3: Write the implementation**

Create `convex/_model/feedback.ts`:

```typescript
export const FEEDBACK_TYPES = ["bug", "feature"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const TITLE_PREFIX = "[Feedback] ";
const TITLE_MAX = 80;

export interface FeedbackRowLike {
  _id: string;
  _creationTime: number;
  type: FeedbackType;
  body: string;
  detail?: string;
  status: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  createdAt: number;
}

/** Fields safe to show a user about their own submission. */
export function toMyFeedbackRow(row: FeedbackRowLike) {
  return {
    id: row._id,
    type: row.type,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** Fields shown in the staff triage list. */
export function toAdminFeedbackRow(row: FeedbackRowLike) {
  return {
    id: row._id,
    type: row.type,
    body: row.body,
    detail: row.detail,
    status: row.status,
    route: row.route,
    planTier: row.planTier,
    surface: row.surface,
    appVersion: row.appVersion,
    githubIssueNumber: row.githubIssueNumber,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
  };
}

export function feedbackIssueTitle(body: string): string {
  const firstLine = (body.split("\n")[0] ?? "").trim();
  if (!firstLine) return `${TITLE_PREFIX}New submission`;
  const clipped =
    firstLine.length > TITLE_MAX ? firstLine.slice(0, TITLE_MAX) : firstLine;
  return `${TITLE_PREFIX}${clipped}`;
}

export function feedbackIssueLabels(type: FeedbackType): string[] {
  return [type === "bug" ? "type:bug" : "type:feature", "status:triage"];
}

export function feedbackIssueBody(row: {
  type: FeedbackType;
  body: string;
  detail?: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  lastRequestId?: string;
  userId: string;
}): string {
  const detailLabel =
    row.type === "bug" ? "Steps to reproduce" : "Why / what for";
  return [
    row.body.trim(),
    "",
    `### ${detailLabel}`,
    row.detail?.trim() ? row.detail.trim() : "_none provided_",
    "",
    "### Context",
    `- Route: \`${row.route}\``,
    `- Plan: \`${row.planTier}\``,
    `- Surface: \`${row.surface}\``,
    `- App version: \`${row.appVersion}\``,
    `- Last requestId: \`${row.lastRequestId ?? "n/a"}\``,
    "",
    `_Filed from in-app feedback by user \`${row.userId}\`._`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- _model/feedback`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/_model/feedback.ts convex/_model/feedback.test.ts
git commit -m "feat(feedback): add pure model helpers for shaping and GitHub issue text"
```

---

## Task 5: Core Convex functions (`convex/feedback/index.ts`)

**Files:**
- Create: `convex/feedback/index.ts`
- Test: `convex/feedback/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/feedback/index.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
async function seedUser(t: ReturnType<typeof convexTest>, email?: string): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test", ...(email ? { email } : {}) }));
}

const draft = {
  type: "bug" as const,
  body: "Quiz won't submit",
  detail: "click finish on a blank quiz",
  route: "/notebook/abc/quiz",
  surface: "web" as const,
  appVersion: "2.4.1",
};

describe("feedback.index", () => {
  test("submit stores a row with server-derived free tier and received status", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);

    const res = await asUser.mutation(api.feedback.index.submit, draft);
    expect(res.id).toBeDefined();

    const mine = await asUser.query(api.feedback.index.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ type: "bug", status: "received", body: "Quiz won't submit" });

    const row = await t.run((ctx) => ctx.db.get(res.id as Id<"feedback">));
    expect(row?.planTier).toBe("free");
    expect(row?.userId).toBe(userId);
  });

  test("submit derives pro tier from an active subscription", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await t.run((ctx) =>
      ctx.db.insert("stripeSubscriptions", {
        userId,
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        stripePriceId: "price_1",
        status: "active",
        currentPeriodStart: 0,
        currentPeriodEnd: 0,
        cancelAtPeriodEnd: false,
        interval: "month",
        amount: 0,
        currency: "usd",
        createdAt: 0,
        updatedAt: 0,
      })
    );
    const res = await withAuth(t, userId).mutation(api.feedback.index.submit, draft);
    const row = await t.run((ctx) => ctx.db.get(res.id as Id<"feedback">));
    expect(row?.planTier).toBe("pro");
  });

  test("submit rejects an empty body", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.feedback.index.submit, { ...draft, body: "   " })
    ).rejects.toThrow(/description/i);
  });

  test("submit rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.feedback.index.submit, draft)).rejects.toThrow(/unauth/i);
  });

  test("submit is rate-limited after 5 in an hour", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    for (let i = 0; i < 5; i++) {
      await asUser.mutation(api.feedback.index.submit, { ...draft, body: `x${i}` });
    }
    await expect(
      asUser.mutation(api.feedback.index.submit, { ...draft, body: "x6" })
    ).rejects.toThrow();
  });

  test("listMine only returns the caller's rows", async () => {
    const t = convexTest(schema, modules);
    const a = await seedUser(t);
    const b = await seedUser(t);
    await withAuth(t, a).mutation(api.feedback.index.submit, draft);
    expect(await withAuth(t, b).query(api.feedback.index.listMine, {})).toHaveLength(0);
  });

  test("isAdmin reflects the allowlist", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "boss@solomind.com");
    const plain = await seedUser(t, "nope@x.com");
    expect(await withAuth(t, admin).query(api.feedback.index.isAdmin, {})).toBe(true);
    expect(await withAuth(t, plain).query(api.feedback.index.isAdmin, {})).toBe(false);
    vi.unstubAllEnvs();
  });

  test("listAll rejects a non-admin and returns rows for an admin", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@solomind.com");
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "boss@solomind.com");
    const user = await seedUser(t, "user@x.com");
    await withAuth(t, user).mutation(api.feedback.index.submit, draft);

    await expect(withAuth(t, user).query(api.feedback.index.listAll, {})).rejects.toThrow(
      /authoriz/i
    );
    const all = await withAuth(t, admin).query(api.feedback.index.listAll, {});
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ route: "/notebook/abc/quiz", planTier: "free" });
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- feedback/index`
Expected: FAIL with "Cannot find module" / missing `api.feedback.index`

- [ ] **Step 3: Write the implementation**

Create `convex/feedback/index.ts`:

```typescript
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, type MutationCtx, query } from "../_generated/server";
import { assertFeedbackAdmin, isFeedbackAdminEmail } from "../_lib/feedbackAdmin";
import { rateLimiter } from "../_lib/rateLimits";
import { toAdminFeedbackRow, toMyFeedbackRow } from "../_model/feedback";
import { getAuthUserId } from "../auth";

const MAX_TEXT = 5000;

const submitArgs = {
  type: v.union(v.literal("bug"), v.literal("feature")),
  body: v.string(),
  detail: v.optional(v.string()),
  screenshotId: v.optional(v.id("_storage")),
  route: v.string(),
  surface: v.union(v.literal("web"), v.literal("mobile")),
  appVersion: v.string(),
  lastRequestId: v.optional(v.string()),
};

async function derivePlanTier(ctx: MutationCtx, userId: Id<"users">): Promise<"free" | "pro"> {
  const sub = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();
  return sub ? "pro" : "free";
}

/** Upload target for an optional screenshot. Auth-gated. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: submitArgs,
  returns: v.object({ id: v.id("feedback") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const body = args.body.trim();
    if (!body) throw new Error("Enter a description first");
    if (body.length > MAX_TEXT) throw new Error("Description is too long");
    const detail = args.detail?.trim() || undefined;
    if (detail && detail.length > MAX_TEXT) throw new Error("Detail is too long");

    await rateLimiter.limit(ctx, "feedbackSubmit", { key: userId, throws: true });

    const now = Date.now();
    const id = await ctx.db.insert("feedback", {
      userId,
      type: args.type,
      body,
      detail,
      screenshotId: args.screenshotId,
      route: args.route.slice(0, 512),
      surface: args.surface,
      appVersion: args.appVersion.slice(0, 64),
      lastRequestId: args.lastRequestId?.slice(0, 128),
      planTier: await derivePlanTier(ctx, userId),
      status: "received",
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(100);
    return rows.map(toMyFeedbackRow);
  },
});

export const isAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const user = await ctx.db.get(userId);
    return isFeedbackAdminEmail(user?.email ?? undefined);
  },
});

export const listAll = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const rows = args.status
      ? await ctx.db
          .query("feedback")
          .withIndex("by_status", (q) => q.eq("status", args.status as string))
          .order("desc")
          .take(200)
      : await ctx.db.query("feedback").order("desc").take(200);
    return rows.map(toAdminFeedbackRow);
  },
});

/** Signed URL for a submission's screenshot. Admin-only. */
export const getScreenshotUrl = query({
  args: { feedbackId: v.id("feedback") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);
    const row = await ctx.db.get(args.feedbackId);
    if (!row?.screenshotId) return null;
    return await ctx.storage.getUrl(row.screenshotId);
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- feedback/index`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/feedback/index.ts convex/feedback/index.test.ts
git commit -m "feat(feedback): add submit/listMine/isAdmin/listAll Convex functions"
```

---

## Task 6: GitHub sync (`convex/feedback/github.ts`)

**Files:**
- Create: `convex/feedback/github.ts`
- Test: `convex/feedback/github.test.ts`

- [ ] **Step 1: Write the failing test**

Create `convex/feedback/github.test.ts`:

```typescript
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
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
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@x.com");
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "ghp_test");
    vi.stubEnv("FEEDBACK_GITHUB_REPO", "acme/repo");

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ number: 42, html_url: "https://github.com/acme/repo/issues/42" }), {
        status: 201,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "boss@x.com");
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
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/acme/repo/issues");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.labels).toEqual(["type:bug", "status:triage"]);
    expect(sent.title).toContain("broken thing");

    const row = await t.run((ctx) => ctx.db.get(id as Id<"feedback">));
    expect(row?.githubIssueNumber).toBe(42);

    await expect(
      withAuth(t, admin).action(api.feedback.github.createGithubIssue, { feedbackId: id as Id<"feedback"> })
    ).rejects.toThrow(/already/i);
  });

  test("rejects a non-admin caller", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@x.com");
    const t = convexTest(schema, modules);
    const user = await seedUser(t, "u@x.com");
    const { id } = await withAuth(t, user).mutation(api.feedback.index.submit, {
      type: "feature",
      body: "please add dark mode",
      route: "/x",
      surface: "web",
      appVersion: "1.0.0",
    });
    await expect(
      withAuth(t, user).action(api.feedback.github.createGithubIssue, { feedbackId: id as Id<"feedback"> })
    ).rejects.toThrow(/authoriz/i);
  });

  test("throws a clear error when the token is missing", async () => {
    vi.stubEnv("FEEDBACK_ADMIN_EMAILS", "boss@x.com");
    vi.stubEnv("FEEDBACK_GITHUB_TOKEN", "");
    const t = convexTest(schema, modules);
    const admin = await seedUser(t, "boss@x.com");
    const user = await seedUser(t, "u@x.com");
    const { id } = await withAuth(t, user).mutation(api.feedback.index.submit, {
      type: "bug",
      body: "x",
      route: "/x",
      surface: "web",
      appVersion: "1.0.0",
    });
    await expect(
      withAuth(t, admin).action(api.feedback.github.createGithubIssue, { feedbackId: id as Id<"feedback"> })
    ).rejects.toThrow(/FEEDBACK_GITHUB_TOKEN/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- feedback/github`
Expected: FAIL — `api.feedback.github` undefined

- [ ] **Step 3: Write the implementation**

Create `convex/feedback/github.ts`:

```typescript
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { env } from "../_lib/env";
import { ExternalServiceError } from "../_lib/errors";
import { assertFeedbackAdmin } from "../_lib/feedbackAdmin";
import {
  type FeedbackType,
  feedbackIssueBody,
  feedbackIssueLabels,
  feedbackIssueTitle,
} from "../_model/feedback";
import { getAuthUserId } from "../auth";

interface SyncPayload {
  type: FeedbackType;
  body: string;
  detail?: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  lastRequestId?: string;
  userId: string;
}

/** Admin-gated read of a feedback row for GitHub sync. Throws if already synced. */
export const getForSync = internalQuery({
  args: { feedbackId: v.id("feedback"), callerUserId: v.id("users") },
  handler: async (ctx, args): Promise<SyncPayload> => {
    await assertFeedbackAdmin(ctx, args.callerUserId);
    const row = await ctx.db.get(args.feedbackId);
    if (!row) throw new Error("Feedback not found");
    if (row.githubIssueNumber != null) {
      throw new Error("This feedback already has a GitHub issue");
    }
    return {
      type: row.type,
      body: row.body,
      detail: row.detail,
      route: row.route,
      planTier: row.planTier,
      surface: row.surface,
      appVersion: row.appVersion,
      lastRequestId: row.lastRequestId,
      userId: row.userId as string,
    };
  },
});

export const attachGithubIssue = internalMutation({
  args: { feedbackId: v.id("feedback"), number: v.number(), url: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedbackId, {
      githubIssueNumber: args.number,
      githubIssueUrl: args.url,
      updatedAt: Date.now(),
    });
  },
});

export const createGithubIssue = action({
  args: { feedbackId: v.id("feedback") },
  returns: v.object({ number: v.number(), url: v.string() }),
  handler: async (ctx, args): Promise<{ number: number; url: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const payload = await ctx.runQuery(internal.feedback.github.getForSync, {
      feedbackId: args.feedbackId,
      callerUserId: userId as Id<"users">,
    });

    const token = env.FEEDBACK_GITHUB_TOKEN;
    if (!token) {
      throw new ExternalServiceError("GitHub", "FEEDBACK_GITHUB_TOKEN is not set");
    }
    const repo = env.FEEDBACK_GITHUB_REPO;

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "SolomindLM-feedback",
      },
      body: JSON.stringify({
        title: feedbackIssueTitle(payload.body),
        body: feedbackIssueBody(payload),
        labels: feedbackIssueLabels(payload.type),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ExternalServiceError("GitHub", `Issue create failed: ${res.status}`, {
        statusCode: res.status,
        detail: text.slice(0, 300),
      });
    }

    const json = (await res.json()) as { number?: number; html_url?: string };
    if (typeof json.number !== "number" || typeof json.html_url !== "string") {
      throw new ExternalServiceError("GitHub", "Unexpected issue-create response shape");
    }

    await ctx.runMutation(internal.feedback.github.attachGithubIssue, {
      feedbackId: args.feedbackId,
      number: json.number,
      url: json.html_url,
    });
    return { number: json.number, url: json.html_url };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- feedback/github`
Expected: PASS (3 tests)

- [ ] **Step 5: Full Convex test sweep**

Run: `bun run test:convex`
Expected: PASS (all existing tests + the new feedback tests)

- [ ] **Step 6: Commit**

```bash
git add convex/feedback/github.ts convex/feedback/github.test.ts
git commit -m "feat(feedback): add staff GitHub Issues sync action"
```

---

## Task 7: Web deterministic helpers (TDD)

**Files:**
- Create: `apps/web/src/features/feedback/lastRequestId.ts`
- Create: `apps/web/src/features/feedback/feedbackTypes.ts`
- Test: `apps/web/src/features/feedback/feedbackTypes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/feedback/feedbackTypes.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { captureFeedbackContext, validateFeedbackDraft } from "./feedbackTypes";
import { setLastRequestId } from "./lastRequestId";

afterEach(() => {
  setLastRequestId(undefined);
  delete (window as { __IS_NATIVE_SHELL__?: boolean }).__IS_NATIVE_SHELL__;
});

describe("captureFeedbackContext", () => {
  it("captures route + search and defaults surface to web", () => {
    const ctx = captureFeedbackContext({ pathname: "/notebook/x", search: "?tab=quiz" });
    expect(ctx.route).toBe("/notebook/x?tab=quiz");
    expect(ctx.surface).toBe("web");
    expect(typeof ctx.appVersion).toBe("string");
    expect(ctx.lastRequestId).toBeUndefined();
  });

  it("reports surface=mobile inside the native shell", () => {
    (window as { __IS_NATIVE_SHELL__?: boolean }).__IS_NATIVE_SHELL__ = true;
    expect(captureFeedbackContext({ pathname: "/", search: "" }).surface).toBe("mobile");
  });

  it("includes a stored lastRequestId when one was set", () => {
    setLastRequestId("req_123");
    expect(captureFeedbackContext({ pathname: "/", search: "" }).lastRequestId).toBe("req_123");
  });
});

describe("validateFeedbackDraft", () => {
  it("rejects an empty / whitespace body", () => {
    expect(validateFeedbackDraft({ body: "   " })).toEqual({
      ok: false,
      error: "Enter a description first",
    });
  });
  it("rejects an over-long body", () => {
    expect(validateFeedbackDraft({ body: "x".repeat(5001) }).ok).toBe(false);
  });
  it("accepts a normal body", () => {
    expect(validateFeedbackDraft({ body: "it broke" })).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/web test -- feedbackTypes`
Expected: FAIL — modules not found

- [ ] **Step 3: Write `lastRequestId.ts`**

Create `apps/web/src/features/feedback/lastRequestId.ts`:

```typescript
/**
 * Module-level store for the most recent backend request id, so a feedback
 * submission can be correlated with server logs. No producers are wired yet;
 * call `setLastRequestId` from error/stream handling in a follow-up.
 */
let lastRequestId: string | undefined;

export function setLastRequestId(id: string | undefined): void {
  lastRequestId = id;
}

export function getLastRequestId(): string | undefined {
  return lastRequestId;
}
```

- [ ] **Step 4: Write `feedbackTypes.ts`**

Create `apps/web/src/features/feedback/feedbackTypes.ts`:

```typescript
import { isNativeShell } from "@/utils/platformDetection";
import { getLastRequestId } from "./lastRequestId";

export type FeedbackType = "bug" | "feature";

export const MAX_FEEDBACK_TEXT = 5000;

export interface FeedbackContextCapture {
  route: string;
  surface: "web" | "mobile";
  appVersion: string;
  lastRequestId?: string;
}

export interface FeedbackDraft {
  type: FeedbackType;
  body: string;
  detail: string;
}

export function captureFeedbackContext(
  loc: { pathname: string; search: string } = window.location
): FeedbackContextCapture {
  return {
    route: `${loc.pathname}${loc.search ?? ""}`,
    surface: isNativeShell() ? "mobile" : "web",
    appVersion: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown",
    lastRequestId: getLastRequestId(),
  };
}

export function validateFeedbackDraft(
  d: { body: string }
): { ok: true } | { ok: false; error: string } {
  const body = d.body.trim();
  if (!body) return { ok: false, error: "Enter a description first" };
  if (body.length > MAX_FEEDBACK_TEXT) {
    return { ok: false, error: `Keep it under ${MAX_FEEDBACK_TEXT} characters` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --cwd apps/web test -- feedbackTypes`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/feedback/lastRequestId.ts apps/web/src/features/feedback/feedbackTypes.ts apps/web/src/features/feedback/feedbackTypes.test.ts
git commit -m "feat(feedback): web context-capture and draft validation helpers"
```

---

## Task 8: Web API hooks (`services/feedbackApi.ts`)

**Files:**
- Create: `apps/web/src/features/feedback/services/feedbackApi.ts`

- [ ] **Step 1: Write the file**

Create `apps/web/src/features/feedback/services/feedbackApi.ts`:

```typescript
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FeedbackContextCapture, FeedbackType } from "../feedbackTypes";

export interface SubmitFeedbackInput extends FeedbackContextCapture {
  type: FeedbackType;
  body: string;
  detail?: string;
  screenshotId?: Id<"_storage">;
}

/** Submit a feedback row. Returns `{ id }`. */
export function useSubmitFeedback() {
  const submit = useMutation(api.feedback.index.submit);
  return (input: SubmitFeedbackInput) =>
    submit({
      type: input.type,
      body: input.body,
      detail: input.detail,
      screenshotId: input.screenshotId,
      route: input.route,
      surface: input.surface,
      appVersion: input.appVersion,
      lastRequestId: input.lastRequestId,
    });
}

/** Upload a screenshot to Convex storage; returns its storage id. */
export function useUploadFeedbackScreenshot() {
  const generateUploadUrl = useMutation(api.feedback.index.generateUploadUrl);
  return async (file: File): Promise<Id<"_storage">> => {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Screenshot upload failed");
    const { storageId } = (await res.json()) as { storageId: string };
    return storageId as Id<"_storage">;
  };
}

export function useMyFeedback() {
  return useQuery(api.feedback.index.listMine, {});
}

export function useIsFeedbackAdmin(): boolean {
  return useQuery(api.feedback.index.isAdmin, {}) ?? false;
}

export function useAllFeedback(status?: string) {
  return useQuery(api.feedback.index.listAll, status ? { status } : {});
}

export function useCreateGithubIssue() {
  const run = useAction(api.feedback.github.createGithubIssue);
  return (feedbackId: string) => run({ feedbackId: feedbackId as Id<"feedback"> });
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/feedback/services/feedbackApi.ts
git commit -m "feat(feedback): web Convex hooks for feedback"
```

---

## Task 9: Feedback context provider

**Files:**
- Create: `apps/web/src/features/feedback/FeedbackContext.tsx`

- [ ] **Step 1: Write the file**

Create `apps/web/src/features/feedback/FeedbackContext.tsx`:

```tsx
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { FeedbackType } from "./feedbackTypes";

interface FeedbackContextValue {
  isOpen: boolean;
  defaultType: FeedbackType;
  open: (type?: FeedbackType) => void;
  close: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<FeedbackType>("bug");

  const open = useCallback((type: FeedbackType = "bug") => {
    setDefaultType(type);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, defaultType, open, close }),
    [isOpen, defaultType, open, close]
  );
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/feedback/FeedbackContext.tsx
git commit -m "feat(feedback): add FeedbackProvider/useFeedback"
```

---

## Task 10: Feedback modal

**Files:**
- Create: `apps/web/src/features/feedback/components/FeedbackModal.tsx`

- [ ] **Step 1: Write the file**

Create `apps/web/src/features/feedback/components/FeedbackModal.tsx`:

```tsx
import { Bug, Lightbulb, Paperclip, X } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/shared/contexts/useToast";
import { useFeedback } from "../FeedbackContext";
import { captureFeedbackContext, type FeedbackType, validateFeedbackDraft } from "../feedbackTypes";
import { useSubmitFeedback, useUploadFeedbackScreenshot } from "../services/feedbackApi";

export function FeedbackModal() {
  const { isOpen, defaultType, close } = useFeedback();
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [body, setBody] = useState("");
  const [detail, setDetail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = useSubmitFeedback();
  const uploadScreenshot = useUploadFeedbackScreenshot();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Re-sync the local type when the modal is (re)opened with a preset.
  if (isOpen && type !== defaultType && body === "" && detail === "" && !file && !error) {
    setType(defaultType);
  }
  if (!isOpen) return null;

  const reset = () => {
    setBody("");
    setDetail("");
    setFile(null);
    setError(null);
    setSubmitting(false);
  };
  const onClose = () => {
    reset();
    close();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      setError("Screenshot must be under 5 MB");
      return;
    }
    setFile(f);
  };

  const onSubmit = async () => {
    const check = validateFeedbackDraft({ body });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const screenshotId = file ? await uploadScreenshot(file) : undefined;
      await submitFeedback({
        type,
        body,
        detail: detail.trim() || undefined,
        screenshotId,
        ...captureFeedbackContext({ pathname: location.pathname, search: location.search }),
      });
      toast.success("Thanks — we got it.", {
        action: { label: "View", onClick: () => navigate("/feedback") },
      });
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const isBug = type === "bug";
  const bodyLabel = isBug ? "What happened?" : "What do you want?";
  const detailLabel = isBug ? "Steps to reproduce (optional)" : "Why / what for? (optional)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Send feedback</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("bug")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isBug ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Bug className="h-4 w-4" /> Bug
            </button>
            <button
              type="button"
              onClick={() => setType("feature")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                !isBug ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Lightbulb className="h-4 w-4" /> Idea
            </button>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{bodyLabel}</span>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{detailLabel}</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            {file ? file.name : "Attach screenshot (optional)"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />
          </label>

          <p className="rounded-md bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            We automatically attach the current page, your plan, and app version to help us debug.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `useToast` action shape**

Run: `grep -n "action" apps/web/src/shared/contexts/useToast.ts`
Expected: shows a `action?: { label: string; onClick: () => void }` field on `Toast`. If the property names differ, adjust the `toast.success(..., { action: {...} })` call in the modal to match. If `Toast` has no `action` field, drop the `action` option and keep the plain `toast.success("Thanks — we got it.")` call.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/feedback/components/FeedbackModal.tsx
git commit -m "feat(feedback): add FeedbackModal"
```

---

## Task 11: My-feedback and admin pages

**Files:**
- Create: `apps/web/src/features/feedback/components/MyFeedbackPage.tsx`
- Create: `apps/web/src/features/feedback/components/AdminFeedbackPage.tsx`

- [ ] **Step 1: Write `MyFeedbackPage.tsx`**

Create `apps/web/src/features/feedback/components/MyFeedbackPage.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { useFeedback } from "../FeedbackContext";
import { useMyFeedback } from "../services/feedbackApi";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  planned: "Planned",
  shipped: "Shipped",
  closed: "Closed",
};

export function MyFeedbackPage() {
  const rows = useMyFeedback();
  const navigate = useNavigate();
  const { open } = useFeedback();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">My feedback</h1>
        <button
          type="button"
          onClick={() => open("bug")}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Send feedback
        </button>
      </div>

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You haven't sent any feedback yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  r.type === "bug" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                }`}
              >
                {r.type === "bug" ? "bug" : "idea"}
              </span>
              <span className="flex-1 truncate">{r.body.split("\n")[0]}</span>
              <span className="text-xs text-muted-foreground">
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => navigate("/home")}
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to home
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Write `AdminFeedbackPage.tsx`**

Create `apps/web/src/features/feedback/components/AdminFeedbackPage.tsx`:

```tsx
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useToast } from "@/shared/contexts/useToast";
import { useAllFeedback, useCreateGithubIssue, useIsFeedbackAdmin } from "../services/feedbackApi";

export function AdminFeedbackPage() {
  const isAdmin = useIsFeedbackAdmin();
  const isAdminQuery = isAdmin; // useQuery(...) ?? false — undefined while loading is coerced to false
  const rows = useAllFeedback();
  const createIssue = useCreateGithubIssue();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Loading guard: the isAdmin hook returns false during load, so also wait on rows.
  if (!isAdminQuery && rows === undefined) {
    return <main className="p-6 text-sm text-muted-foreground">Loading…</main>;
  }
  if (!isAdminQuery) return <Navigate to="/home" replace />;

  const onCreateIssue = async (id: string) => {
    setBusyId(id);
    try {
      const { url } = await createIssue(id);
      toast.success(`GitHub issue created`, {
        action: { label: "Open", onClick: () => window.open(url, "_blank") },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create issue");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-auto p-6">
      <h1 className="mb-4 text-xl font-display font-bold">Feedback triage</h1>
      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  r.type === "bug" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                }`}
              >
                {r.type === "bug" ? "bug" : "idea"}
              </span>
              <span className="flex-1 truncate" title={r.body}>
                {r.body.split("\n")[0]}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.planTier} · {r.surface}
              </span>
              {r.githubIssueNumber ? (
                <a
                  href={r.githubIssueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  #{r.githubIssueNumber}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => onCreateIssue(r.id)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  {busyId === r.id ? "Creating…" : "Open GitHub issue"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/feedback/components/MyFeedbackPage.tsx apps/web/src/features/feedback/components/AdminFeedbackPage.tsx
git commit -m "feat(feedback): add my-feedback and admin triage pages"
```

---

## Task 12: Wire into the app shell

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/auth/components/AvatarDropdown.tsx`

- [ ] **Step 1: Add imports to `App.tsx`**

In `apps/web/src/App.tsx`, add with the other feature imports (near line 40):

```typescript
import { FeedbackProvider } from "./features/feedback/FeedbackContext";
import { FeedbackModal } from "./features/feedback/components/FeedbackModal";
import { MyFeedbackPage } from "./features/feedback/components/MyFeedbackPage";
import { AdminFeedbackPage } from "./features/feedback/components/AdminFeedbackPage";
```

- [ ] **Step 2: Add the two routes**

In `apps/web/src/App.tsx`, inside `<Routes>` (after the `/billing` route, before `/share/fork/:token`), add:

```tsx
            <Route
              path="/feedback"
              element={
                <ProtectedRoute>
                  <main className="flex-1 overflow-auto">
                    <MyFeedbackPage />
                  </main>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/feedback"
              element={
                <ProtectedRoute>
                  <AdminFeedbackPage />
                </ProtectedRoute>
              }
            />
```

- [ ] **Step 3: Mount the provider + modal**

In `apps/web/src/App.tsx`, in the `App` component's JSX, wrap `<AppContent />` with `<FeedbackProvider>` and render `<FeedbackModal />` inside it, alongside `<ToastContainer />`:

```tsx
          <AuthProvider>
            <ToastProvider>
              <FeedbackProvider>
                <AppContent />
                <FeedbackModal />
              </FeedbackProvider>
              <ToastContainer />
            </ToastProvider>
          </AuthProvider>
```

- [ ] **Step 4: Add menu items to `AvatarDropdown.tsx`**

In `apps/web/src/features/auth/components/AvatarDropdown.tsx`:

Replace the import line
```tsx
import { ListChecks, LogIn, LogOut, Moon, Sun } from "lucide-react";
```
with
```tsx
import { ListChecks, LogIn, LogOut, MessageSquarePlus, Moon, Sun, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFeedback } from "../../feedback/FeedbackContext";
import { useIsFeedbackAdmin } from "../../feedback/services/feedbackApi";
```

Inside the component body, after `const handleLogout = ...`, add:
```tsx
  const navigate = useNavigate();
  const { open: openFeedback } = useFeedback();
  const isFeedbackAdmin = useIsFeedbackAdmin();
```

In the `{/* Menu Items */}` block, immediately before the `{/* Login/Logout */}` button, add:
```tsx
        {isAuthenticated && (
          <>
            <button
              onClick={() => openFeedback("bug")}
              className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
              role="menuitem"
            >
              <MessageSquarePlus className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>Send feedback</span>
            </button>
            <button
              onClick={() => navigate("/feedback")}
              className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
              role="menuitem"
            >
              <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>My feedback</span>
            </button>
            {isFeedbackAdmin && (
              <button
                onClick={() => navigate("/admin/feedback")}
                className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
                role="menuitem"
              >
                <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>Feedback triage</span>
              </button>
            )}
          </>
        )}
```

- [ ] **Step 5: Update the AvatarDropdown test if present**

Run: `bun run --cwd apps/web test -- AvatarDropdown`
Expected: PASS. If the existing test renders `AvatarDropdown` without a Router or `FeedbackProvider`, wrap the render in `<BrowserRouter><FeedbackProvider>…</FeedbackProvider></BrowserRouter>` and mock `convex/react`'s `useQuery` to return `false` (see `apps/web/src/features/billing/services/useUserLimits.test.ts` for the `vi.mock("convex/react", …)` pattern). Keep the change minimal — only what makes the existing assertions pass.

- [ ] **Step 6: Typecheck + web tests**

Run: `bun run typecheck:web`
Expected: PASS

Run: `bun run --cwd apps/web test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/auth/components/AvatarDropdown.tsx apps/web/src/features/auth/components/AvatarDropdown.test.tsx
git commit -m "feat(feedback): mount provider, routes, and user-menu entry points"
```

---

## Task 13: Operator docs + env setup

**Files:**
- Create: `docs/engineering/in-app-feedback.md`

- [ ] **Step 1: Write the doc**

Create `docs/engineering/in-app-feedback.md`:

```markdown
# In-app feedback

Users send bug reports / feature requests from the user menu ("Send feedback").
Submissions are stored in the Convex `feedback` table. Staff triage at
`/admin/feedback` and can push a submission to GitHub Issues.

## Convex env vars

| Var | Purpose | Default |
|---|---|---|
| `FEEDBACK_ADMIN_EMAILS` | Comma-separated email allowlist for `/admin/feedback` and the GitHub sync action. | `""` (no admins) |
| `FEEDBACK_GITHUB_TOKEN` | Fine-grained PAT with **Issues: write** on `samintisar/SolomindLM`. Used only by the staff-triggered sync action. | `""` |
| `FEEDBACK_GITHUB_REPO` | `owner/repo` the issues are filed in. | `samintisar/SolomindLM` |

Set them:

\`\`\`bash
bunx convex env set FEEDBACK_ADMIN_EMAILS "you@example.com"
bunx convex env set FEEDBACK_GITHUB_TOKEN "github_pat_..."
# prod:
bunx convex env set --prod FEEDBACK_ADMIN_EMAILS "you@example.com"
bunx convex env set --prod FEEDBACK_GITHUB_TOKEN "github_pat_..."
\`\`\`

## Notes

- `planTier` is derived server-side from the active Stripe subscription — never trusted from the client.
- Submissions are rate-limited to 5 per user per hour (`feedbackSubmit` window in `convex/_lib/rateLimits.ts`).
- The GitHub sync is one-directional and manual. Re-syncing a row is blocked once `githubIssueNumber` is set.
- `lastRequestId` is captured if `setLastRequestId()` has been called on the web client; no producers are wired yet.
- The Expo mobile app is a WebView over the web routes, so the entry point works there with no native change.
```

- [ ] **Step 2: Commit**

```bash
git add docs/engineering/in-app-feedback.md
git commit -m "docs(feedback): operator notes and env setup"
```

---

## Task 14: Full verification

- [ ] **Step 1: Typecheck both projects**

Run: `bun run typecheck:convex`
Expected: PASS

Run: `bun run typecheck:web`
Expected: PASS

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: PASS (no errors; `noExplicitAny` warnings only if pre-existing). Fix any new findings in feedback files with `bun run lint:fix` then re-run.

- [ ] **Step 3: Convex tests**

Run: `bun run test:convex`
Expected: PASS — existing suite plus `feedbackAdmin` (5), `_model/feedback` (7), `feedback/index` (8), `feedback/github` (3).

- [ ] **Step 4: Web tests**

Run: `bun run test:web`
Expected: PASS — existing suite plus `feedbackTypes` (6).

- [ ] **Step 5: Commit any lint fixups**

```bash
git add -A
git commit -m "chore(feedback): lint fixups" || echo "nothing to commit"
```

---

## Task 15 (optional): Playwright happy-path

**Files:**
- Create: `apps/web/tests/e2e/feedback.spec.ts` (match the existing e2e directory/location — run `find apps/web -name "*.spec.ts" -o -name "*.e2e.ts" | head` first and mirror it)

- [ ] **Step 1: Write the spec**

A signed-in session test that: opens the user menu, clicks "Send feedback", asserts the modal, clicks "Send" with an empty body and asserts the inline "Enter a description first" error, types a body, submits, and asserts the "Thanks — we got it." toast. Reuse the project's existing auth-state / storageState fixture used by other specs.

- [ ] **Step 2: Run**

Run: `bun run test:e2e -- feedback`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/e2e/feedback.spec.ts
git commit -m "test(feedback): e2e happy path for the feedback modal"
```

---

## Self-Review

**Spec coverage vs issue #101 acceptance criteria:**

| Criterion | Task |
|---|---|
| Signed-in web user opens "Send feedback" from the menu, picks Bug/Idea, submits, sees confirmation | Tasks 9–12 |
| Reachable from the mobile shell menu | Task 12 (WebView — no native change; noted in Task 13 doc) |
| Submitting writes a row with auto-captured context, no user entry | Tasks 5, 7, 10 |
| Optional screenshot → Convex storage, linked from the row | Tasks 5 (`generateUploadUrl`, `getScreenshotUrl`), 8, 10 |
| Required field validated client-side; empty submit blocked with inline error | Task 7 (`validateFeedbackDraft`), Task 10 |
| Submissions rate-limited per user | Task 2 + Task 5 (`rateLimiter.limit`, tested) |
| "My feedback" lists the caller's submissions with status | Tasks 5 (`listMine`), 11 |
| `/admin/feedback` staff-only, lists all with type/plan/surface/status | Tasks 3, 5 (`listAll`, `isAdmin`), 11, 12 |
| One-click labelled GitHub issue prefilled from the record; row stores + links the number; re-click disabled | Task 6 (`createGithubIssue`, idempotent), Task 11 (button disabled once `githubIssueNumber` set) |
| `typecheck:web` + `typecheck:convex` + `lint` + `test:convex` pass; new mutation/query has `convex-test` coverage | Task 14; coverage in Tasks 5–6 |

**Out-of-scope items from the issue** (public upvoting board, anonymous submission, session replay, two-way GitHub sync, in-app changelog) — no tasks, correct.

**Type consistency check:** `FeedbackType` = `"bug" | "feature"` everywhere (schema literals, `_model/feedback.ts`, `feedbackTypes.ts`). Row-shaper output keys (`id`, `type`, `body`, `status`, `createdAt` for user; plus `route`, `planTier`, `surface`, `appVersion`, `githubIssueNumber`, `githubIssueUrl` for admin) match what `MyFeedbackPage`/`AdminFeedbackPage` read. `submit` args (client) omit `planTier` (server-derived) — `SubmitFeedbackInput` and `useSubmitFeedback` agree. Action return `{ number, url }` matches `AdminFeedbackPage`'s `const { url } = await createIssue(id)`.

**Placeholder scan:** none — all code steps contain full source; the two "adjust if the existing test/……" steps (10.2, 12.5) are conditional integration notes, not placeholders.
