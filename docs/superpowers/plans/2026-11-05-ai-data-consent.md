# AI Data-Sharing Consent (Mobile App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside the iOS/Android shell, show a consent screen that names each third-party AI provider and what it receives, and render nothing else until the user allows.

**Architecture:** Consent lives on the existing `userPreferences` row (three optional fields) behind one query and two mutations. In the web app, a pure function resolves the gate state; a thin hook feeds it from `isNativeShell()`, auth state and the query, holding the last definite state through auth blips. `AiConsentGate` wraps `AppShell` in `RootRoutes.tsx`, so no app code runs before consent. An avatar-menu dialog lets the user turn it off.

**Tech Stack:** Convex (queries/mutations, convex-test + vitest), React 19 + React Router 7, shadcn primitives in `apps/web/src/shared/components/ui`, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-05-ai-data-consent-design.md`

**Before you start:**
- Work in this worktree on branch `docs/ai-consent-spec` (rename to `feature/ai-data-consent` before the PR, Task 8).
- Read `convex/_generated/ai/guidelines.md` (required before any Convex change) and `docs/design/principles.md` (UI rules: semantic tokens, primitives, never `dark:`).
- The post-edit hook runs Biome on each edited file; fix anything it reports.
- Test commands:
  - Convex, one file: `bun x vitest run --config vitest.convex.config.ts convex/userPreferences/index.test.ts`
  - Web, one path: `bun run --cwd apps/web test -- src/features/aiConsent`

---

## File structure

| File | Responsibility |
| --- | --- |
| `convex/schema.ts` (modify) | Three optional consent fields on `userPreferences` |
| `convex/userPreferences/index.ts` (modify) | `upsertPreferences` helper, `getMyAiConsent`, `grantAiConsent`, `declineAiConsent` |
| `convex/userPreferences/index.test.ts` (modify) | Backend tests |
| `apps/web/src/features/aiConsent/aiConsentCopy.ts` | Consent version + provider disclosure table |
| `apps/web/src/features/aiConsent/resolveAiConsentState.ts` (+ `.test.ts`) | Pure state resolution, including blip holding |
| `apps/web/src/features/aiConsent/useAiConsentState.ts` (+ `.test.tsx`) | Hook wiring shell flag, auth, query, held state |
| `apps/web/src/features/aiConsent/AiConsentScreen.tsx` (+ `.test.tsx`) | The consent screen |
| `apps/web/src/features/aiConsent/AiFeaturesOffScreen.tsx` (+ `.test.tsx`) | The "AI features are off" screen |
| `apps/web/src/features/aiConsent/AiConsentGate.tsx` (+ `.test.tsx`) | Chooses screen vs children |
| `apps/web/src/features/aiConsent/AiDataSharingDialog.tsx` (+ `.test.tsx`) | Avatar-menu dialog with Turn off |
| `apps/web/src/shell/AppShellFallback.tsx` (create) | Spinner moved out of `RootRoutes.tsx` so the gate can reuse it |
| `apps/web/src/shell/RootRoutes.tsx` (modify) | Wrap `AppShell` in `AiConsentGate` |
| `apps/web/src/shell/RootRoutes.test.tsx` (modify) | Mock the gate as a pass-through |
| `apps/web/src/features/auth/components/AvatarDropdown.tsx` (+ test, modify) | "AI data sharing" item, shell only |
| `apps/web/src/features/aiConsent/useReportAiConsentToShell.ts` (+ `.test.tsx`) | Task 6b: reports consent to the native shell over the WebView bridge |
| `apps/mobile/src/components/web/parseShellWebMessage.ts` (+ `.test.ts`) | Task 6b: parses the `shell-web:ai-consent` message |
| `apps/mobile/src/components/web/WebViewScreen.tsx` (modify) | Task 6b: forwards the consent report to its parent |
| `apps/mobile/app/index.tsx` (modify) | Task 6b: shows the native upload button only after a `granted` report |

---

### Task 1: Backend — consent fields, query, mutations

**Files:**
- Modify: `convex/schema.ts` (the `userPreferences` table, search for `userPreferences: defineTable`)
- Modify: `convex/userPreferences/index.ts`
- Test: `convex/userPreferences/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `convex/userPreferences/index.test.ts` (the file already defines `modules`, `withAuth` and `seedUser`):

```ts
async function getRow(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
  );
}

describe("getMyAiConsent", () => {
  test("reports signed out when there is no identity", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(api.userPreferences.index.getMyAiConsent, {});
    expect(result).toEqual({ signedIn: false });
  });

  test("reports no answer when the user has no preferences row", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await withAuth(t, userId).query(api.userPreferences.index.getMyAiConsent, {});
    expect(result).toEqual({ signedIn: true, version: null, declined: false });
  });
});

describe("grantAiConsent", () => {
  test("stores the version and time", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    expect(await asUser.query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: 1,
      declined: false,
    });
    const row = await getRow(t, userId);
    expect(typeof row?.aiConsentAt).toBe("number");
  });

  test("clears an earlier decline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.declineAiConsent, {});
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    const row = await getRow(t, userId);
    expect(row?.aiConsentDeclinedAt).toBeUndefined();
    expect(row?.aiConsentVersion).toBe(1);
  });

  test("keeps the output language", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "es" });
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    const row = await getRow(t, userId);
    expect(row?.outputLanguage).toBe("es");
  });

  test.each([0, -1, 1.5])("rejects version %s", async (version) => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.userPreferences.index.grantAiConsent, { version })
    ).rejects.toThrow();
  });

  test("rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.userPreferences.index.grantAiConsent, { version: 1 })
    ).rejects.toThrow();
  });

  test("only changes the caller's row", async () => {
    const t = convexTest(schema, modules);
    const alice = await seedUser(t);
    const bob = await seedUser(t);
    await withAuth(t, alice).mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    expect(await withAuth(t, bob).query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: null,
      declined: false,
    });
  });
});

describe("declineAiConsent", () => {
  test("clears a grant and records the decline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.grantAiConsent, { version: 1 });
    await asUser.mutation(api.userPreferences.index.declineAiConsent, {});
    expect(await asUser.query(api.userPreferences.index.getMyAiConsent, {})).toEqual({
      signedIn: true,
      version: null,
      declined: true,
    });
    const row = await getRow(t, userId);
    expect(typeof row?.aiConsentDeclinedAt).toBe("number");
  });

  test("rejects when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.userPreferences.index.declineAiConsent, {})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun x vitest run --config vitest.convex.config.ts convex/userPreferences/index.test.ts`
