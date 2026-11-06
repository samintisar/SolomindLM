# iOS In-App Purchase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell Pro through Apple in-app purchase in the iOS shell, verified and kept current by Convex, granting the same entitlement Stripe grants.

**Architecture:** The web Billing page (in the WebView) asks the native shell to load products, buy, restore and open subscription management over a request/response bridge. The shell uses `expo-iap` (StoreKit 2), tags each purchase with a per-user `appAccountToken`, sends the signed transaction to a Convex action that verifies it with `@apple/app-store-server-library`, then finishes the transaction. App Store Server Notifications V2 keep the stored state current. `isProUser` and a new `billing.getPlan` query read Stripe and App Store state together.

**Tech Stack:** Convex (queries/mutations, a `"use node"` action file, `convex-test` + vitest), `@apple/app-store-server-library`, React 19 web app (vitest + Testing Library), Expo 55 shell with `expo-iap` (jest-expo).

**Spec:** [`docs/superpowers/specs/2026-11-06-ios-in-app-purchase-design.md`](../specs/2026-11-06-ios-in-app-purchase-design.md).

**Deviations from the spec, decided while planning** (Task 13 writes them back into the spec):

1. Bundle ID and app Apple ID are constants in `convex/billing/appStoreProducts.ts`, not env vars. Neither is secret; it removes a deploy step.
2. One bridge message type, `shell-web:iap`, with an `action` field (`products` / `purchase` / `restore` / `manage`), instead of four types.
3. The purchase request times out after 5 minutes, not 60 s: the Apple sheet can stay up while the user signs in to a Sandbox account or confirms with Face ID. The reactive `getPlan` query shows Pro even if the reply is lost.
4. `appStoreSubscriptions` gets `gracePeriodExpiresAt` (from renewal info). During grace, `expiresAt` is already in the past, so the entitlement check needs the grace deadline.
5. Signature verification sits behind a thin wrapper module (`appStoreVerifier.ts`) that the Convex tests mock. Verification itself is exercised in Sandbox on TestFlight, not with self-signed fixtures.

**Conventions every task follows** (from `AGENTS.md` / `CLAUDE.md`):

- Read `convex/_generated/ai/guidelines.md` before the first Convex change.
- Define mutations with `mutation` / `internalMutation` from `convex/functions.ts` (Biome enforces it). Queries and actions come from `convex/_generated/server`.
- Throw `InputValidationError` (from `convex/_lib/errors.ts`) wrapped in `toConvexError` (from `convex/_lib/serviceErrors.ts`) for user-facing validation errors.
- No new `any`. Run `bun x biome format --write <files>` if a tool leaves CRLF.
- After adding a Convex module, run `npx convex codegen` (dev deployment; one deploy target across worktrees — use `--once` style commands only, never start a second `convex dev` watcher).
- Commit with `git commit -- <paths>` (other agents may share the worktree) and end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never kill processes by name.

---

## File structure

**Convex**

| File | Responsibility |
| --- | --- |
| `convex/billing/appStoreProducts.ts` (new) | Product IDs, bundle ID, app Apple ID; shared with web and mobile |
| `convex/billing/appStoreModel.ts` (new) | Pure rules: status from transaction / notification, status merge, entitlement; validators and types for verified data |
| `convex/billing/appStore.ts` (new) | `getAccountToken` mutation; internal mutations that apply verified transactions and notifications; notification idempotency |
| `convex/billing/appStoreVerifier.ts` (new, `"use node"`) | Wraps Apple's `SignedDataVerifier`: Production then Sandbox, normalizes payloads |
| `convex/billing/appleRootCertificates.ts` (new) | Apple Root CA - G3, base64 DER |
| `convex/billing/appStoreNode.ts` (new, `"use node"`) | `syncTransaction` action, `handleNotification` internal action |
| `convex/schema.ts` | Three new tables |
| `convex/_lib/limits.ts` | `isProUser` reads both stores; `findEntitledAppStoreSubscription` |
| `convex/billing/index.ts` | `getPlan` query, `hasAppStoreProInternal` |
| `convex/billing/actions.ts` | `createCheckoutSession` refuses App Store subscribers |
| `convex/feedback/index.ts` | `planTier` from `isProUser` |
| `convex/account/_purge.ts` | Purge the two user-owned tables |
| `convex/http.ts` | `POST /appstore/notifications` |

**Web** (`apps/web/src`)

| File | Responsibility |
| --- | --- |
| `utils/platformDetection.ts` | `shellSupportsIap`, `purchaseChannel`, `canOfferPurchases` |
| `features/billing/appStore/iapBridge.ts` (new) | Request/response client for `shell-web:iap` |
| `features/billing/appStore/useIapProducts.ts` (new) | Load products with loading / error / retry |
| `features/billing/appStore/appStorePricing.ts` (new) | Yearly savings from Apple's numeric prices |
| `features/billing/components/AppStorePlans.tsx` (new) | IAP plan cards, restore, manage, disclosure |
| `features/billing/components/BillingPage.tsx` | Branch on purchase channel and billing source |
| `features/billing/services/subscriptionApi.ts`, `features/billing/types.ts` | Read `getPlan`; expose `source` |
| `features/auth/components/DeleteAccountDialog.tsx` | App Store billing warning |

**Mobile** (`apps/mobile`)

| File | Responsibility |
| --- | --- |
| `src/utils/constants.ts` | `buildNativeShellInject({ iap })` |
| `src/components/web/parseShellWebMessage.ts` | Parse `shell-web:iap` requests |
| `src/components/web/buildShellIapResponseScript.ts` (new) | Inject the response event |
| `src/services/iap/iapMappers.ts` (new) | Pure: product mapping, error → outcome |
| `src/services/iap/iapService.ts` (new) | `expo-iap` calls, Convex sync, listeners |
| `src/services/iap/handleIapRequest.ts` (new) | Bridge request → service call → response payload |
| `src/components/web/WebViewScreen.tsx` | Route IAP requests, inject capability flag |
| `app/index.tsx` | Start listeners, re-sync on sign-in |
| `app.json`, `package.json`, `jest.config.js` | `expo-iap` plugin and dependency, `@convex/*` mapper |

---

### Task 1: Product constants and pure App Store rules

**Files:**
- Create: `convex/billing/appStoreProducts.ts`
- Create: `convex/billing/appStoreModel.ts`
- Test: `convex/billing/appStoreModel.test.ts`

- [ ] **Step 1: Write the product constants**

`convex/billing/appStoreProducts.ts`:

```ts
/**
 * App Store identifiers for Pro. Plain TypeScript (no Convex imports) so the web Billing page and
 * the iOS shell import the same copy through `@convex/billing/appStoreProducts`.
 */
export const APP_STORE_PRODUCTS = {
  monthly: "com.solomindlm.app.pro.monthly",
  yearly: "com.solomindlm.app.pro.yearly",
} as const;

export type AppStoreProductId = (typeof APP_STORE_PRODUCTS)[keyof typeof APP_STORE_PRODUCTS];

export const APP_STORE_PRODUCT_IDS: readonly AppStoreProductId[] = [
  APP_STORE_PRODUCTS.monthly,
  APP_STORE_PRODUCTS.yearly,
];

export function isAppStoreProductId(id: string): id is AppStoreProductId {
  return (APP_STORE_PRODUCT_IDS as readonly string[]).includes(id);
}

export function appStoreProductPeriod(id: AppStoreProductId): "month" | "year" {
  return id === APP_STORE_PRODUCTS.yearly ? "year" : "month";
}

/** Must match `ios.bundleIdentifier` in apps/mobile/app.json. */
export const APP_STORE_BUNDLE_ID = "com.solomindlm.app";

/** The app's Apple ID in App Store Connect; Apple's verifier requires it for Production. */
export const APP_STORE_APP_APPLE_ID = 6812221524;
```

- [ ] **Step 2: Write the failing tests for the rules**

`convex/billing/appStoreModel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  ENTITLEMENT_LEEWAY_MS,
  isAppStoreEntitled,
  mergeStatus,
  statusFromNotification,
  statusFromTransaction,
} from "./appStoreModel";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("statusFromTransaction", () => {
  test("active while unexpired", () => {
    expect(statusFromTransaction({ expiresAt: NOW + DAY }, NOW)).toBe("active");
  });
  test("expired once past expiry", () => {
    expect(statusFromTransaction({ expiresAt: NOW - 1 }, NOW)).toBe("expired");
  });
  test("revoked wins over expiry", () => {
    expect(statusFromTransaction({ expiresAt: NOW + DAY, revokedAt: NOW - 1 }, NOW)).toBe(
      "revoked"
    );
  });
});

describe("statusFromNotification", () => {
  test.each([
    ["SUBSCRIBED", undefined, "active"],
    ["SUBSCRIBED", "RESUBSCRIBE", "active"],
    ["DID_RENEW", "BILLING_RECOVERY", "active"],
    ["DID_FAIL_TO_RENEW", "GRACE_PERIOD", "grace"],
    ["DID_FAIL_TO_RENEW", undefined, "billing_retry"],
    ["GRACE_PERIOD_EXPIRED", undefined, "billing_retry"],
    ["EXPIRED", "VOLUNTARY", "expired"],
    ["REFUND", undefined, "revoked"],
    ["REVOKE", undefined, "revoked"],
  ] as const)("%s/%s → %s", (type, subtype, expected) => {
    expect(statusFromNotification(type, subtype)).toBe(expected);
  });

  test.each(["DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF", "RENEWAL_EXTENDED", "TEST"])(
    "%s leaves the status alone",
    (type) => {
      expect(statusFromNotification(type, undefined)).toBeUndefined();
    }
  );
});

describe("mergeStatus", () => {
  test("keeps grace and billing retry when the transaction alone says expired", () => {
    expect(mergeStatus("grace", "expired")).toBe("grace");
    expect(mergeStatus("billing_retry", "expired")).toBe("billing_retry");
  });
  test("otherwise the transaction decides", () => {
    expect(mergeStatus("expired", "active")).toBe("active");
    expect(mergeStatus("grace", "revoked")).toBe("revoked");
    expect(mergeStatus(undefined, "expired")).toBe("expired");
  });
});

describe("isAppStoreEntitled", () => {
  test("active and unexpired is Pro", () => {
    expect(isAppStoreEntitled({ status: "active", expiresAt: NOW + DAY }, NOW)).toBe(true);
  });
  test("active within the leeway after expiry is still Pro", () => {
    expect(
      isAppStoreEntitled({ status: "active", expiresAt: NOW - ENTITLEMENT_LEEWAY_MS + 1 }, NOW)
    ).toBe(true);
  });
  test("active past the leeway is not Pro (missed EXPIRED notification)", () => {
    expect(
      isAppStoreEntitled({ status: "active", expiresAt: NOW - ENTITLEMENT_LEEWAY_MS - 1 }, NOW)
    ).toBe(false);
  });
  test("grace uses the grace deadline", () => {
    expect(
      isAppStoreEntitled(
        { status: "grace", expiresAt: NOW - 5 * DAY, gracePeriodExpiresAt: NOW + DAY },
        NOW
      )
    ).toBe(true);
  });
  test.each(["billing_retry", "expired", "revoked"] as const)("%s is not Pro", (status) => {
    expect(isAppStoreEntitled({ status, expiresAt: NOW + DAY }, NOW)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStoreModel.test.ts`
Expected: FAIL, cannot resolve `./appStoreModel`.

- [ ] **Step 4: Write the rules**

`convex/billing/appStoreModel.ts`:

