# 0003. Sell Pro on iOS with direct StoreKit in-app purchase

- **Status:** Accepted
- **Date:** 2026-11-06
- **Deciders:** @samintisar
- **PR:** #620

## Context

App Review rejected iOS 1.0 under guideline 3.1.1: the app unlocks Pro that was
bought on the web (Stripe) but offers no in-app purchase. Pro is sold through
Stripe on the web, and the iOS app is a WebView shell, so the existing Billing
page has to start working inside it. The iOS price is set in App Store
Connect; the app only displays Apple's localized price strings.

Apple signs every transaction and sends App Store Server Notifications V2 for
renewals, grace periods, expiry and refunds. Convex already holds the Stripe
entitlement in `isProUser`.

## Decision

We will sell Pro on iOS as two auto-renewable subscriptions through StoreKit 2,
using `expo-iap` in the native shell. Convex verifies Apple's signed data with
`@apple/app-store-server-library` and keeps the subscription current from App
Store Server Notifications V2. `isProUser` and a new `billing.getPlan` query
read Stripe and App Store state together, so both stores grant the same Pro
entitlement.

Each purchase carries a per-user `appAccountToken`, which ties a transaction to
a SolomindLM account. We do not use a third-party billing service and never
trust a client-sent receipt: the server accepts only transactions whose
signature it has verified.

## Alternatives considered

- **RevenueCat** — handles receipts, notifications and cross-store entitlements,
  but adds a revenue share, a new data processor, and a dependency on a
  third party for access to paid features.
- **Trust the client's transaction without server verification** — rejected:
  anyone could forge a "purchase" and get Pro for free.

## Consequences

- No revenue share and no extra data processor beyond Apple.
- We own the edge cases: Ask to Buy, grace period, refunds, restores, Apple IDs
  shared across accounts, and replayed or out-of-order transactions. The rules
  are in the design spec and covered by Convex tests.
- Verification and the purchase flow are only exercised for real in Sandbox on
  TestFlight.
- Adding Google Play later means revisiting a billing service such as
  RevenueCat or writing Play Billing verification. The entitlement model is
  store-neutral to keep that open.
- Follow-up: App Store Connect setup and the new native build are tracked in the
  release checklist in the spec.