Expected: the new tests FAIL (TypeScript/`api` has no `getMyAiConsent`, `grantAiConsent`, `declineAiConsent`); the existing `setOutputLanguage` / `getMyPreferences` tests still pass.

- [ ] **Step 3: Widen the schema**

In `convex/schema.ts`, replace the `userPreferences` table with:

```ts
  userPreferences: defineTable({
    userId: v.id("users"),
    outputLanguage: v.optional(v.string()),
    /** AI data-sharing consent text version the user allowed in the mobile app; absent = not allowed. */
    aiConsentVersion: v.optional(v.number()),
    /** Time of the latest AI consent grant or decline. */
    aiConsentAt: v.optional(v.number()),
    /** Set by "Not now" or Turn off; cleared by a grant. */
    aiConsentDeclinedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
```

- [ ] **Step 4: Implement the helper, query and mutations**

Replace the whole of `convex/userPreferences/index.ts` with:

```ts
import { ConvexError, v } from "convex/values";
import { VALID_LANGUAGE_CODES } from "../_agents/_shared/languageInstruction";
import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery, type MutationCtx, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { mutation } from "../functions";

type PreferenceFields = Partial<
  Omit<Doc<"userPreferences">, "_id" | "_creationTime" | "userId" | "updatedAt">
>;

/** Create or patch the caller's single preferences row. An `undefined` field is removed on patch. */
async function upsertPreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  fields: PreferenceFields
): Promise<void> {
  const existing = await ctx.db
    .query("userPreferences")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const updatedAt = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...fields, updatedAt });
  } else {
    await ctx.db.insert("userPreferences", { userId, ...fields, updatedAt });
  }
}

export const getMyPreferences = query({
  args: {},
  returns: v.union(v.object({ outputLanguage: v.optional(v.string()) }), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const getPreferencesByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ outputLanguage: v.optional(v.string()) }), v.null()),
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const setOutputLanguage = mutation({
  args: { outputLanguage: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!VALID_LANGUAGE_CODES.includes(args.outputLanguage)) {
      throw new ConvexError("Unsupported language code");
    }
    await upsertPreferences(ctx, userId, { outputLanguage: args.outputLanguage });
    return null;
  },
});

/**
 * The mobile app's AI data-sharing consent. `signedIn: false` lets the web gate tell an auth blip
 * (the shell re-authenticating) apart from a user who has never answered.
 */
export const getMyAiConsent = query({
  args: {},
  returns: v.union(
    v.object({ signedIn: v.literal(false) }),
    v.object({
      signedIn: v.literal(true),
      version: v.union(v.number(), v.null()),
      declined: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false as const };
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      signedIn: true as const,
      version: prefs?.aiConsentVersion ?? null,
      declined: prefs?.aiConsentDeclinedAt !== undefined,
    };
  },
});

export const grantAiConsent = mutation({
  args: { version: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!Number.isInteger(args.version) || args.version < 1) {
      throw new ConvexError("Invalid consent version");
    }
    await upsertPreferences(ctx, userId, {
      aiConsentVersion: args.version,
      aiConsentAt: Date.now(),
      aiConsentDeclinedAt: undefined,
    });
    return null;
  },
});

/** "Not now" on the consent screen and Turn off in the avatar menu. */
export const declineAiConsent = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    const now = Date.now();
    await upsertPreferences(ctx, userId, {
      aiConsentVersion: undefined,
      aiConsentAt: now,
      aiConsentDeclinedAt: now,
    });
    return null;
  },
});
```

If `ctx.db.insert` rejects an object with an `undefined` field in convex-test, filter them out before inserting:
`Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun x vitest run --config vitest.convex.config.ts convex/userPreferences/index.test.ts`
Expected: all tests PASS, including the original four `setOutputLanguage` and two `getMyPreferences` tests.

- [ ] **Step 6: Typecheck Convex**

Run: `bun run typecheck:convex`
Expected: no errors. (No `npx convex codegen` needed: the module already exists, so `api.d.ts` does not change.)

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/userPreferences/index.ts convex/userPreferences/index.test.ts
git commit -m "feat(consent): store the mobile app's AI data-sharing consent on userPreferences"
```

---

### Task 2: Consent copy and pure state resolution

**Files:**
- Create: `apps/web/src/features/aiConsent/aiConsentCopy.ts`
- Create: `apps/web/src/features/aiConsent/resolveAiConsentState.ts`
- Test: `apps/web/src/features/aiConsent/resolveAiConsentState.test.ts`

- [ ] **Step 1: Create the copy module**

`apps/web/src/features/aiConsent/aiConsentCopy.ts`:

```ts
/**
 * Version of the consent text. Bump it when a provider is added or what one receives changes:
 * every mobile user is asked again. Keep this table in sync with the privacy policy and
 * App Store Connect → App Privacy.
 */
export const AI_CONSENT_VERSION = 1;

export interface AiProviderDisclosure {
  name: string;
  /** What the provider receives. */
  data: string;
  /** Why it receives it. */
  purpose: string;
}

