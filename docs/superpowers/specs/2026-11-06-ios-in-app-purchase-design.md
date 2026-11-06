# iOS in-app purchase for Pro

**Status:** Approved design, not yet implemented.
**Why:** App Review rejected iOS 1.0 under guideline 3.1.1: the app unlocks Pro bought on the web
(Stripe) but offers no in-app purchase. The fix is to sell Pro through Apple in-app purchase (IAP)
inside the iOS app, synced to the same Pro entitlement Stripe grants.

## Decisions

- **iOS only.** Google Play billing is out of scope; the design keeps a store-neutral entitlement so
  Play can be added later.
- **Direct StoreKit 2, no third-party billing service.** The native shell uses `expo-iap`; Convex
  verifies Apple's signed data with `@apple/app-store-server-library` and receives App Store Server
  Notifications V2. No new data processor.
- **The iOS price is set in App Store Connect only.** The app shows Apple's localized price strings
  and never hard-codes an iOS price. `PRO_PRICE_USD` stays the web price.
- **The purchase UI is the existing web Billing page**, adapted for the shell. Native code only does
  what must be native: load products, run the purchase, restore, open subscription management.

## Products (App Store Connect)

One auto-renewable subscription group, "SolomindLM Pro":

| Product ID | Period |
| --- | --- |
| `com.solomindlm.app.pro.monthly` | 1 month |
| `com.solomindlm.app.pro.yearly` | 1 year |

Billing Grace Period is on. No free trial or offers at launch (they can be added in App Store
Connect later without code).

## Architecture

| Unit | Responsibility |
| --- | --- |
| Web Billing page (in shell) | Show plans and prices, send buy / restore / manage requests to native |
| Web IAP bridge client | Request/response messages to native with ids and timeouts |
| Native IAP service (`expo-iap`) | Products, purchase with account token, sync to Convex, `finishTransaction`, restore, launch re-sync |
| `convex/billing/appStore*` | Verify signed transactions, handle notifications, store state |
| `isProUser` (`convex/_lib/limits.ts`) | Pro if an active Stripe **or** App Store subscription exists |
| `billing.getPlan` | The one query the UI reads for tier and billing source |

## Data model