```ts
import { type Infer, v } from "convex/values";

export const appStoreStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace"),
  v.literal("billing_retry"),
  v.literal("expired"),
  v.literal("revoked")
);
export type AppStoreStatus = Infer<typeof appStoreStatusValidator>;

export const appStoreEnvironmentValidator = v.union(v.literal("Production"), v.literal("Sandbox"));

/** A signed transaction after Apple's signature check, in our own shape. */
export const verifiedTransactionValidator = v.object({
  environment: appStoreEnvironmentValidator,
  originalTransactionId: v.string(),
  transactionId: v.string(),
  productId: v.string(),
  expiresAt: v.number(),
  revokedAt: v.optional(v.number()),
  /** Lower-cased. */
  appAccountToken: v.optional(v.string()),
});
export type VerifiedTransaction = Infer<typeof verifiedTransactionValidator>;

export const verifiedRenewalValidator = v.object({
  autoRenews: v.boolean(),
  autoRenewProductId: v.optional(v.string()),
  gracePeriodExpiresAt: v.optional(v.number()),
});
export type VerifiedRenewal = Infer<typeof verifiedRenewalValidator>;

export interface VerifiedNotification {
  notificationUUID: string;
  notificationType: string;
  subtype?: string;
  environment: VerifiedTransaction["environment"];
  transaction?: VerifiedTransaction;
  renewal?: VerifiedRenewal;
}

/** Covers a renewal notification that arrives late; also bounds a missed EXPIRED notification. */
export const ENTITLEMENT_LEEWAY_MS = 24 * 60 * 60 * 1000;

export function statusFromTransaction(
  tx: { expiresAt: number; revokedAt?: number },
  now: number
): AppStoreStatus {
  if (tx.revokedAt !== undefined) return "revoked";
  return tx.expiresAt > now ? "active" : "expired";
}

/** The status an App Store Server Notification sets, or undefined when it leaves it alone. */
export function statusFromNotification(
  notificationType: string,
  subtype: string | undefined
): AppStoreStatus | undefined {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
      return "active";
    case "DID_FAIL_TO_RENEW":
      return subtype === "GRACE_PERIOD" ? "grace" : "billing_retry";
    case "GRACE_PERIOD_EXPIRED":
      return "billing_retry";
    case "EXPIRED":
      return "expired";
    case "REFUND":
    case "REVOKE":
      return "revoked";
    default:
      return undefined;
  }
}

/**
 * A transaction on its own can only say active / expired / revoked. Grace and billing retry come
 * from notifications, so an expired transaction must not overwrite them.
 */
export function mergeStatus(
  existing: AppStoreStatus | undefined,
  fromTransaction: AppStoreStatus
): AppStoreStatus {
  if (fromTransaction === "expired" && (existing === "grace" || existing === "billing_retry")) {
    return existing;
  }
  return fromTransaction;
}

export function isAppStoreEntitled(
  row: { status: AppStoreStatus; expiresAt: number; gracePeriodExpiresAt?: number },
  now: number
): boolean {
  if (row.status !== "active" && row.status !== "grace") return false;
  const accessUntil = Math.max(row.expiresAt, row.gracePeriodExpiresAt ?? 0);
  return accessUntil + ENTITLEMENT_LEEWAY_MS > now;
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `bun run test:convex -- convex/billing/appStoreModel.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add convex/billing/appStoreProducts.ts convex/billing/appStoreModel.ts convex/billing/appStoreModel.test.ts
git commit -m "feat(billing): App Store product ids and subscription status rules" -- convex/billing/appStoreProducts.ts convex/billing/appStoreModel.ts convex/billing/appStoreModel.test.ts
```

---

### Task 2: Tables, Pro check, feedback tier, account purge

**Files:**
- Modify: `convex/schema.ts` (after `stripeWebhookEvents`, ~line 553)
- Modify: `convex/_lib/limits.ts:26-34`
- Modify: `convex/feedback/index.ts:29-35`
- Modify: `convex/account/_purge.ts` (next to the `stripeSubscriptions` entry, ~line 566)
- Modify: `convex/account/deletion.test.ts` (`DIRECT_USER_TABLES`, ~line 41)
- Test: `convex/billing/appStore.test.ts` (new)

- [ ] **Step 1: Add the tables**

In `convex/schema.ts`, import the validators at the top:

```ts
import { appStoreEnvironmentValidator, appStoreStatusValidator } from "./billing/appStoreModel";
```

and add after `stripeWebhookEvents`:

```ts
  // App Store (iOS in-app purchase)
  appStoreAccountTokens: defineTable({
    userId: v.id("users"),
    /** Random UUID sent as StoreKit's appAccountToken; ties purchases to this account. */
    token: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  appStoreSubscriptions: defineTable({
    userId: v.id("users"),
    originalTransactionId: v.string(),
    latestTransactionId: v.string(),
    productId: v.string(),
    environment: appStoreEnvironmentValidator,
    status: appStoreStatusValidator,
    expiresAt: v.number(),
    gracePeriodExpiresAt: v.optional(v.number()),
    autoRenews: v.boolean(),
    autoRenewProductId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_original_transaction", ["originalTransactionId"]),

  appStoreNotificationEvents: defineTable({
    notificationUUID: v.string(),
    notificationType: v.string(),
    processed: v.boolean(),
    errorMessage: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_uuid", ["notificationUUID"]),
```

If importing from `./billing/appStoreModel` into the schema creates an import cycle error in typecheck, move the two validators into `convex/billing/appStoreModel.ts`'s own top and keep the import; `appStoreModel.ts` imports only `convex/values`, so no cycle is expected.

- [ ] **Step 2: Write the failing tests**

`convex/billing/appStore.test.ts` (later tasks add more `describe` blocks to this file):

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { APP_STORE_PRODUCTS } from "./appStoreProducts";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./billing/appStore.ts", "./billing/index.ts"]);

const DAY = 24 * 60 * 60 * 1000;

type T = ReturnType<typeof convexTest>;

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

async function seedAppStoreSubscription(
  t: T,
  userId: Id<"users">,
  overrides: Partial<{
    originalTransactionId: string;
    status: "active" | "grace" | "billing_retry" | "expired" | "revoked";
    expiresAt: number;
    gracePeriodExpiresAt: number;
    productId: string;
  }> = {}
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("appStoreSubscriptions", {
      userId,
      originalTransactionId: overrides.originalTransactionId ?? "1000000000000001",
      latestTransactionId: "2000000000000001",
      productId: overrides.productId ?? APP_STORE_PRODUCTS.monthly,
      environment: "Sandbox",
      status: overrides.status ?? "active",
      expiresAt: overrides.expiresAt ?? now + 30 * DAY,
      ...(overrides.gracePeriodExpiresAt !== undefined
        ? { gracePeriodExpiresAt: overrides.gracePeriodExpiresAt }
        : {}),
      autoRenews: true,
      createdAt: now,
      updatedAt: now,
    })
  );
}

describe("isProUser", () => {
  test("an active App Store subscription is Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("an expired App Store subscription is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { status: "expired" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("an 'active' row long past expiry is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { expiresAt: Date.now() - 3 * DAY });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("a user with neither store is not Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });
});
```

Also add `"appStoreSubscriptions"` and `"appStoreAccountTokens"` to `DIRECT_USER_TABLES` in `convex/account/deletion.test.ts` (after `"stripeSubscriptions"`).

- [ ] **Step 3: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStore.test.ts convex/account/deletion.test.ts`
Expected: FAIL — the App Store row doesn't make the user Pro; the deletion tests fail because the purge leaves the new tables' rows behind.

- [ ] **Step 4: Read both stores in `isProUser`**

Replace `isProUser` in `convex/_lib/limits.ts` and add the helper below it:

```ts
import type { Doc } from "../_generated/dataModel";
import { isAppStoreEntitled } from "../billing/appStoreModel";

/** True when the user has an active Stripe subscription or an entitled App Store subscription. */
export async function isProUser(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const subscription = await ctx.db
    .query("stripeSubscriptions")
    .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .first();
  if (subscription) return true;
  return (await findEntitledAppStoreSubscription(ctx, userId, Date.now())) !== null;
}

/** The user's App Store subscription that currently grants Pro, if any. */
export async function findEntitledAppStoreSubscription(
  ctx: QueryCtx,
  userId: Id<"users">,
  now: number
): Promise<Doc<"appStoreSubscriptions"> | null> {
  const rows = await ctx.db
    .query("appStoreSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(10);
  return rows.find((row) => isAppStoreEntitled(row, now)) ?? null;
}
```

(Merge the `Doc` import into the existing `import { Id } from "../_generated/dataModel";` line.)

- [ ] **Step 5: Feedback tier from `isProUser`**

In `convex/feedback/index.ts`, replace the body of `derivePlanTier`:

```ts
async function derivePlanTier(ctx: MutationCtx, userId: Id<"users">): Promise<"free" | "pro"> {
  return (await isProUser(ctx, userId)) ? "pro" : "free";
}
```

and import `isProUser` from `"../_lib/limits"`. Update the schema comment on `planTier` (`convex/schema.ts`, "Server-derived at submit time from the active Stripe subscription.") to "Server-derived at submit time from `isProUser` (Stripe or App Store)."

- [ ] **Step 6: Purge the new tables**

In `convex/account/_purge.ts`, after the `direct("stripeSubscriptions", …)` entry:

```ts
  direct("appStoreSubscriptions", (ctx, userId, n) =>
    ctx.db
      .query("appStoreSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
  direct("appStoreAccountTokens", (ctx, userId, n) =>
    ctx.db
      .query("appStoreAccountTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(n)
  ),
```

`appStoreNotificationEvents` has no `userId` and is not purged (same as `stripeWebhookEvents`).

- [ ] **Step 7: Run the tests to see them pass**

Run: `bun run test:convex -- convex/billing/appStore.test.ts convex/account/deletion.test.ts convex/feedback`
Expected: PASS, including "covers every table that references a user".

- [ ] **Step 8: Typecheck and commit**

Run: `bun run typecheck:convex` — expected: no errors.

```bash
git commit -m "feat(billing): store App Store subscriptions and count them as Pro" -- convex/schema.ts convex/_lib/limits.ts convex/feedback/index.ts convex/account/_purge.ts convex/account/deletion.test.ts convex/billing/appStore.test.ts
```

---

### Task 3: Account token and applying a verified transaction

**Files:**
- Create: `convex/billing/appStore.ts`
- Test: `convex/billing/appStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `convex/billing/appStore.test.ts` (add `api`, `internal` imports: `import { api, internal } from "../_generated/api";`):

```ts
function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

function transaction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    environment: "Sandbox" as const,
    originalTransactionId: "1000000000000001",
    transactionId: "2000000000000001",
    productId: APP_STORE_PRODUCTS.monthly,
    expiresAt: Date.now() + 30 * DAY,
    ...overrides,
  };
}

describe("getAccountToken", () => {
  test("creates one token per user and returns it again", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const first = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const second = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.billing.appStore.getAccountToken, {})).rejects.toThrow();
  });
});

describe("applyVerifiedTransaction", () => {
  test("creates an active subscription for the caller", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ appAccountToken: token }),
    });
    expect(result).toEqual({ status: "active" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("rejects a token that belongs to another account", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);
    const token = await asUser(t, owner).mutation(api.billing.appStore.getAccountToken, {});
    await expect(
      t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
        userId: other,
        transaction: transaction({ appAccountToken: token }),
      })
    ).rejects.toThrow(/linked to another SolomindLM account/);
  });

  test("rejects a subscription already stored for another account", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);
    await seedAppStoreSubscription(t, owner);
    await expect(
      t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
        userId: other,
        transaction: transaction(),
      })
    ).rejects.toThrow(/linked to another SolomindLM account/);
  });

  test("accepts a token no account owns (its account was deleted)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ appAccountToken: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(result).toEqual({ status: "active" });
  });

  test("an older transaction does not roll back a newer expiry", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const later = Date.now() + 60 * DAY;
    await seedAppStoreSubscription(t, userId, { expiresAt: later });
    await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ expiresAt: Date.now() + DAY }),
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.expiresAt).toBe(later);
  });

  test("an expired transaction keeps a grace status from notifications", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, {
      status: "grace",
      expiresAt: Date.now() - 2 * DAY,
      gracePeriodExpiresAt: Date.now() + 5 * DAY,
    });
    const result = await t.mutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction: transaction({ expiresAt: Date.now() - 2 * DAY }),
    });
    expect(result).toEqual({ status: "grace" });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStore.test.ts`
Expected: FAIL, `api.billing.appStore` is undefined.

- [ ] **Step 3: Write `convex/billing/appStore.ts`**

```ts
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";
import { internalMutation, mutation } from "../functions";
import {
  appStoreStatusValidator,
  mergeStatus,
  statusFromTransaction,
  verifiedTransactionValidator,
} from "./appStoreModel";

/** The caller's appAccountToken, created on first use. */
export const getAccountToken = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    const existing = await ctx.db
      .query("appStoreAccountTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) return existing.token;
    const token = crypto.randomUUID();
    await ctx.db.insert("appStoreAccountTokens", { userId, token, createdAt: Date.now() });
    return token;
  },
});

function linkedElsewhereError() {
  return toConvexError(
    new InputValidationError(
      "This Apple ID's subscription is linked to another SolomindLM account.",
      { field: "appAccountToken" }
    )
  );
}

async function findByOriginalTransaction(
  ctx: MutationCtx,
  originalTransactionId: string
): Promise<Doc<"appStoreSubscriptions"> | null> {
  return ctx.db
    .query("appStoreSubscriptions")
    .withIndex("by_original_transaction", (q) =>
      q.eq("originalTransactionId", originalTransactionId)
    )
    .first();
}

async function findTokenOwner(ctx: MutationCtx, token: string): Promise<Id<"users"> | null> {
  const row = await ctx.db
    .query("appStoreAccountTokens")
    .withIndex("by_token", (q) => q.eq("token", token.toLowerCase()))
    .first();
  return row?.userId ?? null;
}

/**
 * Store a transaction the app sent after Apple's signature check (`appStoreNode.syncTransaction`).
 * Refuses a purchase tied to another existing account; a token nobody owns (deleted account)
 * moves to the caller.
 */
export const applyVerifiedTransaction = internalMutation({
  args: { userId: v.id("users"), transaction: verifiedTransactionValidator },
  returns: v.object({ status: appStoreStatusValidator }),
  handler: async (ctx, { userId, transaction }) => {
    const now = Date.now();
    if (transaction.appAccountToken) {
      const owner = await findTokenOwner(ctx, transaction.appAccountToken);
      if (owner && owner !== userId) throw linkedElsewhereError();
    }
    const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
    if (existing && existing.userId !== userId) throw linkedElsewhereError();

    const fromTransaction = statusFromTransaction(transaction, now);

    if (existing) {
      // Restores can deliver an older transaction; never roll back to an earlier expiry.
      if (transaction.revokedAt === undefined && transaction.expiresAt < existing.expiresAt) {
        return { status: existing.status };
      }
      const status = mergeStatus(existing.status, fromTransaction);
      await ctx.db.patch(existing._id, {
        latestTransactionId: transaction.transactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        expiresAt: transaction.expiresAt,
        status,
        updatedAt: now,
      });
      return { status };
    }

    await ctx.db.insert("appStoreSubscriptions", {
      userId,
      originalTransactionId: transaction.originalTransactionId,
      latestTransactionId: transaction.transactionId,
      productId: transaction.productId,
      environment: transaction.environment,
      status: fromTransaction,
      expiresAt: transaction.expiresAt,
      autoRenews: true,
      createdAt: now,
      updatedAt: now,
    });
    return { status: fromTransaction };
  },
});
```

Note on "an older transaction does not roll back": the existing row is checked with `transaction.expiresAt < existing.expiresAt`; equal expiries proceed (idempotent re-sync).

- [ ] **Step 4: Codegen, then run the tests**

Run: `npx convex codegen` then `bun run test:convex -- convex/billing/appStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): App Store account tokens and verified-transaction sync" -- convex/billing/appStore.ts convex/billing/appStore.test.ts convex/_generated
```

---

### Task 4: Applying notifications and idempotency

**Files:**
- Modify: `convex/billing/appStore.ts`
- Test: `convex/billing/appStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("notifications", () => {
  test("claim → processed → duplicate", async () => {
    const t = convexTest(schema, modules);
    const args = { notificationUUID: "n-1", notificationType: "DID_RENEW" };
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "new",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "in_flight",
    });
    await t.mutation(internal.billing.appStore.markNotificationProcessed, {
      notificationUUID: "n-1",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "processed",
    });
  });

  test("a failed attempt can be claimed again right away", async () => {
    const t = convexTest(schema, modules);
    const args = { notificationUUID: "n-2", notificationType: "DID_RENEW" };
    await t.mutation(internal.billing.appStore.claimNotification, args);
    await t.mutation(internal.billing.appStore.markNotificationFailed, {
      notificationUUID: "n-2",
      errorMessage: "boom",
    });
    expect(await t.mutation(internal.billing.appStore.claimNotification, args)).toEqual({
      status: "new",
    });
  });

  test("DID_FAIL_TO_RENEW with GRACE_PERIOD keeps Pro until the grace deadline", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationType: "DID_FAIL_TO_RENEW",
      subtype: "GRACE_PERIOD",
      transaction: transaction({ expiresAt: Date.now() - DAY }),
      renewal: { autoRenews: true, gracePeriodExpiresAt: Date.now() + 5 * DAY },
    });
    expect(result).toEqual({ applied: true });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row?.status).toBe("grace");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("REFUND revokes Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationType: "REFUND",
      transaction: transaction({ revokedAt: Date.now() }),
    });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(false);
  });

  test("DID_CHANGE_RENEWAL_STATUS records auto-renew off without changing status", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    await t.mutation(internal.billing.appStore.applyNotification, {
      notificationType: "DID_CHANGE_RENEWAL_STATUS",
      subtype: "AUTO_RENEW_DISABLED",
      transaction: transaction(),
      renewal: { autoRenews: false },
    });
    const row = await t.run((ctx) => ctx.db.query("appStoreSubscriptions").first());
    expect(row).toMatchObject({ status: "active", autoRenews: false });
  });

  test("an unknown subscription is linked through its account token", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationType: "SUBSCRIBED",
      subtype: "INITIAL_BUY",
      transaction: transaction({ appAccountToken: token }),
      renewal: { autoRenews: true },
    });
    expect(result).toEqual({ applied: true });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("a subscription with no known owner is not applied", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(internal.billing.appStore.applyNotification, {
      notificationType: "DID_RENEW",
      transaction: transaction(),
    });
    expect(result).toEqual({ applied: false });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStore.test.ts`
Expected: FAIL, `claimNotification` / `applyNotification` undefined.

- [ ] **Step 3: Add the mutations to `convex/billing/appStore.ts`**

Add `statusFromNotification` and `verifiedRenewalValidator` to the `./appStoreModel` import, then append:

```ts
/** A recent unprocessed claim is treated as still running (same idea as Stripe's webhook claim). */
const NOTIFICATION_IN_FLIGHT_WINDOW_MS = 2 * 60 * 1000;

async function findNotification(ctx: MutationCtx, notificationUUID: string) {
  return ctx.db
    .query("appStoreNotificationEvents")
    .withIndex("by_uuid", (q) => q.eq("notificationUUID", notificationUUID))
    .first();
}

/**
 * Claim an App Store notification before handling it. Apple retries and can redeliver while an
 * earlier attempt still runs: "processed" → skip, "in_flight" → fail so Apple retries later.
 */
export const claimNotification = internalMutation({
  args: { notificationUUID: v.string(), notificationType: v.string() },
  returns: v.object({
    status: v.union(v.literal("new"), v.literal("processed"), v.literal("in_flight")),
  }),
  handler: async (ctx, args) => {
    const existing = await findNotification(ctx, args.notificationUUID);
    const now = Date.now();
    if (existing) {
      if (existing.processed) return { status: "processed" as const };
      const priorAttemptFailed = existing.errorMessage != null;
      if (!priorAttemptFailed && now - existing.createdAt < NOTIFICATION_IN_FLIGHT_WINDOW_MS) {
        return { status: "in_flight" as const };
      }
      await ctx.db.patch(existing._id, { createdAt: now, errorMessage: undefined });
      return { status: "new" as const };
    }
    await ctx.db.insert("appStoreNotificationEvents", {
      notificationUUID: args.notificationUUID,
      notificationType: args.notificationType,
      processed: false,
      createdAt: now,
    });
    return { status: "new" as const };
  },
});

export const markNotificationProcessed = internalMutation({
  args: { notificationUUID: v.string() },
  returns: v.null(),
  handler: async (ctx, { notificationUUID }) => {
    const row = await findNotification(ctx, notificationUUID);
    if (row) {
      await ctx.db.patch(row._id, {
        processed: true,
        processedAt: Date.now(),
        errorMessage: undefined,
      });
    }
    return null;
  },
});

export const markNotificationFailed = internalMutation({
  args: { notificationUUID: v.string(), errorMessage: v.string() },
  returns: v.null(),
  handler: async (ctx, { notificationUUID, errorMessage }) => {
    const row = await findNotification(ctx, notificationUUID);
    if (row) await ctx.db.patch(row._id, { errorMessage });
    return null;
  },
});

/**
 * Apply a verified notification's transaction and renewal info. Finds the subscription by
 * originalTransactionId, else the user by appAccountToken; `applied: false` when neither is known.
 */
export const applyNotification = internalMutation({
  args: {
    notificationType: v.string(),
    subtype: v.optional(v.string()),
    transaction: verifiedTransactionValidator,
    renewal: v.optional(verifiedRenewalValidator),
  },
  returns: v.object({ applied: v.boolean() }),
  handler: async (ctx, { notificationType, subtype, transaction, renewal }) => {
    const now = Date.now();
    const existing = await findByOriginalTransaction(ctx, transaction.originalTransactionId);
    const userId =
      existing?.userId ??
      (transaction.appAccountToken ? await findTokenOwner(ctx, transaction.appAccountToken) : null);
    if (!userId) return { applied: false };

    const fromTransaction = statusFromTransaction(transaction, now);
    const status =
      statusFromNotification(notificationType, subtype) ??
      mergeStatus(existing?.status, fromTransaction);
    const fields = {
      latestTransactionId: transaction.transactionId,
      productId: transaction.productId,
      environment: transaction.environment,
      expiresAt: transaction.expiresAt,
      status,
      updatedAt: now,
      ...(renewal
        ? {
            autoRenews: renewal.autoRenews,
            autoRenewProductId: renewal.autoRenewProductId,
            gracePeriodExpiresAt: renewal.gracePeriodExpiresAt,
          }
        : {}),
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("appStoreSubscriptions", {
        userId,
        originalTransactionId: transaction.originalTransactionId,
        createdAt: now,
        ...fields,
        autoRenews: renewal?.autoRenews ?? true,
      });
    }
    return { applied: true };
  },
});
```

(`patch` with an `undefined` field removes it, which is intended for `autoRenewProductId` / `gracePeriodExpiresAt` when Apple omits them. On `insert`, strip undefined fields if Convex rejects them: build `fields` with conditional spreads for those two if the test fails with "undefined is not a valid Convex value".)

- [ ] **Step 4: Codegen, then run the tests**

Run: `npx convex codegen` then `bun run test:convex -- convex/billing/appStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): apply App Store server notifications idempotently" -- convex/billing/appStore.ts convex/billing/appStore.test.ts convex/_generated
```

---

### Task 5: `getPlan` and refusing Stripe checkout for App Store subscribers

**Files:**
- Modify: `convex/billing/index.ts`
- Modify: `convex/billing/actions.ts` (`createCheckoutSession`, after the identity check ~line 70)
- Test: `convex/billing/appStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("getPlan", () => {
  test("null when signed out", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.billing.index.getPlan, {})).toBeNull();
  });

  test("free with no subscriptions", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "free",
      source: null,
      stripe: null,
      appStore: null,
    });
  });

  test("pro from the App Store", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId, { productId: APP_STORE_PRODUCTS.yearly });
    expect(await asUser(t, userId).query(api.billing.index.getPlan, {})).toMatchObject({
      tier: "pro",
      source: "app_store",
      appStore: { productId: APP_STORE_PRODUCTS.yearly, autoRenews: true },
    });
  });
});

describe("createCheckoutSession", () => {
  test("refuses users who already have Pro from the App Store", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedAppStoreSubscription(t, userId);
    await expect(
      asUser(t, userId).action(api.billing.index.createCheckoutSession, {
        interval: "month",
        successUrl: "https://example.com/ok",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow(/App Store/);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStore.test.ts`
Expected: FAIL (`getPlan` undefined; checkout fails for a different reason — missing price ID or Stripe — not `/App Store/`).

- [ ] **Step 3: Add `getPlan` and `hasAppStoreProInternal` to `convex/billing/index.ts`**

Add the import `import { findEntitledAppStoreSubscription } from "../_lib/limits";` and, after `getCurrent`:

```ts
/**
 * The caller's plan across billing sources. The Billing page, Header and limits read this instead
 * of `stripeSubscriptions` so Pro bought in the iOS app counts everywhere.
 */
export const getPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const stripe = await ctx.db
      .query("stripeSubscriptions")
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .first();
    const appStore = await findEntitledAppStoreSubscription(ctx, userId, Date.now());
    return {
      tier: stripe || appStore ? ("pro" as const) : ("free" as const),
      source: stripe ? ("stripe" as const) : appStore ? ("app_store" as const) : null,
      stripe,
      appStore: appStore
        ? {
            productId: appStore.productId,
            status: appStore.status,
            expiresAt: appStore.expiresAt,
            autoRenews: appStore.autoRenews,
            environment: appStore.environment,
          }
        : null,
    };
  },
});

export const hasAppStoreProInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { userId }) =>
    (await findEntitledAppStoreSubscription(ctx, userId, Date.now())) !== null,
});
```

(`getPlan` has no `returns` validator because `stripe` is a full document, matching `getCurrent`'s existing looseness. If Biome or the Convex guidelines require one, use `v.union(v.null(), v.any())` like `getCurrent`.)

- [ ] **Step 4: Refuse checkout in `convex/billing/actions.ts`**

In `createCheckoutSession`, right after `if (!identity) throw new Error("No identity found");`:

```ts
    // Someone who pays through Apple must not start a second, Stripe subscription.
    if (await ctx.runQuery(internal.billing.index.hasAppStoreProInternal, { userId })) {
      throw new Error(
        "You already have Pro through the App Store. Manage it in your iPhone's Settings."
      );
    }
```

(Check that `internal` is already imported in `actions.ts`; add `import { internal } from "../_generated/api";` if not.)

- [ ] **Step 5: Codegen, run tests, commit**

Run: `npx convex codegen` then `bun run test:convex -- convex/billing`
Expected: PASS (existing `convex/billing/index.test.ts` still passes).

```bash
git commit -m "feat(billing): getPlan across Stripe and App Store; block double billing" -- convex/billing/index.ts convex/billing/actions.ts convex/billing/appStore.test.ts convex/_generated
```

---

### Task 6: Apple signature verification wrapper

**Files:**
- Modify: `package.json` (root; dependency), `convex.json` (`node.externalPackages`)
- Create: `convex/billing/appleRootCertificates.ts`
- Create: `convex/billing/appStoreVerifier.ts`

> **Before Step 2 the controller must ask the user** for permission to download `AppleRootCA-G3.cer` (about 0.6 KB) from `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`.

- [ ] **Step 1: Add the dependency**

Run: `bun add @apple/app-store-server-library` (root `package.json`, next to `stripe`).
Add `"@apple/app-store-server-library"` to `convex.json` → `node.externalPackages` after `"stripe"`.

Then look up the exported names this task uses in `node_modules/@apple/app-store-server-library/dist/index.d.ts` (or the package's types entry): `SignedDataVerifier`, `VerificationException`, `VerificationStatus`, `Environment`, `AutoRenewStatus`, `JWSTransactionDecodedPayload`, `JWSRenewalInfoDecodedPayload`, and the method `verifyAndDecodeRenewalInfo`. If a name differs, use the real one and say so in the report.

- [ ] **Step 2: Embed Apple's root certificate**

Download to the scratchpad directory (not the repo), check its fingerprint, and base64 it:

```bash
curl -fsSL -o "$SCRATCH/AppleRootCA-G3.cer" https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
openssl x509 -inform der -in "$SCRATCH/AppleRootCA-G3.cer" -noout -subject -fingerprint -sha256
base64 -w0 "$SCRATCH/AppleRootCA-G3.cer"
```

Expected subject: `CN = Apple Root CA - G3, OU = Apple Certification Authority, O = Apple Inc., C = US`. Report the SHA-256 fingerprint to the controller, who compares it with the one listed on `https://www.apple.com/certificateauthority/`.

`convex/billing/appleRootCertificates.ts`:

```ts
/**
 * Apple Root CA - G3 (DER, base64), from https://www.apple.com/certificateauthority/.
 * App Store signed transactions and notifications chain to it. Public; safe to commit.
 * SHA-256 fingerprint: <paste the fingerprint printed in Step 2>
 */
export const APPLE_ROOT_CA_G3_BASE64 = "<paste the base64 output>";
```

(The two `<…>` markers are filled with the command output in this step; nothing is left as a placeholder in the commit.)

- [ ] **Step 3: Write the verifier wrapper**

`convex/billing/appStoreVerifier.ts`:

```ts
"use node";

import {
  AutoRenewStatus,
  Environment,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { APP_STORE_APP_APPLE_ID, APP_STORE_BUNDLE_ID } from "./appStoreProducts";
import type { VerifiedNotification, VerifiedRenewal, VerifiedTransaction } from "./appStoreModel";
import { APPLE_ROOT_CA_G3_BASE64 } from "./appleRootCertificates";

/** Apple's signature or payload checks failed: the data is not trustworthy. */
export class AppStoreVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppStoreVerificationError";
  }
}

type StoreEnvironment = VerifiedTransaction["environment"];

const verifiers = new Map<StoreEnvironment, SignedDataVerifier>();

function verifierFor(environment: StoreEnvironment): SignedDataVerifier {
  let verifier = verifiers.get(environment);
  if (!verifier) {
    verifier = new SignedDataVerifier(
      [Buffer.from(APPLE_ROOT_CA_G3_BASE64, "base64")],
      true,
      environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
      APP_STORE_BUNDLE_ID,
      APP_STORE_APP_APPLE_ID
    );
    verifiers.set(environment, verifier);
  }
  return verifier;
}

function rejected(error: VerificationException): AppStoreVerificationError {
  return new AppStoreVerificationError(`App Store signature rejected (status ${error.status})`, {
    cause: error,
  });
}

/** Production first, then Sandbox: App Review and TestFlight buy in Sandbox against production. */
async function inEitherEnvironment<T>(
  verify: (verifier: SignedDataVerifier) => Promise<T>
): Promise<{ environment: StoreEnvironment; value: T }> {
  try {
    return { environment: "Production", value: await verify(verifierFor("Production")) };
  } catch (error) {
    if (!(error instanceof VerificationException)) throw error;
    if (error.status !== VerificationStatus.INVALID_ENVIRONMENT) throw rejected(error);
  }
  try {
    return { environment: "Sandbox", value: await verify(verifierFor("Sandbox")) };
  } catch (error) {
    if (error instanceof VerificationException) throw rejected(error);
    throw error;
  }
}

function toTransaction(
  environment: StoreEnvironment,
  tx: JWSTransactionDecodedPayload
): VerifiedTransaction {
  if (!tx.originalTransactionId || !tx.transactionId || !tx.productId || tx.expiresDate == null) {
    throw new AppStoreVerificationError("Transaction is missing required subscription fields");
  }
  return {
    environment,
    originalTransactionId: tx.originalTransactionId,
    transactionId: tx.transactionId,
    productId: tx.productId,
    expiresAt: tx.expiresDate,
    ...(tx.revocationDate != null ? { revokedAt: tx.revocationDate } : {}),
    ...(tx.appAccountToken ? { appAccountToken: tx.appAccountToken.toLowerCase() } : {}),
  };
}

function toRenewal(info: JWSRenewalInfoDecodedPayload): VerifiedRenewal {
  return {
    autoRenews: info.autoRenewStatus === AutoRenewStatus.ON,
    ...(info.autoRenewProductId ? { autoRenewProductId: info.autoRenewProductId } : {}),
    ...(info.gracePeriodExpiresDate != null
      ? { gracePeriodExpiresAt: info.gracePeriodExpiresDate }
      : {}),
  };
}

async function decodeWith<T>(verifier: SignedDataVerifier, run: (v: SignedDataVerifier) => Promise<T>) {
  try {
    return await run(verifier);
  } catch (error) {
    if (error instanceof VerificationException) throw rejected(error);
    throw error;
  }
}

/** Verify a transaction JWS the app received from StoreKit. */
export async function verifyTransaction(signedTransaction: string): Promise<VerifiedTransaction> {
  const { environment, value } = await inEitherEnvironment((verifier) =>
    verifier.verifyAndDecodeTransaction(signedTransaction)
  );
  return toTransaction(environment, value);
}

/** Verify an App Store Server Notification V2 `signedPayload` and its nested signed data. */
export async function verifyNotification(signedPayload: string): Promise<VerifiedNotification> {
  const { environment, value: payload } = await inEitherEnvironment((verifier) =>
    verifier.verifyAndDecodeNotification(signedPayload)
  );
  if (!payload.notificationUUID || !payload.notificationType) {
    throw new AppStoreVerificationError("Notification is missing its id or type");
  }
  const verifier = verifierFor(environment);
  const signedTransaction = payload.data?.signedTransactionInfo;
  const signedRenewal = payload.data?.signedRenewalInfo;
  const transaction = signedTransaction
    ? toTransaction(
        environment,
        await decodeWith(verifier, (v) => v.verifyAndDecodeTransaction(signedTransaction))
      )
    : undefined;
  const renewal = signedRenewal
    ? toRenewal(await decodeWith(verifier, (v) => v.verifyAndDecodeRenewalInfo(signedRenewal)))
    : undefined;
  return {
    notificationUUID: payload.notificationUUID,
    notificationType: String(payload.notificationType),
    ...(payload.subtype ? { subtype: String(payload.subtype) } : {}),
    environment,
    ...(transaction ? { transaction } : {}),
    ...(renewal ? { renewal } : {}),
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx convex codegen` then `bun run typecheck:convex`
Expected: no errors. If `"use node"` files may not export non-function values in this Convex version, codegen says so; in that case keep `AppStoreVerificationError` and the two functions here (they are plain exports, not Convex functions) and report the message.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(billing): verify App Store signed data with Apple's server library" -- package.json bun.lock convex.json convex/billing/appleRootCertificates.ts convex/billing/appStoreVerifier.ts convex/_generated
```

---

### Task 7: Sync action, notification action, HTTP route

**Files:**
- Create: `convex/billing/appStoreNode.ts`
- Modify: `convex/http.ts` (after the Stripe webhook routes, ~line 125)
- Test: `convex/billing/appStoreNode.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

`convex/billing/appStoreNode.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { isProUser } from "../_lib/limits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";
import { APP_STORE_PRODUCTS } from "./appStoreProducts";

// vi.mock is hoisted above the imports, so the mocks it uses must be hoisted too.
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
preloadModules(modules, ["./billing/appStoreNode.ts", "./billing/appStore.ts"]);

const DAY = 24 * 60 * 60 * 1000;
type T = ReturnType<typeof convexTest>;

async function seedUser(t: T): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}
function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
function tx(overrides: Record<string, unknown> = {}) {
  return {
    environment: "Sandbox",
    originalTransactionId: "1000000000000001",
    transactionId: "2000000000000001",
    productId: APP_STORE_PRODUCTS.monthly,
    expiresAt: Date.now() + 30 * DAY,
    ...overrides,
  };
}

beforeEach(() => {
  verifyTransaction.mockReset();
  verifyNotification.mockReset();
});

describe("syncTransaction", () => {
  test("verifies and stores the caller's purchase", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    verifyTransaction.mockResolvedValue(tx({ appAccountToken: token }));
    const result = await asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, {
      signedTransaction: "jws",
    });
    expect(result).toEqual({ status: "active" });
    expect(verifyTransaction).toHaveBeenCalledWith("jws");
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("rejects a bad signature", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    verifyTransaction.mockRejectedValue(new AppStoreVerificationError("bad"));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/couldn't be verified/);
  });

  test("rejects products that aren't Pro", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    verifyTransaction.mockResolvedValue(tx({ productId: "com.other.app.thing" }));
    await expect(
      asUser(t, userId).action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow(/Unknown product/);
  });

  test("rejects signed-out callers", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.billing.appStoreNode.syncTransaction, { signedTransaction: "x" })
    ).rejects.toThrow();
  });
});

describe("handleNotification", () => {
  test("invalid signatures are reported, not thrown", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockRejectedValue(new AppStoreVerificationError("bad"));
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "x" })
    ).toEqual({ result: "invalid" });
  });

  test("applies a renewal once and skips the duplicate", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const token = await asUser(t, userId).mutation(api.billing.appStore.getAccountToken, {});
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-1",
      notificationType: "SUBSCRIBED",
      subtype: "INITIAL_BUY",
      environment: "Sandbox",
      transaction: tx({ appAccountToken: token }),
      renewal: { autoRenews: true },
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "processed" });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "duplicate" });
    expect(await t.run((ctx) => isProUser(ctx, userId))).toBe(true);
  });

  test("notifications without a transaction are ignored", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-test",
      notificationType: "TEST",
      environment: "Sandbox",
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "ignored" });
  });

  test("an unknown owner is reported as unlinked", async () => {
    const t = convexTest(schema, modules);
    verifyNotification.mockResolvedValue({
      notificationUUID: "n-2",
      notificationType: "DID_RENEW",
      environment: "Sandbox",
      transaction: tx(),
    });
    expect(
      await t.action(internal.billing.appStoreNode.handleNotification, { signedPayload: "p" })
    ).toEqual({ result: "unlinked" });
  });
});
```

If `vi.mock("./appStoreVerifier")` does not reach modules loaded through `import.meta.glob`, change the mock specifier to the absolute form the glob uses (`vi.mock("/convex/billing/appStoreVerifier.ts", …)`) and report which one worked.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bun run test:convex -- convex/billing/appStoreNode.test.ts`
Expected: FAIL, `api.billing.appStoreNode` undefined.

- [ ] **Step 3: Write `convex/billing/appStoreNode.ts`**

```ts
"use node";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { toConvexError } from "../_lib/serviceErrors";
import { getAuthUserId } from "../auth";
import { appStoreStatusValidator, type VerifiedTransaction } from "./appStoreModel";
import { isAppStoreProductId } from "./appStoreProducts";
import { AppStoreVerificationError, verifyNotification, verifyTransaction } from "./appStoreVerifier";

/**
 * Called by the iOS shell after a purchase or restore, before it finishes the StoreKit
 * transaction. Verifies Apple's signature, then stores the subscription for the caller.
 */
export const syncTransaction = action({
  args: { signedTransaction: v.string() },
  returns: v.object({ status: appStoreStatusValidator }),
  handler: async (ctx, { signedTransaction }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    let transaction: VerifiedTransaction;
    try {
      transaction = await verifyTransaction(signedTransaction);
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        throw toConvexError(
          new InputValidationError("This purchase couldn't be verified.", {
            field: "signedTransaction",
          })
        );
      }
      throw error;
    }
    if (!isAppStoreProductId(transaction.productId)) {
      throw toConvexError(new InputValidationError("Unknown product", { field: "productId" }));
    }
    return await ctx.runMutation(internal.billing.appStore.applyVerifiedTransaction, {
      userId,
      transaction,
    });
  },
});

/**
 * Handle one App Store Server Notification V2. Returns a result for the HTTP route; throws when
 * processing fails so the route answers 500 and Apple retries.
 */
export const handleNotification = internalAction({
  args: { signedPayload: v.string() },
  returns: v.object({
    result: v.union(
      v.literal("invalid"),
      v.literal("duplicate"),
      v.literal("ignored"),
      v.literal("unlinked"),
      v.literal("processed")
    ),
  }),
  handler: async (ctx, { signedPayload }) => {
    let notification: Awaited<ReturnType<typeof verifyNotification>>;
    try {
      notification = await verifyNotification(signedPayload);
    } catch (error) {
      if (error instanceof AppStoreVerificationError) {
        console.warn(JSON.stringify({ event: "appstore_notification_invalid", error: error.message }));
        return { result: "invalid" as const };
      }
      throw error;
    }

    const { notificationUUID, notificationType, subtype, transaction, renewal } = notification;
    const { status } = await ctx.runMutation(internal.billing.appStore.claimNotification, {
      notificationUUID,
      notificationType,
    });
    if (status === "processed") return { result: "duplicate" as const };
    if (status === "in_flight") {
      throw new Error(`App Store notification ${notificationUUID} already in flight, retry later`);
    }

    try {
      if (!transaction || !isAppStoreProductId(transaction.productId)) {
        await ctx.runMutation(internal.billing.appStore.markNotificationProcessed, {
          notificationUUID,
        });
        return { result: "ignored" as const };
      }
      const { applied } = await ctx.runMutation(internal.billing.appStore.applyNotification, {
        notificationType,
        ...(subtype ? { subtype } : {}),
        transaction,
        ...(renewal ? { renewal } : {}),
      });
      await ctx.runMutation(internal.billing.appStore.markNotificationProcessed, {
        notificationUUID,
      });
      if (!applied) {
        console.warn(
          JSON.stringify({
            event: "appstore_notification_unlinked",
            notificationUUID,
            notificationType,
            originalTransactionId: transaction.originalTransactionId,
          })
        );
      }
      return { result: applied ? ("processed" as const) : ("unlinked" as const) };
    } catch (error) {
      await ctx.runMutation(internal.billing.appStore.markNotificationFailed, {
        notificationUUID,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
```

- [ ] **Step 4: Add the HTTP route**

In `convex/http.ts`, after the Stripe webhook routes:

```ts
// ============================================================
// App Store Server Notifications V2 (Forward to Node Action)
// ============================================================

http.route({
  path: "/appstore/notifications",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const respond = (status: number, body: Record<string, unknown>) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

    let signedPayload: unknown;
    try {
      signedPayload = ((await request.json()) as { signedPayload?: unknown }).signedPayload;
    } catch {
      signedPayload = undefined;
    }
    if (typeof signedPayload !== "string") return respond(400, { error: "Missing signedPayload" });

    try {
      const { result } = await ctx.runAction(internal.billing.appStoreNode.handleNotification, {
        signedPayload,
      });
      // A bad signature won't get better on retry; everything else is acknowledged.
      return respond(result === "invalid" ? 400 : 200, { result });
    } catch (error) {
      console.error("[App Store notification] Error:", error);
      return respond(500, { error: "Notification processing failed" });
    }
  }),
});
```

- [ ] **Step 5: Codegen, run tests, typecheck, commit**

Run: `npx convex codegen`, `bun run test:convex -- convex/billing`, `bun run typecheck:convex`
Expected: PASS / no errors.

```bash
git commit -m "feat(billing): App Store purchase sync action and notification endpoint" -- convex/billing/appStoreNode.ts convex/billing/appStoreNode.test.ts convex/http.ts convex/_generated
```

---

### Task 8: Web — purchase channel and plan source

**Files:**
- Modify: `apps/web/src/utils/platformDetection.ts`
- Create: `apps/web/src/utils/platformDetection.test.ts` (if it doesn't exist; otherwise extend it)
- Modify: `apps/web/src/features/billing/types.ts`
- Modify: `apps/web/src/features/billing/services/subscriptionApi.ts`
- Modify tests that mock these: `apps/web/src/features/billing/services/useSubscriptionStatus.test.ts`, `useUserLimits.test.ts`, and the `vi.mock("@/utils/platformDetection", …)` blocks in `BillingPage.test.tsx`, `useShowProBadges.test.tsx`, `useSourceUpload.test.ts`, `useLimitErrorToast.test.ts`

- [ ] **Step 1: Write the failing tests for the channel**

`apps/web/src/utils/platformDetection.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { canOfferPurchases, purchaseChannel, shellSupportsIap } from "./platformDetection";

afterEach(() => {
  delete window.__IS_NATIVE_SHELL__;
  delete window.__SHELL_CAPABILITIES__;
});

describe("purchaseChannel", () => {
  it("is Stripe on the web", () => {
    expect(purchaseChannel()).toBe("stripe");
    expect(canOfferPurchases()).toBe(true);
  });

  it("is none in a shell without in-app purchase (1.0 build, Android)", () => {
    window.__IS_NATIVE_SHELL__ = true;
    expect(shellSupportsIap()).toBe(false);
    expect(purchaseChannel()).toBe("none");
    expect(canOfferPurchases()).toBe(false);
  });

  it("is the App Store in a shell that reports iap", () => {
    window.__IS_NATIVE_SHELL__ = true;
    window.__SHELL_CAPABILITIES__ = { iap: true };
    expect(shellSupportsIap()).toBe(true);
    expect(purchaseChannel()).toBe("app_store");
    expect(canOfferPurchases()).toBe(true);
  });

  it("ignores the capability flag outside the shell", () => {
    window.__SHELL_CAPABILITIES__ = { iap: true };
    expect(purchaseChannel()).toBe("stripe");
  });
});
```

Run: `bun run test:web -- src/utils/platformDetection.test.ts` — expected FAIL (`purchaseChannel` not exported).

- [ ] **Step 2: Implement the channel**

In `apps/web/src/utils/platformDetection.ts`, add to the `Window` interface:

```ts
    /** Set by native builds before content loads; `iap` when the shell can run App Store purchases. */
    __SHELL_CAPABILITIES__?: { iap?: boolean };
```

and replace `canOfferPurchases` with:

```ts
/** True in a native shell build that can run App Store in-app purchases. */
export function shellSupportsIap(): boolean {
  return isNativeShell() && window.__SHELL_CAPABILITIES__?.iap === true;
}

export type PurchaseChannel = "stripe" | "app_store" | "none";

/**
 * How this surface sells Pro. The web uses Stripe. Inside the iOS app, App Store guideline 3.1.1
 * requires in-app purchase, so builds that support it use the App Store and older builds (and the
 * Android shell) sell nothing. Existing subscribers keep Pro everywhere.
 */
export function purchaseChannel(): PurchaseChannel {
  if (!isNativeShell()) return "stripe";
  return shellSupportsIap() ? "app_store" : "none";
}

/** Whether this surface may show prices and "Upgrade to Pro" calls to action. */
export function canOfferPurchases(): boolean {
  return purchaseChannel() !== "none";
}
```

Run the test again — expected PASS.

- [ ] **Step 3: Stripe backstop uses the channel**

In `subscriptionApi.ts`:

```ts
import { purchaseChannel } from "@/utils/platformDetection";

/** Backstop: Stripe checkout and portal only on the web, never inside the native app. */
function assertPurchasesAllowed() {
  if (purchaseChannel() !== "stripe") {
    throw new Error("Subscriptions can't be purchased or changed in the app.");
  }
}
```

(Remove the now-unused `canOfferPurchases` import.)

- [ ] **Step 4: Read `getPlan` and expose the source**

In `apps/web/src/features/billing/types.ts`, add to `SubscriptionStatusResponse`:

```ts
  /** Where Pro is billed; null on Free. */
  source?: "stripe" | "app_store" | null;
  /** App Store product, when `source` is "app_store". */
  appStoreProductId?: string;
```

In `subscriptionApi.ts`, change `useSubscriptionStatus` to start like this (the Stripe branch below the early returns stays as it is, with `subscription` now meaning the Stripe document, and gains `source: "stripe"` in its returned object):

```ts
import {
  appStoreProductPeriod,
  isAppStoreProductId,
} from "@convex/billing/appStoreProducts";

export function useSubscriptionStatus(): SubscriptionStatusResponse {
  const plan = useQuery(api.billing.index.getPlan);

  return useMemo((): SubscriptionStatusResponse => {
    if (plan?.source === "app_store" && plan.appStore) {
      const { productId, expiresAt, autoRenews } = plan.appStore;
      return {
        hasSubscription: true,
        isLoading: false,
        source: "app_store",
        status: "active",
        plan: "premium",
        notebookLimit: 200,
        sourceLimit: 200,
        currentPeriodEnd: new Date(expiresAt).toISOString(),
        cancelAtPeriodEnd: !autoRenews,
        interval: isAppStoreProductId(productId) ? appStoreProductPeriod(productId) : "month",
        appStoreProductId: productId,
      };
    }

    const subscription = plan?.stripe ?? null;
    if (!subscription) {
      return {
        hasSubscription: false,
        isLoading: plan === undefined,
        source: null,
        plan: "free",
        notebookLimit: 5,
        sourceLimit: 20,
        currentPeriodEnd: undefined,
        cancelAtPeriodEnd: false,
      };
    }
    // …existing Stripe mapping unchanged, plus `source: "stripe"` in the returned object…
  }, [plan]);
}
```

and `useUserLimits`:

```ts
export function useUserLimits() {
  const plan = useQuery(api.billing.index.getPlan);
  // `undefined` until the query resolves; callers gate on `isLoading` so a Pro user never sees
  // the free cap flash.
  const isLoading = plan === undefined;

  if (plan?.tier === "pro") {
    return { notebookLimit: 200, sourceLimit: 200, isPremium: true, isLoading: false };
  }
  return { notebookLimit: 5, sourceLimit: 20, isPremium: false, isLoading };
}
```

Replace the old `subscription.status === "active"` checks inside the Stripe branch only if they read differently now; `plan.stripe` is only ever an active subscription.

- [ ] **Step 5: Update the existing tests**

- `useSubscriptionStatus.test.ts` and `useUserLimits.test.ts`: their `useQuery` mock returns a `getCurrent`-shaped document. Wrap it: `{ tier: "pro", source: "stripe", stripe: <the old doc>, appStore: null }` for subscribers, `{ tier: "free", source: null, stripe: null, appStore: null }` for free users, `undefined` for loading. Add one test per hook for an App Store plan:

```ts
it("maps an App Store plan", () => {
  mockPlan = {
    tier: "pro",
    source: "app_store",
    stripe: null,
    appStore: {
      productId: "com.solomindlm.app.pro.yearly",
      status: "active",
      expiresAt: Date.UTC(2027, 0, 1),
      autoRenews: false,
      environment: "Sandbox",
    },
  };
  const { result } = renderHook(() => useSubscriptionStatus());
  expect(result.current).toMatchObject({
    hasSubscription: true,
    source: "app_store",
    interval: "year",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2027-01-01T00:00:00.000Z",
  });
});
```

(Use whatever variable/mocking style the file already uses; the expectations are what matter.)

- Every `vi.mock("@/utils/platformDetection", () => ({ canOfferPurchases: … }))` block: add `purchaseChannel: () => (mockIsNativeShell ? "none" : "stripe")` (or the file's equivalent flag) and `shellSupportsIap: () => false`, so modules that now import them still load.

- [ ] **Step 6: Run the web tests and typecheck**

Run: `bun run test:web` and `bun run typecheck:web`
Expected: all pass, no type errors.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(billing): web reads plan across Stripe and App Store; App Store purchase channel" -- apps/web/src/utils/platformDetection.ts apps/web/src/utils/platformDetection.test.ts apps/web/src/features/billing apps/web/src/features/sources/hooks/useSourceUpload.test.ts apps/web/src/shared/hooks/useLimitErrorToast.test.ts
```

---

### Task 9: Web — IAP bridge client and products hook

**Files:**
- Create: `apps/web/src/features/billing/appStore/iapBridge.ts`
- Create: `apps/web/src/features/billing/appStore/useIapProducts.ts`
- Create: `apps/web/src/features/billing/appStore/appStorePricing.ts`
- Test: `apps/web/src/features/billing/appStore/iapBridge.test.ts`, `appStorePricing.test.ts`

- [ ] **Step 1: Write the failing bridge tests**

`iapBridge.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IAP_RESPONSE_EVENT,
  loadIapProducts,
  purchaseIapProduct,
  restoreIapPurchases,
} from "./iapBridge";

const posted: Array<Record<string, unknown>> = [];

function respond(detail: unknown) {
  window.dispatchEvent(new CustomEvent(IAP_RESPONSE_EVENT, { detail }));
}

beforeEach(() => {
  posted.length = 0;
  window.__IS_NATIVE_SHELL__ = true;
  window.__SHELL_CAPABILITIES__ = { iap: true };
  window.ReactNativeWebView = { postMessage: (m: string) => posted.push(JSON.parse(m)) };
});

afterEach(() => {
  delete window.__IS_NATIVE_SHELL__;
  delete window.__SHELL_CAPABILITIES__;
  delete window.ReactNativeWebView;
  vi.useRealTimers();
});

describe("iapBridge", () => {
  it("sends a products request and resolves with valid products only", async () => {
    const promise = loadIapProducts();
    expect(posted[0]).toMatchObject({ type: "shell-web:iap", action: "products" });
    respond({
      requestId: posted[0].requestId,
      ok: true,
      result: {
        products: [
          { id: "com.solomindlm.app.pro.monthly", displayPrice: "$1.99", price: 1.99, period: "month" },
          { id: 42 },
        ],
      },
    });
    await expect(promise).resolves.toEqual([
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$1.99", price: 1.99, period: "month" },
    ]);
  });

  it("ignores responses for other requests", async () => {
    const promise = restoreIapPurchases();
    respond({ requestId: "someone-else", ok: true, result: { restored: 9 } });
    respond({ requestId: posted[0].requestId, ok: true, result: { restored: 1 } });
    await expect(promise).resolves.toBe(1);
  });

  it("rejects with the native error", async () => {
    const promise = purchaseIapProduct("com.solomindlm.app.pro.yearly");
    expect(posted[0]).toMatchObject({ action: "purchase", productId: "com.solomindlm.app.pro.yearly" });
    respond({ requestId: posted[0].requestId, ok: false, error: "Store unavailable" });
    await expect(promise).rejects.toThrow("Store unavailable");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const promise = loadIapProducts();
    vi.advanceTimersByTime(15_001);
    await expect(promise).rejects.toThrow(/didn't respond/);
  });

  it("refuses when the shell has no in-app purchase", async () => {
    window.__SHELL_CAPABILITIES__ = {};
    await expect(loadIapProducts()).rejects.toThrow(/isn't available/);
    expect(posted).toHaveLength(0);
  });
});
```

`appStorePricing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { yearlySavingsPercent } from "./appStorePricing";

describe("yearlySavingsPercent", () => {
  it("compares a year of monthly payments with the yearly price", () => {
    expect(yearlySavingsPercent(10, 60)).toBe(50);
  });
  it("is null without both prices", () => {
    expect(yearlySavingsPercent(null, 60)).toBeNull();
    expect(yearlySavingsPercent(10, null)).toBeNull();
  });
  it("is null when yearly saves nothing", () => {
    expect(yearlySavingsPercent(10, 120)).toBeNull();
    expect(yearlySavingsPercent(0, 60)).toBeNull();
  });
});
```

Run: `bun run test:web -- src/features/billing/appStore` — expected FAIL (modules missing).

- [ ] **Step 2: Write the bridge**

`iapBridge.ts`:

```ts
import { getNativeWebViewBridge, shellSupportsIap } from "@/utils/platformDetection";

/** Native dispatches this event (detail = response) to answer a `shell-web:iap` request. */
export const IAP_RESPONSE_EVENT = "solomindlm-shell-iap-response";

export interface IapProduct {
  id: string;
  /** Apple's localized price, e.g. "$1.99" or "1,99 €". */
  displayPrice: string;
  /** Numeric price in the store currency, when StoreKit reports it. */
  price: number | null;
  period: "month" | "year";
}

export type IapPurchaseOutcome =
  | { status: "purchased" | "cancelled" | "pending" }
  | { status: "error"; message: string };

type IapAction = "products" | "purchase" | "restore" | "manage";

type IapResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 15_000;
/** Apple's sheet can stay up while the user signs in or confirms; Pro still shows via getPlan. */
const PURCHASE_TIMEOUT_MS = 5 * 60_000;
const RESTORE_TIMEOUT_MS = 60_000;

function isIapResponse(value: unknown): value is IapResponse {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.requestId === "string" &&
    (r.ok === true || (r.ok === false && typeof r.error === "string"))
  );
}

function isIapProduct(value: unknown): value is IapProduct {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.displayPrice === "string" &&
    (p.price === null || typeof p.price === "number") &&
    (p.period === "month" || p.period === "year")
  );
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `iap_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function request(
  action: IapAction,
  extra: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const bridge = getNativeWebViewBridge();
  if (!shellSupportsIap() || !bridge) {
    return Promise.reject(new Error("In-app purchase isn't available in this version of the app."));
  }
  const requestId = createRequestId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The App Store didn't respond. Try again."));
    }, timeoutMs);
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isIapResponse(detail) || detail.requestId !== requestId) return;
      cleanup();
      if (detail.ok) resolve(detail.result);
      else reject(new Error(detail.error));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(IAP_RESPONSE_EVENT, onResponse);
    };
    window.addEventListener(IAP_RESPONSE_EVENT, onResponse);
    bridge.postMessage(JSON.stringify({ type: "shell-web:iap", requestId, action, ...extra }));
  });
}

export async function loadIapProducts(): Promise<IapProduct[]> {
  const result = (await request("products", {}, DEFAULT_TIMEOUT_MS)) as { products?: unknown };
  return Array.isArray(result?.products) ? result.products.filter(isIapProduct) : [];
}

export async function purchaseIapProduct(productId: string): Promise<IapPurchaseOutcome> {
  const result = (await request("purchase", { productId }, PURCHASE_TIMEOUT_MS)) as {
    status?: unknown;
    message?: unknown;
  };
  if (result?.status === "purchased" || result?.status === "cancelled" || result?.status === "pending") {
    return { status: result.status };
  }
  return {
    status: "error",
    message: typeof result?.message === "string" ? result.message : "The purchase didn't go through.",
  };
}

export async function restoreIapPurchases(): Promise<number> {
  const result = (await request("restore", {}, RESTORE_TIMEOUT_MS)) as { restored?: unknown };
  return typeof result?.restored === "number" ? result.restored : 0;
}

export async function openIapSubscriptionManagement(): Promise<void> {
  await request("manage", {}, DEFAULT_TIMEOUT_MS);
}
```

`appStorePricing.ts`:

```ts
/** Percent saved by paying yearly instead of twelve monthly payments; null when unknown or none. */
export function yearlySavingsPercent(
  monthlyPrice: number | null,
  yearlyPrice: number | null
): number | null {
  if (monthlyPrice === null || yearlyPrice === null || monthlyPrice <= 0) return null;
  const percent = Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  return percent > 0 ? percent : null;
}
```

`useIapProducts.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { type IapProduct, loadIapProducts } from "./iapBridge";

type ProductsState =
  | { status: "loading" }
  | { status: "ready"; products: IapProduct[] }
  | { status: "error"; message: string };

/** Loads the App Store plans from the native shell; `retry` reloads after an error. */
export function useIapProducts(): { state: ProductsState; retry: () => void } {
  const [state, setState] = useState<ProductsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadIapProducts().then(
      (products) => {
        if (cancelled) return;
        setState(
          products.length > 0
            ? { status: "ready", products }
            : { status: "error", message: "Plans aren't available right now." }
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Plans aren't available right now.",
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
```

- [ ] **Step 3: Run tests and commit**

Run: `bun run test:web -- src/features/billing/appStore` — expected PASS.

```bash
git commit -m "feat(billing): web bridge to the iOS shell's in-app purchase" -- apps/web/src/features/billing/appStore
```

---

### Task 10: Web — App Store plans on the Billing page, delete-account warning

**Files:**
- Create: `apps/web/src/features/billing/components/AppStorePlans.tsx`
- Modify: `apps/web/src/features/billing/components/BillingPage.tsx`
- Modify: `apps/web/src/features/auth/components/DeleteAccountDialog.tsx`
- Test: `apps/web/src/features/billing/components/AppStorePlans.test.tsx` (new), `BillingPage.test.tsx`

Read `docs/design/principles.md` before writing the component. Use shadcn primitives (`Button`, `Card`), semantic tokens, no `dark:` classes.

- [ ] **Step 1: Write the failing component tests**

`AppStorePlans.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IapProduct } from "../appStore/iapBridge";

let productsState: { status: string; products?: IapProduct[]; message?: string } = {
  status: "loading",
};
const retry = vi.fn();
const purchase = vi.fn();
const restore = vi.fn();
const manage = vi.fn();
const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };

vi.mock("../appStore/useIapProducts", () => ({
  useIapProducts: () => ({ state: productsState, retry }),
}));
vi.mock("../appStore/iapBridge", () => ({
  purchaseIapProduct: (id: string) => purchase(id),
  restoreIapPurchases: () => restore(),
  openIapSubscriptionManagement: () => manage(),
}));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => toast }));

const { AppStorePlans } = await import("./AppStorePlans");

const PRODUCTS: IapProduct[] = [
  { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2, period: "month" },
  { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: 12, period: "year" },
];

function renderPlans(status: Record<string, unknown> = { hasSubscription: false, source: null }) {
  return render(
    <MemoryRouter>
      <AppStorePlans status={status} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  productsState = { status: "ready", products: PRODUCTS };
  for (const fn of [retry, purchase, restore, manage, toast.success, toast.info, toast.error]) {
    fn.mockReset();
  }
});

describe("AppStorePlans", () => {
  it("shows Apple's prices, savings, restore and the renewal terms", () => {
    renderPlans();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.getByText("$12.00")).toBeInTheDocument();
    expect(screen.getByText("Save 50%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore purchases" })).toBeInTheDocument();
    expect(screen.getByText(/Auto-renews until canceled/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("buys a plan and reports pending approval", async () => {
    purchase.mockResolvedValue({ status: "pending" });
    renderPlans();
    fireEvent.click(screen.getAllByRole("button", { name: "Subscribe" })[0]);
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Waiting for approval"));
    expect(purchase).toHaveBeenCalledWith("com.solomindlm.app.pro.yearly");
  });

  it("says so when restore finds nothing", async () => {
    restore.mockResolvedValue(0);
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: "Restore purchases" }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith("No purchases found for this Apple ID")
    );
  });

  it("offers retry when products fail to load", () => {
    productsState = { status: "error", message: "Plans aren't available right now." };
    renderPlans();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
  });

  it("tells Stripe subscribers their plan is billed on the website, with no buttons", () => {
    renderPlans({ hasSubscription: true, source: "stripe" });
    expect(screen.getByText("Your Pro plan is billed through the website.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("marks the current App Store plan and offers Manage subscription", () => {
    renderPlans({
      hasSubscription: true,
      source: "app_store",
      appStoreProductId: "com.solomindlm.app.pro.monthly",
    });
    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Switch to yearly" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(manage).toHaveBeenCalled();
  });
});
```

Run: `bun run test:web -- src/features/billing/components/AppStorePlans.test.tsx` — expected FAIL.

- [ ] **Step 2: Write `AppStorePlans.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useToast } from "@/shared/contexts/useToast";
import {
  type IapProduct,
  openIapSubscriptionManagement,
  purchaseIapProduct,
  restoreIapPurchases,
} from "../appStore/iapBridge";
import { yearlySavingsPercent } from "../appStore/appStorePricing";
import { useIapProducts } from "../appStore/useIapProducts";
import { PRO_PLAN_FEATURES } from "../planFeatures";
import type { SubscriptionStatusResponse } from "../types";
import { PlanCard } from "./PlanCard";

interface AppStorePlansProps {
  status: Pick<SubscriptionStatusResponse, "hasSubscription" | "source" | "appStoreProductId">;
}

/** Pro plans sold through Apple in-app purchase, inside an iOS build that supports it. */
export function AppStorePlans({ status }: AppStorePlansProps) {
  const { state, retry } = useIapProducts();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (status.source === "stripe") {
    return (
      <Card className="mx-auto mb-12 max-w-md">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your Pro plan is billed through the website.
          </p>
        </CardContent>
      </Card>
    );
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const buy = (product: IapProduct) =>
    run(async () => {
      const outcome = await purchaseIapProduct(product.id);
      if (outcome.status === "purchased") toast.success("You're on Pro");
      else if (outcome.status === "pending") toast.info("Waiting for approval");
      else if (outcome.status === "error") toast.error(outcome.message);
    });

  const restore = () =>
    run(async () => {
      const restored = await restoreIapPurchases();
      if (restored > 0) toast.success("Purchases restored");
      else toast.info("No purchases found for this Apple ID");
    });

  if (state.status === "loading") {
    return <p className="mb-12 text-center text-sm text-muted-foreground">Loading plans…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const yearly = state.products.find((p) => p.period === "year");
  const monthly = state.products.find((p) => p.period === "month");
  const savings = yearlySavingsPercent(monthly?.price ?? null, yearly?.price ?? null);
  const onAppStore = status.source === "app_store";

  const action = (product: IapProduct) => {
    if (onAppStore && status.appStoreProductId === product.id) {
      return (
        <Button variant="secondary" size="lg" disabled className="w-full">
          Current plan
        </Button>
      );
    }
    return (
      <Button size="lg" className="w-full" disabled={busy} onClick={() => void buy(product)}>
        {onAppStore ? `Switch to ${product.period === "year" ? "yearly" : "monthly"}` : "Subscribe"}
      </Button>
    );
  };

  return (
    <div className="mb-12 flex flex-col gap-8">
      <div className="mx-auto grid w-full max-w-3xl gap-8 md:grid-cols-2">
        {yearly && (
          <PlanCard
            title="Yearly"
            subtitle="Billed once a year"
            price={yearly.displayPrice}
            priceNote="/year"
            badge={savings ? `Save ${savings}%` : undefined}
            highlighted
            featuresLabel="Everything included:"
            features={PRO_PLAN_FEATURES}
            action={action(yearly)}
          />
        )}
        {monthly && (
          <PlanCard
            title="Monthly"
            subtitle="Billed every month"
            price={monthly.displayPrice}
            priceNote="/month"
            proChecks
            featuresLabel="Everything included:"
            features={PRO_PLAN_FEATURES}
            action={action(monthly)}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="ghost" disabled={busy} onClick={() => void restore()}>
          Restore purchases
        </Button>
        {onAppStore && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(openIapSubscriptionManagement)}
          >
            Manage subscription
          </Button>
        )}
      </div>
      <p className="mx-auto max-w-xl text-center text-xs text-muted-foreground">
        Auto-renews until canceled. Cancel any time in Settings at least 24 hours before renewal.{" "}
        <Link to="/terms" className="underline">
          Terms of Use
        </Link>{" "}
        ·{" "}
        <Link to="/privacy" className="underline">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
```

Check `PlanCard`'s `price` / `priceNote` rendering: its doc says the price is followed by a muted "/month". If `PlanCard` already appends "/month", drop `priceNote` for the monthly card and use `priceNote="per year"` wording that reads correctly next to it; adjust the test's expectations only for that wording, not for the prices. The first `Subscribe` button is the yearly card (it renders first), which the purchase test relies on.

Run the component tests — expected PASS.

- [ ] **Step 3: Branch the Billing page**

In `BillingPage.tsx`:

1. Import `purchaseChannel` (replacing `canOfferPurchases`) and `AppStorePlans`:

```tsx
import { purchaseChannel } from "@/utils/platformDetection";
import { AppStorePlans } from "./AppStorePlans";
```

2. Replace `const purchasable = canOfferPurchases();` with:

```tsx
  const channel = purchaseChannel();
  const purchasable = channel !== "none";
  const billedByApple = status?.source === "app_store";
```

3. In the current-plan card:
   - Show the Stripe "Current Price" block only when `channel === "stripe" && !billedByApple` (replacing `purchasable &&`).
   - Below the renew/access date, when `billedByApple`, render `<p className="text-sm text-muted-foreground mt-2">Billed by Apple. Manage it in your iPhone's Settings.</p>`.
   - Render the "Cancel Subscription" button only when `!status.cancelAtPeriodEnd && !billedByApple` (cancelling an Apple subscription happens in Settings).

4. Render `{channel === "app_store" && <AppStorePlans status={status} />}` right after the current-plan card.

5. Gate the Stripe pricing grid on `channel === "stripe" && !billedByApple` (replacing `purchasable &&`), and the free-plan summary card on `channel === "none" && !status?.hasSubscription` (replacing `!purchasable && …`). The hero title/subtitle keep using `purchasable`.

- [ ] **Step 4: Extend the Billing page tests**

In `BillingPage.test.tsx`, replace the platform mock with a channel variable and stub `AppStorePlans`:

```tsx
let mockChannel: "stripe" | "app_store" | "none" = "stripe";

vi.mock("@/utils/platformDetection", () => ({
  purchaseChannel: () => mockChannel,
  canOfferPurchases: () => mockChannel !== "none",
}));

vi.mock("./AppStorePlans", () => ({
  AppStorePlans: () => <div data-testid="app-store-plans" />,
}));
```

Map the existing `mockIsNativeShell = true` cases to `mockChannel = "none"` (and the `beforeEach` reset to `"stripe"`), then add:

```tsx
  it("shows App Store plans in a build with in-app purchase", () => {
    mockChannel = "app_store";
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByTestId("app-store-plans")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get Started" })).not.toBeInTheDocument();
  });

  it("on the web, an App Store subscriber sees Apple billing and no Stripe actions", () => {
    mockStatus = { ...subscriber, source: "app_store" };
    render(<BillingPage onBack={() => {}} />);
    expect(screen.getByText("Billed by Apple. Manage it in your iPhone's Settings.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Subscription" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Delete-account warning**

In `DeleteAccountDialog.tsx`, read `source` too and change the sentence:

```tsx
  const { hasSubscription, source } = useSubscriptionStatus();
  …
            {source === "app_store"
              ? " Apple keeps billing your App Store subscription until you cancel it in your iPhone's Settings."
              : hasSubscription
                ? " Your subscription will be cancelled immediately."
                : null}
```

If `DeleteAccountDialog` has a test that mocks `useSubscriptionStatus`, add a case asserting the Apple sentence for `source: "app_store"`.

- [ ] **Step 6: Run gates and commit**

Run: `bun run test:web`, `bun run typecheck:web`, `bun run lint:design`
Expected: pass; no new design-lint violations.

```bash
git commit -m "feat(billing): App Store plans on the in-app Billing page" -- apps/web/src/features/billing apps/web/src/features/auth/components/DeleteAccountDialog.tsx apps/web/src/features/auth/components/DeleteAccountDialog.test.tsx
```

(Drop the dialog test path from the commit if that file doesn't exist.)

---

### Task 11: Mobile — dependency, capability flag, bridge parsing and responses

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/jest.config.js`
- Modify: `apps/mobile/src/utils/constants.ts`
- Modify: `apps/mobile/src/components/web/parseShellWebMessage.ts` (+ its test)
- Create: `apps/mobile/src/components/web/buildShellIapResponseScript.ts` (+ test)
- Create: `apps/mobile/src/services/iap/iapMappers.ts` (+ test)

- [ ] **Step 1: Install `expo-iap`**

Run from `apps/mobile`: `bun x expo install expo-iap`. Add `"expo-iap"` to the `plugins` array in `apps/mobile/app.json` (after `"expo-router"`). Check `node_modules/expo-iap` docs for the minimum iOS deployment target; Expo 55 already targets iOS 15.1+, so no `expo-build-properties` change is expected — report if the package says otherwise.

Add to `apps/mobile/jest.config.js` so tests can import the shared product IDs:

```js
  moduleNameMapper: {
    "^@convex/(.*)$": "<rootDir>/../../convex/$1",
    "^@mobile/(.*)$": "<rootDir>/src/$1",
  },
```

(Keep `@mobile` only if `tsconfig.json` maps `@mobile/*` to `./src/*`; check and match it.)

- [ ] **Step 2: Write the failing tests**

Extend `apps/mobile/src/components/web/parseShellWebMessage.test.ts`:

```ts
describe("iap requests", () => {
  it("parses each action", () => {
    expect(
      parseShellWebMessage(
        JSON.stringify({ type: "shell-web:iap", requestId: "r1", action: "products" })
      )
    ).toEqual({ kind: "iap", requestId: "r1", action: "products" });
    expect(
      parseShellWebMessage(
        JSON.stringify({
          type: "shell-web:iap",
          requestId: "r2",
          action: "purchase",
          productId: "com.solomindlm.app.pro.monthly",
        })
      )
    ).toEqual({
      kind: "iap",
      requestId: "r2",
      action: "purchase",
      productId: "com.solomindlm.app.pro.monthly",
    });
  });

  it("rejects unknown actions, missing ids and purchases without a product", () => {
    for (const msg of [
      { type: "shell-web:iap", requestId: "r", action: "refund" },
      { type: "shell-web:iap", action: "products" },
      { type: "shell-web:iap", requestId: "r", action: "purchase" },
    ]) {
      expect(parseShellWebMessage(JSON.stringify(msg))).toBeNull();
    }
  });
});
```

`apps/mobile/src/components/web/buildShellIapResponseScript.test.ts`:

```ts
import { buildShellIapResponseScript } from "./buildShellIapResponseScript";

describe("buildShellIapResponseScript", () => {
  it("dispatches the response event with the payload", () => {
    const dispatched: unknown[] = [];
    const fakeWindow = {
      dispatchEvent: (event: { type: string; detail: unknown }) => dispatched.push(event),
    };
    class FakeCustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init: { detail: unknown }) {
        this.type = type;
        this.detail = init.detail;
      }
    }
    const script = buildShellIapResponseScript({ requestId: "r1", ok: true, result: { restored: 2 } });
    new Function("window", "CustomEvent", script)(fakeWindow, FakeCustomEvent);
    expect(dispatched).toEqual([
      { type: "solomindlm-shell-iap-response", detail: { requestId: "r1", ok: true, result: { restored: 2 } } },
    ]);
  });

  it("escapes payloads that contain script-breaking text", () => {
    const script = buildShellIapResponseScript({ requestId: "r", ok: false, error: "</script> " });
    expect(script).not.toContain("</script>");
  });
});
```

`apps/mobile/src/services/iap/iapMappers.test.ts`:

```ts
import { purchaseOutcomeFromError, toBridgeProducts } from "./iapMappers";

describe("toBridgeProducts", () => {
  it("keeps our products, adds the period, puts yearly first", () => {
    expect(
      toBridgeProducts([
        { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2 },
        { id: "com.other.thing", displayPrice: "$1", price: 1 },
        { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: undefined },
      ])
    ).toEqual([
      { id: "com.solomindlm.app.pro.yearly", displayPrice: "$12.00", price: null, period: "year" },
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2.00", price: 2, period: "month" },
    ]);
  });
});

describe("purchaseOutcomeFromError", () => {
  it("treats user cancellation as cancelled", () => {
    expect(purchaseOutcomeFromError({ code: "user-cancelled", message: "x" }, "user-cancelled")).toEqual({
      status: "cancelled",
    });
  });
  it("passes other errors through", () => {
    expect(purchaseOutcomeFromError(new Error("Network down"), "user-cancelled")).toEqual({
      status: "error",
      message: "Network down",
    });
  });
});
```

(`purchaseOutcomeFromError` takes the cancel code as a parameter so the test doesn't import `expo-iap`'s native module; the service passes `ErrorCode.UserCancelled`.)

Add a test for the inject builder in `apps/mobile/src/utils/constants.test.ts`:

```ts
import { buildNativeShellInject } from "./constants";

it("declares the shell and its capabilities", () => {
  const win: Record<string, unknown> = {};
  new Function("window", buildNativeShellInject({ iap: true }))(win);
  expect(win).toEqual({ __IS_NATIVE_SHELL__: true, __SHELL_CAPABILITIES__: { iap: true } });
});
```

Run: `bun run test:mobile` — expected FAIL (missing modules / exports).

- [ ] **Step 3: Implement**

`apps/mobile/src/utils/constants.ts` — replace `NATIVE_SHELL_INJECT` with a builder and update its one importer (`WebViewScreen.tsx`):

```ts
/** Runs before the web app loads: marks the shell and what this build can do. */
export function buildNativeShellInject(capabilities: { iap: boolean }): string {
  return `
(function () {
  try {
    window.__IS_NATIVE_SHELL__ = true;
    window.__SHELL_CAPABILITIES__ = ${JSON.stringify(capabilities)};
  } catch (e) {}
})();
true;
`;
}
```

`parseShellWebMessage.ts`:

```ts
export type IapRequest =
  | { kind: "iap"; requestId: string; action: "products" | "restore" | "manage" }
  | { kind: "iap"; requestId: string; action: "purchase"; productId: string };

export type ShellWebMessage =
  | { kind: "theme"; theme: "light" | "dark" }
  | { kind: "aiConsent"; granted: boolean }
  | IapRequest;
```

Widen the parsed `msg` type to include `requestId`, `action`, `productId` (all `unknown`) and add before `return null`:

```ts
  if (msg.type === "shell-web:iap" && typeof msg.requestId === "string" && msg.requestId) {
    if (msg.action === "purchase") {
      return typeof msg.productId === "string" && msg.productId
        ? { kind: "iap", requestId: msg.requestId, action: "purchase", productId: msg.productId }
        : null;
    }
    if (msg.action === "products" || msg.action === "restore" || msg.action === "manage") {
      return { kind: "iap", requestId: msg.requestId, action: msg.action };
    }
  }
```

`buildShellIapResponseScript.ts`:

```ts
export type ShellIapResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

/** Delivers an IAP response to the page (same channel as the auth bridge's responses). */
export function buildShellIapResponseScript(payload: ShellIapResponse): string {
  // Escape "<" and line separators so the JSON can't break out of the injected script.
  const encoded = JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/ /g, "\\u2028")
    .replace(/ /g, "\\u2029");
  return `
(function () {
  try {
    window.dispatchEvent(
      new CustomEvent("solomindlm-shell-iap-response", { detail: ${encoded} })
    );
  } catch (e) {}
})();
true;
`;
}
```

`apps/mobile/src/services/iap/iapMappers.ts`:

```ts
import {
  appStoreProductPeriod,
  isAppStoreProductId,
} from "@convex/billing/appStoreProducts";

export interface BridgeProduct {
  id: string;
  displayPrice: string;
  price: number | null;
  period: "month" | "year";
}

export type PurchaseOutcome =
  | { status: "purchased" | "cancelled" | "pending" }
  | { status: "error"; message: string };

/** StoreKit products → what the web Billing page shows; yearly first. */
export function toBridgeProducts(
  products: ReadonlyArray<{ id: string; displayPrice: string; price?: number | null }>
): BridgeProduct[] {
  return products
    .filter((p) => isAppStoreProductId(p.id))
    .map((p) => ({
      id: p.id,
      displayPrice: p.displayPrice,
      price: typeof p.price === "number" ? p.price : null,
      period: appStoreProductPeriod(p.id as Parameters<typeof appStoreProductPeriod>[0]),
    }))
    .sort((a, b) => (a.period === b.period ? 0 : a.period === "year" ? -1 : 1));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A purchase error → the outcome the page shows; `cancelCode` is expo-iap's UserCancelled code. */
export function purchaseOutcomeFromError(error: unknown, cancelCode: string): PurchaseOutcome {
  if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === cancelCode) {
    return { status: "cancelled" };
  }
  return { status: "error", message: errorMessage(error) };
}
```

(Replace the `as Parameters<…>` cast with a type-guarded `.flatMap` if Biome flags it: `products.flatMap((p) => isAppStoreProductId(p.id) ? [{ …, period: appStoreProductPeriod(p.id) }] : [])`.)

- [ ] **Step 4: Run tests and typecheck**

Run: `bun run test:mobile` and `bun run typecheck:mobile` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): expo-iap, IAP capability flag and bridge messages" -- apps/mobile/package.json apps/mobile/app.json apps/mobile/jest.config.js apps/mobile/src/utils apps/mobile/src/components/web apps/mobile/src/services/iap bun.lock
```

---

### Task 12: Mobile — IAP service and wiring

**Files:**
- Create: `apps/mobile/src/services/iap/iapService.ts`
- Create: `apps/mobile/src/services/iap/handleIapRequest.ts` (+ test)
- Modify: `apps/mobile/src/components/web/WebViewScreen.tsx`
- Modify: `apps/mobile/app/index.tsx`

Before writing, open `node_modules/expo-iap/build/index.d.ts` (and its types file) and confirm: `initConnection`, `fetchProducts({ skus, type: "subs" })`, `requestPurchase({ request: { apple: { sku, appAccountToken } }, type: "subs" })`, `finishTransaction({ purchase, isConsumable })`, `getAvailablePurchases()` (direct function returns `Purchase[]`), `purchaseUpdatedListener`, `purchaseErrorListener`, `deepLinkToSubscriptions`, `ErrorCode.UserCancelled`, `Purchase.purchaseToken` (iOS JWS), and the `PurchaseState` value for a pending (Ask to Buy) purchase. Use the real names if any differ and report them.

- [ ] **Step 1: Write the failing test for the request handler**

`apps/mobile/src/services/iap/handleIapRequest.test.ts`:

```ts
jest.mock("./iapService", () => ({
  loadProducts: jest.fn(),
  purchase: jest.fn(),
  restorePurchases: jest.fn(),
  openSubscriptionManagement: jest.fn(),
}));

import { handleIapRequest } from "./handleIapRequest";
import * as service from "./iapService";

const mocked = service as jest.Mocked<typeof service>;

describe("handleIapRequest", () => {
  it("answers products", async () => {
    mocked.loadProducts.mockResolvedValue([
      { id: "com.solomindlm.app.pro.monthly", displayPrice: "$2", price: 2, period: "month" },
    ]);
    await expect(handleIapRequest({ kind: "iap", requestId: "r", action: "products" })).resolves.toEqual({
      requestId: "r",
      ok: true,
      result: {
        products: [{ id: "com.solomindlm.app.pro.monthly", displayPrice: "$2", price: 2, period: "month" }],
      },
    });
  });

  it("answers a purchase with its outcome", async () => {
    mocked.purchase.mockResolvedValue({ status: "cancelled" });
    await expect(
      handleIapRequest({ kind: "iap", requestId: "r", action: "purchase", productId: "p" })
    ).resolves.toEqual({ requestId: "r", ok: true, result: { status: "cancelled" } });
    expect(mocked.purchase).toHaveBeenCalledWith("p");
  });

  it("turns thrown errors into error responses", async () => {
    mocked.restorePurchases.mockRejectedValue(new Error("linked to another SolomindLM account"));
    await expect(handleIapRequest({ kind: "iap", requestId: "r", action: "restore" })).resolves.toEqual({
      requestId: "r",
      ok: false,
      error: "linked to another SolomindLM account",
    });
  });
});
```

Run: `bun run test:mobile` — expected FAIL.

- [ ] **Step 2: Write the service**

`apps/mobile/src/services/iap/iapService.ts`:

```ts
import { api } from "@convex/_generated/api";
import { APP_STORE_PRODUCT_IDS, isAppStoreProductId } from "@convex/billing/appStoreProducts";
import { convexClient } from "@mobile/services/convex/client";
import {
  deepLinkToSubscriptions,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  type Purchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from "expo-iap";
import {
  type BridgeProduct,
  errorMessage,
  type PurchaseOutcome,
  purchaseOutcomeFromError,
  toBridgeProducts,
} from "./iapMappers";

let connection: Promise<unknown> | null = null;
function ensureConnection(): Promise<unknown> {
  connection ??= initConnection().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** The purchase the web page is waiting on; StoreKit answers through the listeners. */
let pending: { productId: string; resolve: (outcome: PurchaseOutcome) => void } | null = null;

function settle(outcome: PurchaseOutcome) {
  const waiting = pending;
  pending = null;
  waiting?.resolve(outcome);
}

/**
 * Send the signed transaction to Convex, then finish it. Finishing only after Convex accepts it
 * means a crash in between leaves the transaction unfinished, and StoreKit redelivers it.
 */
async function syncAndFinish(purchase: Purchase): Promise<boolean> {
  if (!purchase.purchaseToken || !isAppStoreProductId(purchase.productId)) return false;
  await convexClient.action(api.billing.appStoreNode.syncTransaction, {
    signedTransaction: purchase.purchaseToken,
  });
  await finishTransaction({ purchase, isConsumable: false });
  return true;
}

/** Start once at app launch. Handles new purchases and ones StoreKit redelivers. */
export function startIapListeners(): () => void {
  void ensureConnection().catch(() => {});
  const updated = purchaseUpdatedListener((purchase) => {
    void (async () => {
      const isPendingOne = pending?.productId === purchase.productId;
      // Use the PurchaseState value for Ask to Buy confirmed from expo-iap's types.
      if (purchase.purchaseState === "pending") {
        if (isPendingOne) settle({ status: "pending" });
        return;
      }
      try {
        await syncAndFinish(purchase);
        if (isPendingOne) settle({ status: "purchased" });
      } catch (error) {
        if (isPendingOne) settle({ status: "error", message: errorMessage(error) });
      }
    })();
  });
  const failed = purchaseErrorListener((error) => {
    if (pending) settle(purchaseOutcomeFromError(error, ErrorCode.UserCancelled));
  });
  return () => {
    updated.remove();
    failed.remove();
  };
}

export async function loadProducts(): Promise<BridgeProduct[]> {
  await ensureConnection();
  const products = await fetchProducts({ skus: [...APP_STORE_PRODUCT_IDS], type: "subs" });
  return toBridgeProducts(products ?? []);
}

export async function purchase(productId: string): Promise<PurchaseOutcome> {
  if (!isAppStoreProductId(productId)) return { status: "error", message: "Unknown plan." };
  if (pending) return { status: "error", message: "A purchase is already in progress." };
  await ensureConnection();
  const appAccountToken = await convexClient.mutation(api.billing.appStore.getAccountToken, {});
  return new Promise<PurchaseOutcome>((resolve) => {
    pending = { productId, resolve };
    requestPurchase({
      request: { apple: { sku: productId, appAccountToken } },
      type: "subs",
    }).catch((error: unknown) => {
      if (pending?.resolve === resolve) settle(purchaseOutcomeFromError(error, ErrorCode.UserCancelled));
    });
  });
}

/** Sync every current purchase for this Apple ID; returns how many were Pro subscriptions. */
export async function restorePurchases(): Promise<number> {
  await ensureConnection();
  const purchases = await getAvailablePurchases();
  let restored = 0;
  for (const item of purchases) {
    if (await syncAndFinish(item)) restored += 1;
  }
  return restored;
}

/** Quiet re-sync on launch / sign-in; failures are retried next time. */
export async function syncCurrentPurchases(): Promise<void> {
  try {
    await restorePurchases();
  } catch {
    /* not signed in yet, offline, or linked to another account — nothing to show here */
  }
}

export async function openSubscriptionManagement(): Promise<void> {
  await deepLinkToSubscriptions({});
}
```

If `fetchProducts` returns a union of product types, pass it through `toBridgeProducts` by mapping `{ id, displayPrice, price }` explicitly.

`apps/mobile/src/services/iap/handleIapRequest.ts`:

```ts
import type { IapRequest } from "@mobile/components/web/parseShellWebMessage";
import type { ShellIapResponse } from "@mobile/components/web/buildShellIapResponseScript";
import { errorMessage } from "./iapMappers";
import { loadProducts, openSubscriptionManagement, purchase, restorePurchases } from "./iapService";

/** Run one web request and build the response the page is waiting for. Never throws. */
export async function handleIapRequest(request: IapRequest): Promise<ShellIapResponse> {
  const { requestId } = request;
  try {
    switch (request.action) {
      case "products":
        return { requestId, ok: true, result: { products: await loadProducts() } };
      case "purchase":
        return { requestId, ok: true, result: await purchase(request.productId) };
      case "restore":
        return { requestId, ok: true, result: { restored: await restorePurchases() } };
      case "manage":
        await openSubscriptionManagement();
        return { requestId, ok: true, result: null };
    }
  } catch (error) {
    return { requestId, ok: false, error: errorMessage(error) };
  }
}
```

Run: `bun run test:mobile` — expected PASS.

- [ ] **Step 3: Wire the WebView**

In `WebViewScreen.tsx`:

- Replace the `NATIVE_SHELL_INJECT` import/usage with `buildNativeShellInject`:

```tsx
  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () => buildNativeShellInject({ iap: Platform.OS === "ios" }),
    []
  );
```

(The old `isConvexDeploymentConfigured` branch returned the same value on both sides; drop it and its now-unused import if nothing else uses it.)

- In `onWebViewMessage`, before falling through to the auth bridge:

```tsx
      if (msg?.kind === "iap") {
        if (Platform.OS !== "ios") return;
        void handleIapRequest(msg).then((response) => {
          webViewRef.current?.injectJavaScript(buildShellIapResponseScript(response));
        });
        return;
      }
```

(`webViewRef` is declared below `onWebViewMessage` today; move the `useRef` above it.)

- [ ] **Step 4: Start listeners and re-sync in `app/index.tsx`**

```tsx
import { startIapListeners, syncCurrentPurchases } from "@mobile/services/iap/iapService";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { Platform } from "react-native";
…
  const { isAuthenticated } = useConvexAuth();

  // StoreKit redelivers unfinished transactions through these listeners at any time.
  useEffect(() => (Platform.OS === "ios" ? startIapListeners() : undefined), []);

  // Catch anything missed (renewal while offline, a crash before finishTransaction).
  useEffect(() => {
    if (Platform.OS === "ios" && isAuthenticated) void syncCurrentPurchases();
  }, [isAuthenticated]);
```

Merge with the existing `react` / `react-native` imports.

- [ ] **Step 5: Gates and commit**

Run: `bun run test:mobile`, `bun run typecheck:mobile`, `bun run lint`
Expected: pass; lint warnings no more than on `main`.

```bash
git commit -m "feat(mobile): run App Store purchases for the web Billing page" -- apps/mobile/src/services/iap apps/mobile/src/components/web/WebViewScreen.tsx apps/mobile/app/index.tsx
```

Real purchases can't run in tests or the simulator without StoreKit configuration; they are checked on TestFlight (Task 14).

---

### Task 13: ADR, spec update, privacy policy line

**Files:**
- Create: `docs/adr/0003-direct-storekit-in-app-purchase.md` (follow `docs/adr/template.md`)
- Modify: `docs/superpowers/specs/2026-11-06-ios-in-app-purchase-design.md`
- Modify: `apps/web/src/features/legal/PrivacyPolicy.tsx`, `apps/web/src/features/legal/legalMeta.ts`

- [ ] **Step 1: ADR**

Write the ADR from the template: context (3.1.1 rejection, iOS only, Stripe on the web), decision (StoreKit 2 via `expo-iap` + Apple's server library in Convex + Server Notifications V2; no RevenueCat), consequences (no revenue share or extra processor; we own the edge cases; Google Play later likely means revisiting RevenueCat or adding Play Billing verification), alternatives (RevenueCat; client-trusted receipts — rejected as forgeable). No pricing or competitor reasoning (public repo).

- [ ] **Step 2: Spec**

Change the spec's status to "Approved; implemented in #<PR>" and apply the five deviations listed at the top of this plan (constants instead of env vars; one `shell-web:iap` message type; 5-minute purchase timeout; `gracePeriodExpiresAt`; mocked verifier wrapper instead of signed fixtures). Update the "Environment" section to say there are no new env vars.

- [ ] **Step 3: Privacy policy**

Add one sentence to the payments section of `PrivacyPolicy.tsx`: in the iOS app, subscriptions are processed by Apple; we receive the subscription's transaction details (product, dates, status) but never payment details. Update `/privacy` in `legalMeta.ts` to the merge date.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(billing): ADR for direct StoreKit IAP; spec and privacy policy updates" -- docs/adr/0003-direct-storekit-in-app-purchase.md docs/superpowers/specs/2026-11-06-ios-in-app-purchase-design.md apps/web/src/features/legal/PrivacyPolicy.tsx apps/web/src/features/legal/legalMeta.ts
```

---

### Task 14: Final verification and release checklist

- [ ] **Step 1: All gates, one at a time**

```bash
bun run typecheck:web
bun run typecheck:convex
bun run typecheck:mobile
bun run lint
bun run lint:design
bun run test:convex
bun run test:web
bun run test:mobile
bun x knip
```

Expected: every command passes; lint warnings no more than on `main`; Knip clean.

- [ ] **Step 2: Manual web check (local, against dev)**

With `bun run dev:web` (via the preview tool, not Bash): on the web Billing page, a free user still sees Stripe plans; seed an App Store row for the dev account with the Convex dashboard and confirm the web page shows "Billed by Apple…" with no Stripe actions; delete the row afterwards. Emulate the shell in the browser console (`window.__IS_NATIVE_SHELL__ = true; window.__SHELL_CAPABILITIES__ = { iap: true }` before load is not possible in the console, so set them and navigate client-side to `/billing`) and confirm the page shows "Loading plans…" then the error with "Try again" (no native side answers).

- [ ] **Step 3: Release checklist (owner actions, not code)**

Record in the PR description:

1. App Store Connect: subscription group "SolomindLM Pro" with `com.solomindlm.app.pro.monthly` and `com.solomindlm.app.pro.yearly`, prices, localizations, review screenshot; Small Business Program; Billing Grace Period on; App Store Server Notifications V2 URL for Production and Sandbox: `https://<prod deployment>.convex.site/appstore/notifications`; send a test notification and confirm `{"result":"ignored"}` in Convex logs.
2. A Sandbox tester account.
3. New EAS build (`eas build -p ios --profile production`), TestFlight: buy monthly, cancel the sheet, restore on a second device, switch to yearly, let Sandbox renew, refund through Sandbox, check Convex rows after each.
4. Resubmit: attach both subscriptions to the version, App Privacy (purchase history, linked to the user, app functionality), review notes explaining where to buy and restore, reply to App Review for 3.1.1.