export const AI_PROVIDERS: readonly AiProviderDisclosure[] = [
  {
    name: "Together AI",
    data: "Your questions, excerpts from your sources and voice recordings",
    purpose: "to write answers, notes, quizzes, audio and grading",
  },
  {
    name: "OpenAI",
    data: "Source text and infographic prompts",
    purpose: "to index your sources for search and draw infographics",
  },
  {
    name: "Voyage AI",
    data: "Passages from your sources",
    purpose: "to rank the most relevant passages",
  },
  {
    name: "Mistral",
    data: "PDFs and images you upload",
    purpose: "to read their text",
  },
  {
    name: "Tavily",
    data: "Search terms",
    purpose: "to find web sources",
  },
  {
    name: "Supadata",
    data: "Links you add",
    purpose: "to fetch web pages and video transcripts",
  },
];
```

- [ ] **Step 2: Write the failing tests**

`apps/web/src/features/aiConsent/resolveAiConsentState.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  type AiConsentRecord,
  type ResolveAiConsentInput,
  resolveAiConsentState,
} from "./resolveAiConsentState";

const answered = (version: number | null, declined = false): AiConsentRecord => ({
  signedIn: true,
  version,
  declined,
});

function input(overrides: Partial<ResolveAiConsentInput> = {}): ResolveAiConsentInput {
  return {
    inShell: true,
    authLoading: false,
    isAuthenticated: true,
    record: answered(null),
    previous: null,
    currentVersion: 2,
    ...overrides,
  };
}

