# iOS in-app purchase for Pro

**Status:** Approved; implemented on branch feature/ios-iap.
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
  gracePeriodExpiresAt: v.optional(v.number()), // from renewal info
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
- an `appStoreSubscriptions` row with status `active` or `grace` whose access deadline, the later
  of `expiresAt` and `gracePeriodExpiresAt`, is later than now minus one day. During Billing Grace
  Period `expiresAt` is already past, so the grace deadline is what keeps access. The day of
  leeway covers a renewal notification that arrives late; the deadline check covers an `EXPIRED`
  notification that never arrives.

`billing.getPlan` returns `{ tier: "free" | "pro", source: "stripe" | "app_store" | null, stripe,
appStore: { productId, status, expiresAt, gracePeriodExpiresAt, autoRenews, environment } | null }`.
The Billing page and the Header read it instead of reading `stripeSubscriptions` directly. The
feedback `planTier` reads `isProUser` (`convex/_lib/limits`), not `getPlan`.

### Sandbox

App Review and TestFlight buy in the Sandbox environment against the production app, so production
Convex accepts Sandbox transactions. The verifier reads the `environment` claim from the signed
payload itself (top level, else `data`, `summary` or `appData`) and picks the Production or Sandbox
verifier from it. Apple omits `appAppleId` from Sandbox notifications, so trying Production first
would reject them. The claim is unverified, but the library re-checks the environment after the
signature, so a forged claim only makes verification fail. Each row records its environment. TestFlight testers can get Pro without paying; that is
accepted.

## Bridge protocol

Uses the request/response pattern `nativeShellAuth.ts` already uses: the page posts a JSON request
with a `requestId` through `window.ReactNativeWebView.postMessage`; native answers by injecting a
script that dispatches a `CustomEvent` carrying the same id. There is one message type,
`shell-web:iap`, with an `action` field (`products`, `purchase`, `restore`, `manage`). Native
accepts these messages only from the app's own web origin. The purchase request times out after
5 minutes, not 60 s: the Apple sheet can stay up while the user signs in to a Sandbox account or
confirms with Face ID. The reactive `getPlan` query shows Pro even if the reply is lost.

**Capability flag.** New iOS builds inject `window.__SHELL_CAPABILITIES__ = { iap: true }` before
content loads. The web shows IAP UI only when it is present. The current 1.0 build and the Android
shell keep today's behaviour (plan summary, no purchase UI).

| `action` | Native action | Response |
| --- | --- | --- |
| `products` | `fetchProducts` for both IDs | `{ products: [{ id, displayPrice, price (number | null), period }] }` or `{ error }` |
| `purchase` (+ `productId`) | Get account token from Convex, `requestPurchase` with `appAccountToken`, send the signed transaction to `syncTransaction`, then `finishTransaction` | `{ status: "purchased" \| "cancelled" \| "pending" \| "error", message? }` |
| `restore` | Ask the App Store to sync, then `getAvailablePurchases`, sync each | `{ restored: number }` or `{ error }` |
| `manage` | `deepLinkToSubscriptions` | none |

Rules:

- `finishTransaction` runs only after `syncTransaction` succeeds. If the app dies in between, StoreKit
  redelivers the transaction on the next launch and it is synced then.
- On every launch (once signed in), native re-syncs current entitlements quietly. This never shows
  an App Store prompt.
- One purchase runs at a time, with a 5-minute native timeout. The result comes from
  `requestPurchase`'s return value; the purchase listener and that call dedupe by transaction id so
  a transaction is synced once.
- Ask to Buy surfaces from expo-iap as a `DeferredPayment` error and maps to `pending`.
- Explicit Restore first asks the App Store to sync, then syncs available purchases. If the store sync
  fails it still syncs what StoreKit already has.
- The page does not depend on the response to show Pro: `billing.getPlan` is reactive and flips when
  Convex records the subscription.
- User-facing results: cancelled → nothing; pending (Ask to Buy) → "Waiting for approval"; error →
  error toast; restore found nothing → "No purchases found for this Apple ID".

## Server

### `billing.appStoreNode.syncTransaction({ signedTransaction })`

Authenticated Node action.

1. Reject a payload over 64k characters, and rate limit to 60 calls per hour per user. Verify the JWS
   with `SignedDataVerifier` (Apple root certificate checked into the repo,
   `enableOnlineChecks: true`, bundle ID and app Apple ID constants in
   `convex/billing/appStoreProducts.ts`), using the environment the payload claims.
2. Reject product IDs other than the two above.
3. Look up the owner of the transaction's `appAccountToken`.
   - No token on the transaction, or a token no account owns (that account was deleted) → accepted
     for the caller.
   - A token owned by another account → reject with
     "This Apple ID's subscription is linked to another SolomindLM account."
   - A subscription row already owned by another account is rejected too, unless the caller's token
     is on the transaction and that row has lapsed (see the row rules below).
4. Upsert `appStoreSubscriptions` by `originalTransactionId`; status from `expiresDate` and
   `revocationDate` (`revoked` if revoked, `expired` if past expiry, else `active`).

Row rules, shared by this path and notifications:

- Data about an older period (`expiresAt` below the stored value) never changes a row.
- A client-sent transaction without a revocation cannot undo a revocation unless it is for a later
  period. Only a notification can.
- A lapsed (not entitled) row moves to the account whose token is on a new transaction, because Apple
  keeps one `originalTransactionId` per Apple ID across resubscribes. An entitled row keeps its owner.

Errors use `InputValidationError` / `ExternalServiceError` mapped by `toConvexError`. Calls are
logged with `serviceLogger`.

### `billing.appStore.getAccountToken()`

Authenticated mutation: returns the caller's token, creating it on first call.

### `POST /appstore/notifications` (`convex/http.ts`)

1. Reject bodies over 64 KiB (`413`) and anything that is not JWS-shaped (three base64url parts)
   before starting a Node action. Then `verifyAndDecodeNotification(signedPayload)`, using the
   payload's environment claim. A signature or payload that fails verification → `400`; Apple does retry, which gives time to fix a config problem (wrong bundle or app ID, missing root certificate). A
   transient OCSP or network failure (`RETRYABLE_VERIFICATION_FAILURE`) throws
   `ExternalServiceError` → `500`, so Apple retries.
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
| anything else | Expiry and renewal info from the transaction still update the row; without a subscription transaction the notification is ignored and marked processed |

5. Applying the state and marking the event processed happen in one mutation. Processing failure →
   mark failed, `500` so Apple retries.

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

No new env vars. The bundle ID and app Apple ID are not secret, so they are constants in
`convex/billing/appStoreProducts.ts`. No App Store Server API key: v1 never calls Apple's API.

## Web UI

`canOfferPurchases()` becomes: on the web, or in a shell that reports `iap: true`. A second helper,
`purchaseChannel(): "stripe" | "app_store" | "none"`, tells components which flow to use. Upgrade
CTAs (limit toasts, Pro badges, Header) reappear in IAP-capable builds and open the Billing page.

Billing page in an IAP-capable shell:

- Two plan cards, "Pro Yearly" and "Pro Monthly", with Apple's `displayPrice` and period; yearly
  savings computed from Apple's prices. Purchase buttons stay hidden while the plan loads.
- Subscribe per card, **Restore purchases**, and **Manage subscription** for App Store subscribers.
- Above the cards: "Payment is charged to your Apple ID at confirmation of purchase." plus the
  auto-renew terms ("Auto-renews until canceled. Cancel any time in Settings at least 24 hours before
  renewal.") and links to Terms of Use (EULA) and the Privacy Policy (guideline 3.1.2). The same
  links go in the App Store description.
- During Apple's grace period the page shows "Payment issue" (`past_due`) with a message instead of
  "Renews on".
- The limit-toast "Upgrade" action goes to `/billing` in app builds.
- Products fail to load → message with Retry.

## Testing

- **Convex** (`convex-test`): notification → status mapping, `isProUser` across both tables
  including the access-deadline guard, token mismatch and re-link after deletion, stale and replayed
  data, duplicate notifications, `createCheckoutSession` refusal with App Store Pro, purge on
  deletion. The verifier wrapper is mocked.
- **Web** (vitest): bridge client (ids, timeouts, malformed replies), Billing page states (web, old
  shell, IAP shell, Stripe Pro, App Store Pro), `canOfferPurchases` / `purchaseChannel`.
- **Mobile** (jest): bridge message parsing and response building.
- **Manual**: TestFlight with a Sandbox tester: buy, cancel, Ask to Buy, restore on a second device,
  renewal (Sandbox renews fast), refund via Sandbox, notification receipt in Convex logs.
- **Verification** is not covered by self-signed fixtures. Signature verification sits behind a thin
  wrapper (`convex/billing/appStoreVerifier.ts`) that the Convex tests mock; it is exercised in
  Sandbox on TestFlight.

## Rollout

1. App Store Connect: subscription group and products with prices, Billing
   Grace Period, Server Notifications V2 URL (Production and Sandbox) →
   `https://<prod deployment>.convex.site/appstore/notifications`.
2. Merge web + Convex. No visible change until a build reports `iap: true`.
3. New native build (also ships the #619 upload-button gating). Test on TestFlight.
4. Attach the subscriptions to the resubmitted version, update App Privacy (purchases) and the
   review notes, reply to App Review.

### Release checklist note

Put both products at the same service level in the subscription group (or the yearly one higher).
Otherwise an immediate upgrade to a shorter product would be ignored by the rule that a row never
rolls back to an older period.

The App Review demo account must be on Free (no Stripe or App Store subscription); otherwise the
in-app Billing page shows "billed through the website" and no purchase buttons.

Sandbox purchases (TestFlight, App Review) only grant Pro to accounts in the Convex env var
`APP_STORE_SANDBOX_ACCESS`: `all` on dev, and on production a comma-separated email allowlist with
the App Review demo account and any testers. Unset, every Sandbox purchase is refused.

## Out of scope

Google Play billing; App Store Server API calls (including a daily reconciliation job); offers and
trials; migrating Stripe subscribers to Apple; family sharing (left off for the products).