```ts
appStoreAccountTokens: defineTable({
  userId: v.id("users"),
  token: v.string(), // random UUID, created once per user, sent as appAccountToken
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_token", ["token"]),

appStoreSubscriptions: defineTable({
  userId: v.id("users"),
  originalTransactionId: v.string(),
  latestTransactionId: v.string(),
  productId: v.string(),
  environment: v.union(v.literal("Production"), v.literal("Sandbox")),
  status: v.union(
    v.literal("active"),
    v.literal("grace"),
    v.literal("billing_retry"),
    v.literal("expired"),
    v.literal("revoked")
  ),
  expiresAt: v.number(),
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

New tables only, so no migration is needed.

### Entitlement

A user is Pro if `isProUser` finds either:

- a `stripeSubscriptions` row with status `active` (unchanged), or
- an `appStoreSubscriptions` row with status `active` or `grace` and `expiresAt` later than
  now minus one day. The day of leeway covers a renewal notification that arrives late; the
  `expiresAt` check covers an `EXPIRED` notification that never arrives.

`billing.getPlan` returns `{ tier: "free" | "pro", source: "stripe" | "app_store" | null,
renewsAt, cancelAtPeriodEnd, productId? }`. The Billing page, the Header and the feedback
`planTier` read it instead of reading `stripeSubscriptions` directly.

### Sandbox

App Review and TestFlight buy in the Sandbox environment against the production app, so production
Convex accepts Sandbox transactions: verify as Production first, and on `INVALID_ENVIRONMENT` verify
as Sandbox. Each row records its environment. TestFlight testers can get Pro without paying; that is
accepted.

## Bridge protocol

Uses the request/response pattern `nativeShellAuth.ts` already uses: the page posts a JSON request
with an `id` through `window.ReactNativeWebView.postMessage`; native answers by injecting a script
that dispatches a `CustomEvent` carrying the same `id`. The web client times out after 60 s for
purchase (the Apple sheet stays open while the user decides) and 15 s otherwise.

**Capability flag.** New native builds inject `window.__SHELL_CAPABILITIES__ = { iap: true }` before
content loads. The web shows IAP UI only when it is present. The current 1.0 build and the Android
shell keep today's behaviour (plan summary, no purchase UI).

| Request | Native action | Response |
| --- | --- | --- |
| `shell-web:iap-products` | `fetchProducts` for both IDs | `{ products: [{ id, displayPrice, period }] }` or `{ error }` |
| `shell-web:iap-purchase { productId }` | Get account token from Convex, `requestPurchase` with `appAccountToken`, send the signed transaction to `syncTransaction`, then `finishTransaction` | `{ status: "purchased" \| "cancelled" \| "pending" \| "error", message? }` |
| `shell-web:iap-restore` | `getAvailablePurchases`, sync each | `{ restored: number }` or `{ error }` |
| `shell-web:iap-manage` | `deepLinkToSubscriptions` | none |

Rules:

- `finishTransaction` runs only after `syncTransaction` succeeds. If the app dies in between, StoreKit
  redelivers the transaction on the next launch and it is synced then.
- On every launch (once signed in), native re-syncs current entitlements quietly.
- The page does not depend on the response to show Pro: `billing.getPlan` is reactive and flips when
  Convex records the subscription.
- User-facing results: cancelled → nothing; pending (Ask to Buy) → "Waiting for approval"; error →
  error toast; restore found nothing → "No purchases found for this Apple ID".

## Server

### `billing.appStore.syncTransaction({ signedTransaction })`

Authenticated Node action.

1. Verify the JWS with `SignedDataVerifier` (Apple root certificate checked into the repo,
   `enableOnlineChecks: true`, bundle ID `com.solomindlm.app`, app Apple ID from env), Production then
   Sandbox.
2. Reject product IDs other than the two above.
3. Look up the caller's token. The transaction's `appAccountToken` must equal it.
   - If it equals another existing user's token → reject with
     "This Apple ID's subscription is linked to another SolomindLM account."
   - If it belongs to no existing user (that account was deleted) → re-link to the caller.
4. Upsert `appStoreSubscriptions` by `originalTransactionId`; status from `expiresDate` and
   `revocationDate` (`revoked` if revoked, `expired` if past expiry, else `active`).

Errors use `InputValidationError` / `ExternalServiceError` mapped by `toConvexError`.

### `billing.appStore.getAccountToken()`

Authenticated mutation: returns the caller's token, creating it on first call.

### `POST /appstore/notifications` (`convex/http.ts`)

1. `verifyAndDecodeNotification(signedPayload)` (Production, then Sandbox). Invalid → `400`, no retry.
2. Claim the event by `notificationUUID` (same pattern as `claimWebhookEvent`); already processed → `200`.
3. Decode `signedTransactionInfo` and `signedRenewalInfo`. Find the row by `originalTransactionId`,
   else find the user by `appAccountToken`; unknown user → log and `200`.
4. Apply:

| Notification (subtype) | Effect |
| --- | --- |
| `SUBSCRIBED`, `DID_RENEW` | `active`, new `expiresAt`, `latestTransactionId` |
| `DID_FAIL_TO_RENEW` (`GRACE_PERIOD`) | `grace` |
| `DID_FAIL_TO_RENEW` (none), `GRACE_PERIOD_EXPIRED` | `billing_retry` |
| `EXPIRED` | `expired` |
| `REFUND`, `REVOKE` | `revoked` |
| `DID_CHANGE_RENEWAL_STATUS` | `autoRenews` |
| `DID_CHANGE_RENEWAL_PREF` | `autoRenewProductId` |
| anything else | ignored, marked processed |

5. Processing failure → mark failed, `500` so Apple retries.

### Double billing

- Shell, user has Stripe Pro: Billing page says "Your Pro plan is billed through the website." No
  purchase buttons, no link.
- Web, user has App Store Pro: Billing page says "Billed by Apple. Manage it in your iPhone's
  Settings." No Stripe checkout; `billing.actions.createCheckoutSession` also refuses server-side.

### Account deletion

`account/_purge.ts` deletes the user's `appStoreSubscriptions` and `appStoreAccountTokens` rows. The
delete-account dialog tells App Store subscribers that Apple keeps billing until they cancel in
Settings.

### Environment

`APPLE_BUNDLE_ID`, `APPLE_APP_ID` on Convex. No App Store Server API key: v1 never calls Apple's API.

## Web UI

`canOfferPurchases()` becomes: on the web, or in a shell that reports `iap: true`. A second helper,
`purchaseChannel(): "stripe" | "app_store" | "none"`, tells components which flow to use. Upgrade
CTAs (limit toasts, Pro badges, Header) reappear in IAP-capable builds and open the Billing page.

Billing page in an IAP-capable shell:

- Two plan cards with Apple's `displayPrice` and period; yearly savings computed from Apple's prices.
- Subscribe per card, **Restore purchases**, and **Manage subscription** for App Store subscribers.
- Near the buttons: "Auto-renews until canceled. Cancel any time in Settings at least 24 hours before
  renewal." with links to Terms of Use (EULA) and the Privacy Policy (guideline 3.1.2). The same
  links go in the App Store description.
- Products fail to load → message with Retry.

## Testing

- **Convex** (`convex-test`): notification → status mapping, `isProUser` across both tables
  including the `expiresAt` guard, token mismatch and re-link after deletion, duplicate
  notifications, `createCheckoutSession` refusal with App Store Pro, purge on deletion. Signature
  verification is tested with fixtures signed by a test certificate chain the verifier is configured
  to trust.
- **Web** (vitest): bridge client (ids, timeouts, malformed replies), Billing page states (web, old
  shell, IAP shell, Stripe Pro, App Store Pro), `canOfferPurchases` / `purchaseChannel`.
- **Mobile** (jest): bridge message parsing and response building.
- **Manual**: TestFlight with a Sandbox tester: buy, cancel, Ask to Buy, restore on a second device,
  renewal (Sandbox renews fast), refund via Sandbox, notification receipt in Convex logs.

## Rollout

1. App Store Connect: subscription group and products with prices, Small Business Program, Billing
   Grace Period, Server Notifications V2 URL (Production and Sandbox) →
   `https://<prod deployment>.convex.site/appstore/notifications`.
2. Merge web + Convex. No visible change until a build reports `iap: true`.
3. New native build (also ships the #619 upload-button gating). Test on TestFlight.
4. Attach the subscriptions to the resubmitted version, update App Privacy (purchases) and the
   review notes, reply to App Review.

## Out of scope

Google Play billing; App Store Server API calls (including a daily reconciliation job); offers and
trials; migrating Stripe subscribers to Apple; family sharing (left off for the products).