describe("resolveAiConsentState", () => {
  test("is not applicable on the web", () => {
    expect(resolveAiConsentState(input({ inShell: false, record: answered(null) }))).toBe(
      "notApplicable"
    );
  });

  test("asks when the user has never answered", () => {
    expect(resolveAiConsentState(input())).toBe("needsConsent");
  });

  test("asks again when the stored version is older", () => {
    expect(resolveAiConsentState(input({ record: answered(1) }))).toBe("needsConsent");
  });

  test("grants on the current version", () => {
    expect(resolveAiConsentState(input({ record: answered(2) }))).toBe("granted");
  });

  test("shows declined after Not now", () => {
    expect(resolveAiConsentState(input({ record: answered(null, true) }))).toBe("declined");
  });

  test("loads while auth is loading on a cold start", () => {
    expect(resolveAiConsentState(input({ authLoading: true, record: undefined }))).toBe("loading");
  });

  test("loads while the query is pending", () => {
    expect(resolveAiConsentState(input({ record: undefined }))).toBe("loading");
  });

  test("leaves signed-out users to the app's own sign-in flow", () => {
    expect(resolveAiConsentState(input({ isAuthenticated: false, record: undefined }))).toBe(
      "notApplicable"
    );
  });

  test.each([
    ["auth loading", { authLoading: true, record: undefined }],
    ["auth reads signed out", { isAuthenticated: false, record: undefined }],
    ["query reads signed out", { record: { signedIn: false } as AiConsentRecord }],
    ["query pending", { record: undefined }],
  ])("holds the previous answer through a blip (%s)", (_label, blip) => {
    for (const previous of ["granted", "needsConsent", "declined"] as const) {
      expect(resolveAiConsentState(input({ ...blip, previous }))).toBe(previous);
    }
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/resolveAiConsentState.test.ts`
Expected: FAIL, cannot resolve `./resolveAiConsentState`.

- [ ] **Step 4: Implement**

`apps/web/src/features/aiConsent/resolveAiConsentState.ts`:

```ts
export type AiConsentState = "notApplicable" | "loading" | "needsConsent" | "declined" | "granted";

/** A definite answer from the server, the only states worth holding through a blip. */
export type DefiniteAiConsentState = "needsConsent" | "declined" | "granted";

/** Shape returned by `api.userPreferences.index.getMyAiConsent`. */
export type AiConsentRecord =
  | { signedIn: false }
  | { signedIn: true; version: number | null; declined: boolean };

export interface ResolveAiConsentInput {
  inShell: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  /** `undefined` while the query is pending or skipped. */
  record: AiConsentRecord | undefined;
  /** Last definite state this session, held while auth or the query momentarily reads signed out. */
  previous: DefiniteAiConsentState | null;
  currentVersion: number;
}

export function resolveAiConsentState({
  inShell,
  authLoading,
  isAuthenticated,
  record,
  previous,
  currentVersion,
}: ResolveAiConsentInput): AiConsentState {
  if (!inShell) return "notApplicable";
  if (authLoading) return previous ?? "loading";
  // Truly signed out: AppShell redirects to sign-in, and nothing can reach a provider signed out.
  if (!isAuthenticated) return previous ?? "notApplicable";
  if (record === undefined || !record.signedIn) return previous ?? "loading";
  if (record.version === currentVersion) return "granted";
  if (record.declined) return "declined";
  return "needsConsent";
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/resolveAiConsentState.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/aiConsent/aiConsentCopy.ts apps/web/src/features/aiConsent/resolveAiConsentState.ts apps/web/src/features/aiConsent/resolveAiConsentState.test.ts
git commit -m "feat(consent): resolve the AI consent gate state, holding it through auth blips"
```

---

### Task 3: `useAiConsentState` hook

**Files:**
- Create: `apps/web/src/features/aiConsent/useAiConsentState.ts`
- Test: `apps/web/src/features/aiConsent/useAiConsentState.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/aiConsent/useAiConsentState.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAiConsentState } from "./useAiConsentState";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

const auth = { isAuthenticated: true, isLoading: false };
vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => auth }));

let inShell = true;
vi.mock("@/utils/platformDetection", () => ({ isNativeShell: () => inShell }));

const mockedUseQuery = vi.mocked(useQuery);

describe("useAiConsentState", () => {
  beforeEach(() => {
    inShell = true;
    auth.isAuthenticated = true;
    auth.isLoading = false;
    mockedUseQuery.mockReset();
  });

  test("skips the query on the web", () => {
    inShell = false;
    mockedUseQuery.mockReturnValue(undefined);
    const { result } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("notApplicable");
    expect(mockedUseQuery).toHaveBeenCalledWith(expect.anything(), "skip");
  });

  test("asks a signed-in shell user who has never answered", () => {
    mockedUseQuery.mockReturnValue({ signedIn: true, version: null, declined: false });
    const { result } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("needsConsent");
  });

  test("keeps showing the app through an auth blip after consent", () => {
    mockedUseQuery.mockReturnValue({ signedIn: true, version: 1, declined: false });
    const { result, rerender } = renderHook(() => useAiConsentState());
    expect(result.current).toBe("granted");

    auth.isAuthenticated = false;
    mockedUseQuery.mockReturnValue(undefined);
    rerender();
    expect(result.current).toBe("granted");

    auth.isAuthenticated = true;
    mockedUseQuery.mockReturnValue({ signedIn: false });
    rerender();
    expect(result.current).toBe("granted");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/useAiConsentState.test.tsx`
Expected: FAIL, cannot resolve `./useAiConsentState`.

- [ ] **Step 3: Implement**

`apps/web/src/features/aiConsent/useAiConsentState.ts`:

```ts
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { AI_CONSENT_VERSION } from "./aiConsentCopy";
import {
  type AiConsentState,
  type DefiniteAiConsentState,
  resolveAiConsentState,
} from "./resolveAiConsentState";

/** Which AI-consent screen (if any) the mobile shell must show before the app. */
export function useAiConsentState(): AiConsentState {
  const inShell = isNativeShell();
  const { isAuthenticated, isLoading } = useAuth();
  const record = useQuery(
    api.userPreferences.index.getMyAiConsent,
    inShell && isAuthenticated ? {} : "skip"
  );
  const previous = useRef<DefiniteAiConsentState | null>(null);

  const state = resolveAiConsentState({
    inShell,
    authLoading: isLoading,
    isAuthenticated,
    record,
    previous: previous.current,
    currentVersion: AI_CONSENT_VERSION,
  });

  useEffect(() => {
    if (state === "needsConsent" || state === "declined" || state === "granted") {
      previous.current = state;
    }
  }, [state]);

  return state;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/useAiConsentState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/aiConsent/useAiConsentState.ts apps/web/src/features/aiConsent/useAiConsentState.test.tsx
git commit -m "feat(consent): add useAiConsentState for the mobile shell"
```

---

### Task 4: Consent screen

**Files:**
- Create: `apps/web/src/features/aiConsent/AiConsentScreen.tsx`
- Test: `apps/web/src/features/aiConsent/AiConsentScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/aiConsent/AiConsentScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation } from "convex/react";
import { getFunctionName } from "convex/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AI_CONSENT_VERSION, AI_PROVIDERS } from "./aiConsentCopy";
import { AiConsentScreen } from "./AiConsentScreen";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));

const grant = vi.fn();
const decline = vi.fn();

function makeToast(): ToastContextValue {
  return {
    toast: vi.fn(() => "t"),
    success: vi.fn(() => "t"),
    error: vi.fn(() => "t"),
    info: vi.fn(() => "t"),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  };
}

function renderScreen(props: { onDeclined?: () => void } = {}, toast = makeToast()) {
  render(
    <MemoryRouter>
      <ToastContext.Provider value={toast}>
        <AiConsentScreen {...props} />
      </ToastContext.Provider>
    </MemoryRouter>
  );
  return toast;
}

describe("AiConsentScreen", () => {
  beforeEach(() => {
    grant.mockReset().mockResolvedValue(null);
    decline.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockImplementation(((ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref).endsWith("grantAiConsent") ? grant : decline) as never);
  });

  test("names every provider", () => {
    renderScreen();
    for (const provider of AI_PROVIDERS) {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    }
  });

  test("Allow grants the current version", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Allow and continue" }));
    expect(grant).toHaveBeenCalledWith({ version: AI_CONSENT_VERSION });
  });

  test("Not now declines and reports back", async () => {
    const onDeclined = vi.fn();
    renderScreen({ onDeclined });
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(decline).toHaveBeenCalledWith({});
    await waitFor(() => expect(onDeclined).toHaveBeenCalled());
  });

  test("a failed grant shows an error and lets the user retry", async () => {
    grant.mockRejectedValueOnce(new Error("offline"));
    const toast = renderScreen();
    const allow = screen.getByRole("button", { name: "Allow and continue" });
    await userEvent.click(allow);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(allow).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiConsentScreen.test.tsx`
Expected: FAIL, cannot resolve `./AiConsentScreen`.

- [ ] **Step 3: Implement**

`apps/web/src/features/aiConsent/AiConsentScreen.tsx`:

```tsx
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/shared/components/ui/item";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { AI_CONSENT_VERSION, AI_PROVIDERS } from "./aiConsentCopy";

interface AiConsentScreenProps {
  /** Called after "Not now" is saved (the gate uses it to leave review mode). */
  onDeclined?: () => void;
}

/** App Store guidelines 5.1.1(i) / 5.1.2(i): what is sent, to whom, and permission first. */
export function AiConsentScreen({ onDeclined }: AiConsentScreenProps) {
  const grant = useMutation(api.userPreferences.index.grantAiConsent);
  const decline = useMutation(api.userPreferences.index.declineAiConsent);
  const { showError } = useServiceErrorToast();
  const [pending, setPending] = useState<"allow" | "decline" | null>(null);

  const handleAllow = async () => {
    setPending("allow");
    try {
      await grant({ version: AI_CONSENT_VERSION });
    } catch (err) {
      showError(err);
    } finally {
      setPending(null);
    }
  };

  const handleDecline = async () => {
    setPending("decline");
    try {
      await decline({});
      onDeclined?.();
    } catch (err) {
      showError(err);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className="flex min-h-dvh w-full justify-center overflow-y-auto bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-5">
        <h1 className="font-display text-2xl text-foreground">How SolomindLM uses AI</h1>
        <p className="text-muted-foreground">
          To answer your questions and build study materials, SolomindLM sends some of your content
          to these services:
        </p>
        <ItemGroup variant="grouped">
          {AI_PROVIDERS.map((provider) => (
            <Item key={provider.name}>
              <ItemContent>
                <ItemTitle>{provider.name}</ItemTitle>
                <ItemDescription>
                  {provider.data}, {provider.purpose}.
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <p className="text-sm text-muted-foreground">
          Change this any time in the menu.{" "}
          <Link to="/privacy" className="text-link underline">
            Privacy policy
          </Link>
        </p>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={handleAllow} disabled={pending !== null}>
            Allow and continue
          </Button>
          <Button size="lg" variant="secondary" onClick={handleDecline} disabled={pending !== null}>
            Not now
          </Button>
        </div>
      </div>
    </main>
  );
}
```

If `size="lg"` or the `text-link` token doesn't exist, check `apps/web/src/shared/components/ui/button.tsx` sizes and `apps/web/src/index.css` tokens (`--link`) and use what is there; do not hand-roll colours.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiConsentScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/aiConsent/AiConsentScreen.tsx apps/web/src/features/aiConsent/AiConsentScreen.test.tsx
git commit -m "feat(consent): add the AI data-sharing consent screen"
```

---

### Task 5: "AI features are off" screen

**Files:**
- Create: `apps/web/src/features/aiConsent/AiFeaturesOffScreen.tsx`
- Test: `apps/web/src/features/aiConsent/AiFeaturesOffScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/aiConsent/AiFeaturesOffScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AiFeaturesOffScreen } from "./AiFeaturesOffScreen";

const signOut = vi.fn();
vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => ({ signOut }) }));

vi.mock("@/features/auth/components/DeleteAccountDialog", () => ({
  DeleteAccountDialog: () => <div data-testid="delete-account-dialog" />,
}));

function makeToast(): ToastContextValue {
  return {
    toast: vi.fn(() => "t"),
    success: vi.fn(() => "t"),
    error: vi.fn(() => "t"),
    info: vi.fn(() => "t"),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  };
}

function renderScreen(onReview = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/home"]}>
      <ToastContext.Provider value={makeToast()}>
        <Routes>
          <Route path="/home" element={<AiFeaturesOffScreen onReview={onReview} />} />
          <Route path="/sign-in" element={<div data-testid="sign-in" />} />
        </Routes>
      </ToastContext.Provider>
    </MemoryRouter>
  );
  return onReview;
}

describe("AiFeaturesOffScreen", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue(undefined);
  });

  test("Review and allow returns to the consent screen", async () => {
    const onReview = renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Review and allow" }));
    expect(onReview).toHaveBeenCalled();
  });

  test("Sign out signs out and goes to sign-in", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("sign-in")).toBeInTheDocument());
  });

  test("Delete account opens the existing dialog", async () => {
    renderScreen();
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByTestId("delete-account-dialog")).toBeInTheDocument();
  });

  test("links to the privacy policy", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiFeaturesOffScreen.test.tsx`
Expected: FAIL, cannot resolve `./AiFeaturesOffScreen`.

- [ ] **Step 3: Implement**

`apps/web/src/features/aiConsent/AiFeaturesOffScreen.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DeleteAccountDialog } from "@/features/auth/components/DeleteAccountDialog";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";

interface AiFeaturesOffScreenProps {
  /** Show the consent screen again. */
  onReview: () => void;
}

/** Shown in the mobile shell after "Not now" or Turn off: the app stays locked until the user allows. */
export function AiFeaturesOffScreen({ onReview }: AiFeaturesOffScreenProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { showError } = useServiceErrorToast();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      // The gate hides AppShell, which normally does this redirect.
      navigate("/sign-in", { replace: true });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <main className="flex min-h-dvh w-full justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col justify-center gap-6">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="font-display text-2xl text-foreground">AI features are off</h1>
          <p className="text-muted-foreground">
            SolomindLM needs these services to read your sources and answer questions, so the app
            can&apos;t be used without them. You can turn them on any time.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={onReview}>
            Review and allow
          </Button>
          <Button size="lg" variant="secondary" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/privacy">Privacy policy</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </div>
      {deleteOpen ? <DeleteAccountDialog open onOpenChange={setDeleteOpen} /> : null}
    </main>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiFeaturesOffScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/aiConsent/AiFeaturesOffScreen.tsx apps/web/src/features/aiConsent/AiFeaturesOffScreen.test.tsx
git commit -m "feat(consent): add the AI features are off screen"
```

---

### Task 6: The gate, wired into `RootRoutes`

**Files:**
- Create: `apps/web/src/shell/AppShellFallback.tsx`
- Create: `apps/web/src/features/aiConsent/AiConsentGate.tsx`
- Test: `apps/web/src/features/aiConsent/AiConsentGate.test.tsx`
- Modify: `apps/web/src/shell/RootRoutes.tsx`
- Modify: `apps/web/src/shell/RootRoutes.test.tsx`

> Final review: the build keeps the gate logic static but loads `AiConsentScreen` and `AiFeaturesOffScreen` with
> `React.lazy` inside `<Suspense fallback={<AppShellFallback />}>`, so web visitors don't download screens only the
> mobile shell shows. Children still never render before consent. The avatar menu's `AiDataSharingDialog` is lazy too.

- [ ] **Step 1: Move the fallback spinner into its own file**

`apps/web/src/shell/AppShellFallback.tsx`:

```tsx
import { Spinner } from "@/shared/components/ui/spinner";

/** Full-screen spinner while the app shell (or the AI consent check) loads. */
export function AppShellFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <span className="text-primary">
        <Spinner className="size-8" aria-label="Loading" />
      </span>
    </div>
  );
}
```

In `apps/web/src/shell/RootRoutes.tsx`, delete the local `AppShellFallback` function and the `Spinner` import, and add `import { AppShellFallback } from "./AppShellFallback";`.

- [ ] **Step 2: Write the failing gate test**

`apps/web/src/features/aiConsent/AiConsentGate.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AiConsentState } from "./resolveAiConsentState";
import { AiConsentGate } from "./AiConsentGate";

let state: AiConsentState = "granted";
vi.mock("./useAiConsentState", () => ({ useAiConsentState: () => state }));

vi.mock("./AiConsentScreen", () => ({
  AiConsentScreen: ({ onDeclined }: { onDeclined?: () => void }) => (
    <button type="button" data-testid="consent-screen" onClick={onDeclined}>
      consent
    </button>
  ),
}));
vi.mock("./AiFeaturesOffScreen", () => ({
  AiFeaturesOffScreen: ({ onReview }: { onReview: () => void }) => (
    <button type="button" data-testid="off-screen" onClick={onReview}>
      off
    </button>
  ),
}));
vi.mock("@/shell/AppShellFallback", () => ({
  AppShellFallback: () => <div data-testid="fallback" />,
}));

function renderGate() {
  return render(
    <AiConsentGate>
      <div data-testid="app" />
    </AiConsentGate>
  );
}

describe("AiConsentGate", () => {
  beforeEach(() => {
    state = "granted";
  });

  test.each([
    ["notApplicable", "app"],
    ["granted", "app"],
    ["loading", "fallback"],
    ["needsConsent", "consent-screen"],
    ["declined", "off-screen"],
  ] as const)("%s shows %s", (current, testId) => {
    state = current;
    renderGate();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  test.each(["loading", "needsConsent", "declined"] as const)(
    "%s keeps the app unmounted",
    (current) => {
      state = current;
      renderGate();
      expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    }
  );

  test("Review and allow shows the consent screen; Not now returns to the off screen", () => {
    state = "declined";
    renderGate();
    act(() => screen.getByTestId("off-screen").click());
    expect(screen.getByTestId("consent-screen")).toBeInTheDocument();
    act(() => screen.getByTestId("consent-screen").click());
    expect(screen.getByTestId("off-screen")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiConsentGate.test.tsx`
Expected: FAIL, cannot resolve `./AiConsentGate`.

- [ ] **Step 4: Implement the gate**

`apps/web/src/features/aiConsent/AiConsentGate.tsx`:

```tsx
import { type ReactNode, useEffect, useState } from "react";
import { AppShellFallback } from "@/shell/AppShellFallback";
import { AiConsentScreen } from "./AiConsentScreen";
import { AiFeaturesOffScreen } from "./AiFeaturesOffScreen";
import { useAiConsentState } from "./useAiConsentState";

/**
 * In the mobile shell, nothing below this renders until the user has allowed AI data sharing,
 * so no feature can send content to a provider first. On the web it is a pass-through.
 */
export function AiConsentGate({ children }: { children: ReactNode }) {
  const state = useAiConsentState();
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (state !== "declined") setReviewing(false);
  }, [state]);

  if (state === "loading") return <AppShellFallback />;
  if (state === "needsConsent") return <AiConsentScreen />;
  if (state === "declined") {
    return reviewing ? (
      <AiConsentScreen onDeclined={() => setReviewing(false)} />
    ) : (
      <AiFeaturesOffScreen onReview={() => setReviewing(true)} />
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 5: Run the gate test and confirm it passes**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiConsentGate.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wrap `AppShell` in `RootRoutes.tsx`**

Add `import { AiConsentGate } from "@/features/aiConsent/AiConsentGate";` and change the final return to:

```tsx
  if (isPublic) return <PublicShell animateOnMount={shellSwapped.current} />;
  return (
    <AiConsentGate>
      <Suspense fallback={<AppShellFallback />}>
        <AppShell animateOnMount={shellSwapped.current} />
      </Suspense>
    </AiConsentGate>
  );
```

- [ ] **Step 7: Keep the RootRoutes test focused on routing**

In `apps/web/src/shell/RootRoutes.test.tsx`, add next to the other `vi.mock` calls:

```tsx
vi.mock("@/features/aiConsent/AiConsentGate", () => ({
  AiConsentGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
```

(If the file has no `React` in scope for the type, use `import type { ReactNode } from "react";` and `children: ReactNode`.)

- [ ] **Step 8: Run the shell and consent tests**

Run: `bun run --cwd apps/web test -- src/shell src/features/aiConsent`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/shell/AppShellFallback.tsx apps/web/src/shell/RootRoutes.tsx apps/web/src/shell/RootRoutes.test.tsx apps/web/src/features/aiConsent/AiConsentGate.tsx apps/web/src/features/aiConsent/AiConsentGate.test.tsx
git commit -m "feat(consent): gate the mobile app behind AI data-sharing consent"
```

---

### Task 6b: Hide the native upload button until consent

Found in Task 6 review: `apps/mobile/app/index.tsx` renders the native `FileUploadButton` above the WebView on
`/notebook/:id` entry paths (deep links, push taps). It calls `api.documents.index.upload`, which schedules
OCR/embedding, so an unconsented user could send content to providers while the web gate is showing. Fix: the
web app reports its consent state over the existing bridge; the native shell shows the button only after a
`granted` report. Default is hidden. (Ships with the next native build.)

**Files:**
- Create: `apps/web/src/features/aiConsent/useReportAiConsentToShell.ts` (+ `.test.tsx`)
- Modify: `apps/web/src/features/aiConsent/AiConsentGate.tsx` (call the hook), `AiConsentGate.test.tsx` (mock it; add the reset-after-review test)
- Create: `apps/mobile/src/components/web/parseShellWebMessage.ts` (+ `.test.ts`)
- Modify: `apps/mobile/src/components/web/WebViewScreen.tsx`, `apps/mobile/app/index.tsx`

- [ ] **Step 1: Web hook (TDD).** `useReportAiConsentToShell(state: AiConsentState)`: in an effect keyed on the
  derived value, when `state` is `granted` post `{"type":"shell-web:ai-consent","granted":true}`, when
  `needsConsent` or `declined` post `granted:false`, otherwise post nothing. Post via
  `getNativeWebViewBridge()?.postMessage(JSON.stringify(...))` (same as `ThemeContext.tsx`). Only re-post when
  the boolean changes. Tests: mock `@/utils/platformDetection`'s `getNativeWebViewBridge` to return
  `{ postMessage: vi.fn() }`; assert payloads for each state, nothing for `loading`/`notApplicable`, and no
  duplicate post on a rerender with the same state. As built, the hook also posts `granted:false` when the
  gate unmounts after `granted`, so the native button hides again if the gate goes away.
- [ ] **Step 2: Call it in `AiConsentGate`** (`useReportAiConsentToShell(state)` right after
  `useAiConsentState()`). In `AiConsentGate.test.tsx` mock the hook to a no-op, and add the test: render
  `declined` → click off-screen (reviewing) → rerender `granted` (app) → rerender `declined` → expect
  `off-screen`.
- [ ] **Step 3: Native parser (TDD).** `parseShellWebMessage(raw: string)` returns
  `{ kind: "theme"; theme: "light" | "dark" } | { kind: "aiConsent"; granted: boolean } | null` (null for
  non-JSON, unknown types, or malformed fields). Tests cover each case.
- [ ] **Step 4: Wire native.** `WebViewScreen`: new optional prop `onAiConsentChange?: (granted: boolean) => void`;
  replace the inline theme parse with `parseShellWebMessage`, calling `onThemeChange` / `onAiConsentChange`, and
  pass anything else (null) to the auth bridge as today. `index.tsx`: `const [aiConsentGranted,
  setAiConsentGranted] = useState(false)`; pass `onAiConsentChange={setAiConsentGranted}`; render
  `FileUploadButton` only when `notebookIdForUpload && aiConsentGranted`.
- [ ] **Step 5: Verify and commit.** `bun run --cwd apps/web test -- src/features/aiConsent`,
  `bun run test:mobile`, `bun run typecheck:web`, `bun run typecheck:mobile`, `bun run lint`. Commit:
  `fix(consent): hide the native upload button until the web app reports AI consent`.

---

### Task 7: "AI data sharing" in the avatar menu

**Files:**
- Create: `apps/web/src/features/aiConsent/AiDataSharingDialog.tsx`
- Test: `apps/web/src/features/aiConsent/AiDataSharingDialog.test.tsx`
- Modify: `apps/web/src/features/auth/components/AvatarDropdown.tsx`
- Modify: `apps/web/src/features/auth/components/AvatarDropdown.test.tsx`

> As built: the dialog uses `AlertDialog` instead of `Dialog`, with closing guarded while a request is pending, and
> `AvatarDropdown` loads it lazily (tests use `findBy�` for it).

- [ ] **Step 1: Write the failing dialog test**

`apps/web/src/features/aiConsent/AiDataSharingDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation } from "convex/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastContext, type ToastContextValue } from "@/shared/contexts/useToast";
import { AI_PROVIDERS } from "./aiConsentCopy";
import { AiDataSharingDialog } from "./AiDataSharingDialog";

vi.mock("convex/react", () => ({ useMutation: vi.fn() }));
const decline = vi.fn();

function makeToast(): ToastContextValue {
  return {
    toast: vi.fn(() => "t"),
    success: vi.fn(() => "t"),
    error: vi.fn(() => "t"),
    info: vi.fn(() => "t"),
    loading: vi.fn(() => "t"),
    dismiss: vi.fn(),
  };
}

function renderDialog(onOpenChange = vi.fn(), toast = makeToast()) {
  render(
    <ToastContext.Provider value={toast}>
      <AiDataSharingDialog open onOpenChange={onOpenChange} />
    </ToastContext.Provider>
  );
  return { onOpenChange, toast };
}

describe("AiDataSharingDialog", () => {
  beforeEach(() => {
    decline.mockReset().mockResolvedValue(null);
    vi.mocked(useMutation).mockReturnValue(decline as never);
  });

  test("lists the providers", () => {
    renderDialog();
    for (const provider of AI_PROVIDERS) {
      expect(screen.getByText(provider.name)).toBeInTheDocument();
    }
  });

  test("Turn off declines and closes", async () => {
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(decline).toHaveBeenCalledWith({});
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  test("a failed Turn off shows an error and stays open", async () => {
    decline.mockRejectedValueOnce(new Error("offline"));
    const { onOpenChange, toast } = renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiDataSharingDialog.test.tsx`
Expected: FAIL, cannot resolve `./AiDataSharingDialog`.

- [ ] **Step 3: Implement the dialog**

`apps/web/src/features/aiConsent/AiDataSharingDialog.tsx`:

```tsx
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { AI_PROVIDERS } from "./aiConsentCopy";

interface AiDataSharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Withdraw AI data-sharing consent from the mobile app's avatar menu. */
export function AiDataSharingDialog({ open, onOpenChange }: AiDataSharingDialogProps) {
  const decline = useMutation(api.userPreferences.index.declineAiConsent);
  const { showError } = useServiceErrorToast();
  const [turningOff, setTurningOff] = useState(false);

  const handleTurnOff = async () => {
    setTurningOff(true);
    try {
      await decline({});
      onOpenChange(false);
    } catch (err) {
      showError(err);
    } finally {
      setTurningOff(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI data sharing</DialogTitle>
          <DialogDescription>
            You allowed SolomindLM to send your content to these services. Turning this off locks
            the app until you allow it again.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {AI_PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <span className="text-foreground">{provider.name}</span>: {provider.data.toLowerCase()}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={turningOff}>
            Keep on
          </Button>
          <Button variant="destructive" onClick={handleTurnOff} disabled={turningOff}>
            Turn off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `bun run --cwd apps/web test -- src/features/aiConsent/AiDataSharingDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing avatar-menu tests**

In `apps/web/src/features/auth/components/AvatarDropdown.test.tsx`, add next to the `LanguageSelector` mock:

```tsx
vi.mock("@/features/aiConsent/AiDataSharingDialog", () => ({
  AiDataSharingDialog: () => <div data-testid="ai-data-sharing-dialog" />,
}));
```

and add this `describe` block at the end of the file (it uses the file's existing `renderMenu`; open the menu the same way the file's other tests do, by clicking the "Account menu" button):

```tsx
describe("AI data sharing item", () => {
  afterEach(() => {
    delete window.__IS_NATIVE_SHELL__;
  });

  test("is shown in the mobile shell and opens the dialog", async () => {
    window.__IS_NATIVE_SHELL__ = true;
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /AI data sharing/ }));
    expect(screen.getByTestId("ai-data-sharing-dialog")).toBeInTheDocument();
  });

  test("is hidden on the web", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await screen.findByRole("menuitem", { name: /Logout/ });
    expect(screen.queryByRole("menuitem", { name: /AI data sharing/ })).not.toBeInTheDocument();
  });
});
```

Add `afterEach` to the file's `vitest` import.

- [ ] **Step 6: Run them and confirm the shell test fails**

Run: `bun run --cwd apps/web test -- src/features/auth/components/AvatarDropdown.test.tsx`
Expected: "is shown in the mobile shell" FAILS (no such menu item); everything else passes.

- [ ] **Step 7: Add the item to `AvatarDropdown.tsx`**

1. Add `Sparkles` to the `lucide-react` import.
2. Add imports:
   ```tsx
   import { AiDataSharingDialog } from "@/features/aiConsent/AiDataSharingDialog";
   import { isNativeShell } from "@/utils/platformDetection";
   ```
3. Next to `const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);` add:
   ```tsx
   const [aiSharingOpen, setAiSharingOpen] = useState(false);
   ```
4. Directly after `<LanguageSelector isAuthenticated={isAuthenticated} />` add:
   ```tsx
   {isAuthenticated && isNativeShell() ? (
     <DropdownMenuItem onSelect={() => setAiSharingOpen(true)}>
       <Sparkles />
       AI data sharing
     </DropdownMenuItem>
   ) : null}
   ```
5. Next to the `DeleteAccountDialog` mount at the bottom add:
   ```tsx
   {isAuthenticated && aiSharingOpen ? (
     <AiDataSharingDialog open onOpenChange={setAiSharingOpen} />
   ) : null}
   ```

- [ ] **Step 8: Run the avatar and consent tests**

Run: `bun run --cwd apps/web test -- src/features/auth/components/AvatarDropdown.test.tsx src/features/aiConsent`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/aiConsent/AiDataSharingDialog.tsx apps/web/src/features/aiConsent/AiDataSharingDialog.test.tsx apps/web/src/features/auth/components/AvatarDropdown.tsx apps/web/src/features/auth/components/AvatarDropdown.test.tsx
git commit -m "feat(consent): let mobile users turn AI data sharing off from the avatar menu"
```

---

### Task 8: Validation, manual check, PR

- [ ] **Step 1: Validation gates (run one at a time, not in parallel)**

```bash
bun run typecheck:web
bun run typecheck:convex
bun run lint
bun run lint:design
bun run test:convex
bun run test:web
```

Expected: all pass. Fix anything they report before continuing.

- [ ] **Step 2: Manual check in shell mode**

Start the web dev server (`preview_start` with the web config, or `bun run dev:web`) against the dev deployment and sign in with a test account. The gate reads `window.__IS_NATIVE_SHELL__`, which a reload clears, so set it with a Playwright init script: copy the `addInitScript` setup from `archive/app-store/screenshots/capture/lib.cjs` (it sets `__IS_NATIVE_SHELL__ = true` and stubs `ReactNativeWebView`) into a scratch script that opens the local dev URL with your signed-in profile. Note the shell's JWT cannot refresh in shell mode, so sign in fresh first. Walk through:
1. A user with no answer sees the consent screen; nothing else renders.
2. Not now → "AI features are off"; Review and allow → consent screen; Allow → app.
3. Avatar menu → AI data sharing → Turn off → "AI features are off".
4. Privacy policy link opens `/privacy`.
5. Without the flag (plain web), none of this appears and the avatar item is hidden.

Record what you saw in the PR description; include a screenshot of each screen.

- [ ] **Step 3: Rename the branch, push, open the PR**

```bash
git branch -m docs/ai-consent-spec feature/ai-data-consent
git push -u origin feature/ai-data-consent
gh pr create --title "feat(consent): ask mobile users before sending content to AI providers" --body-file <path-to-body>
```

PR body: link the spec and plan, the App Review rejection (guidelines 5.1.1(i) / 5.1.2(i)), the screenshots, and the test results. End with the Claude Code attribution line.

- [ ] **Step 4: After merge and deploy (not code)**
  1. On TestFlight build 4 against production: the consent screen appears on launch for an account that has not answered.
  2. App Store Connect → App Privacy: confirm the data types sent to these providers are declared as collected and used for app functionality, matching `aiConsentCopy.ts`.
  3. App Store Connect → App Review Information → Notes: add where the screen appears, that nothing reaches AI providers before consent, and the avatar-menu control.
  4. Do not resubmit; resubmission waits for the In-App Purchase build.
