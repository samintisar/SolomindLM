# Resend Email Automation Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SolomindLM from plain-text Auth OTP sends into a 2026-grade email system: durable transactional delivery, event-driven lifecycle automations, and complaint-safe marketing later.

**Architecture:** Split email into three streams on one Resend account. Auth OTPs stay in Convex Auth providers (they have no Convex `ctx`) but render React Email HTML with idempotency keys. All other transactional mail goes through `@convex-dev/resend` (queue, batch, retry, webhooks). Lifecycle sequences (welcome, onboarding drip, re-engagement) live in Resend Automations; Convex only emits named events. Marketing broadcasts and Topics come last.

**Tech Stack:** `resend` ^6.22 (events + automations APIs), `@convex-dev/resend`, `@react-email/components`, existing Convex Auth Password `verify`/`reset` providers, Stripe webhooks already in `convex/billing/webhook.ts`.

**Out of scope for v1:** BIMI/VMC, dedicated IPs, a second ESP, a custom in-app journey reducer, newsletters, inbound receiving.

---

## Research snapshot (2026)

Mailbox providers now treat email as authenticated, complaint-capped infrastructure:

- **Gmail/Yahoo/Outlook bulk rules:** SPF + DKIM + DMARC, From-domain alignment, TLS, spam complaints **< 0.1% target / 0.3% hard ceiling**. Marketing mail needs RFC 8058 one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`) honored within 2 days. ([Google sender guidelines](https://support.google.com/a/answer/81126))
- **Stream separation:** transactional and marketing must not share From-domain reputation. Use `notify.solomindlm.com` for OTP/billing and `mail.solomindlm.com` (or `hello@`) for lifecycle/marketing. ([stream-separation practice](https://www.mailwarm.com/blog/stream-separation-email-domains-subdomains-ips-transactional-marketing))
- **Lifecycle is event-driven, not calendar drip.** Sequences should wait for product events (`notebook.created`, `onboarding.completed`) and cancel when the user already did the thing. ([SaaS sequence types](https://resources.mailertogo.com/glossary/saas-email-sequence))
- **Resend Automations (2026):** custom events, delays, wait-for-event, conditions, send-email from Templates, contact/segment updates, run observability. Fire with `resend.events.send()`. Audiences are **Segments**. Topics handle preference opt-in/out. ([Resend Automations](https://resend.com/docs/dashboard/automations/introduction), [introducing Automations](https://www.resend.com/blog/introducing-automations))
- **Own domain logic, rent sending:** do not sync the whole user graph into Customer.io/Klaviyo. Emit events; let Resend orchestrate delays. Keep Auth OTP and billing receipts in-app because they are product-critical and time-sensitive. ([lifecycle-in-app argument](https://understandingdata.com/posts/lifecycle-email-engine/) — we take the event-emission half, not a custom reducer)
- **SDK gap:** repo is on `resend@^4.8.0`. Automations/`events.send` need the current Node SDK (**6.22.0** as of 2026-08-21). User-Agent is required on newer APIs.

## Current system (what we actually have)

| Capability | Today |
| --- | --- |
| Sends | `convex/ResendOTP.ts` + `convex/ResendOTPPasswordReset.ts` call `resend.emails.send()` with **plain text** |
| From | `AUTH_RESEND_FROM` or `Solomind <onboarding@resend.dev>` |
| Templates | None (no React Email, no Resend Templates) |
| Idempotency | None |
| Webhooks / bounces / complaints | None |
| Durable queue | None (direct SDK; no `@convex-dev/resend`) |
| Lifecycle | Onboarding exists in-app (`createNotebook` → `generateArtifact`) with **zero emails** |
| Billing | Stripe handles `checkout.session.completed`, `subscription.updated/deleted`, `invoice.paid` — **no customer email**, and **`invoice.payment_failed` is unhandled** |
| Preferences | `userPreferences` is output language only |

## Approaches considered

1. **All-in Convex reducer + scheduled sends** — full control, highest engineering cost, duplicates what Automations just launched.
2. **All-in Resend Automations** — cannot cover Auth OTP (no `ctx`, must be immediate) or bounce suppression in our DB.
3. **Hybrid (recommended)** — this plan. Transactional via Convex Resend component + React Email. Lifecycle via Automations. Marketing via Broadcasts/Topics later.

## Email catalog (v1)

**Transactional** (`notify@` / `notify.solomindlm.com`):

1. Sign-up verification OTP (exists, upgrade templates)
2. Password reset OTP (exists, upgrade templates)
3. Payment receipt (`invoice.paid`)
4. Payment failed / dunning (`invoice.payment_failed` — add Stripe handler)
5. Subscription canceled (`customer.subscription.deleted`)

**Lifecycle** (Automations, `hello@` / `mail.solomindlm.com`, include unsubscribe):

1. `user.created` → welcome immediately
2. If not `notebook.created` in 24h → “create your first notebook”
3. If not `source.added` in 3 days → “upload a lecture or paper”
4. If not `artifact.generated` in 7 days → “turn notes into flashcards”
5. `onboarding.completed` → cancel remaining drip (wait-for-event / condition)

**Later (not this plan):** inactivity 14d, limit-hit upgrade nudge, product-update broadcasts.

## File structure

```
convex/
  convex.config.ts                         add @convex-dev/resend
  http.ts                                  POST /resend-webhook
  email/
    client.ts                              Resend component instance + event SDK helper
    events.ts                              named event constants + payload types
    emit.ts                                internalAction: resend.events.send
    contacts.ts                            upsert Resend contact (email, userId, plan)
    handleEmailEvent.ts                    bounce/complaint suppression
    sendTransactional.ts                  receipt / failed payment / cancel
    automations/
      welcome-onboarding.json               versioned Automation graph (docs + API import)
  email.test.ts                            emit + idempotency key tests
  _lib/resendSendError.ts                   keep; used by Auth providers
  _lib/resendSendError.test.ts              new
  ResendOTP.ts                             HTML + text + idempotencyKey
  ResendOTPPasswordReset.ts                 same
  billing/webhook.ts                       fire emails + events; add payment_failed
  onboarding/state.ts                      emit user.created on first row
  onboarding/mutations.ts                   emit milestone events
  _model/notebooks.ts                      emit notebook.created
  schema.ts                                emailSuppressions + emailPreference fields
  userPreferences/index.ts                 marketingOptIn + topics

apps/web/src/emails/                      React Email (imported from Convex via relative path)
  components/Layout.tsx
  VerifyEmail.tsx
  ResetPassword.tsx
  PaymentReceipt.tsx
  PaymentFailed.tsx
  SubscriptionCanceled.tsx
apps/web/src/emails/*.test.ts              render-to-HTML snapshot-ish string asserts
```

React Email lives under `apps/web/src/emails/` so the web app can preview later; Convex Auth files import via `../apps/web/src/emails/...` **or** a shared `packages/emails` if import from Convex is awkward. **Decision in Task 1:** if Convex tsconfig cannot import from `apps/web`, put templates in `convex/email/templates/` as `.tsx` (Convex already compiles TSX in Node actions). Prefer `convex/email/templates/` to avoid cross-package path pain.

**Revised location:** `convex/email/templates/*.tsx` — Convex Auth + actions both live in `convex/`.

---

### Task 1: Dependencies and env

**Files:**

- Modify: `package.json`
- Modify: `README.md` env table (around the existing `RESEND_API_KEY` / `AUTH_RESEND_FROM` rows)

- [ ] **Step 1: Install packages**

```bash
bun add resend@^6.22.0 @convex-dev/resend @react-email/components
```

Keep `@auth/core` Resend provider as-is. Do not add `@react-email/preview-server` yet.

- [ ] **Step 2: Env vars (document; set in Convex dashboard + `.env.local`)**

| Var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | existing |
| `AUTH_RESEND_FROM` | OTP From, e.g. `Solomind <notify@notify.solomindlm.com>` |
| `RESEND_TRANSACTIONAL_FROM` | billing From (can equal AUTH from) |
| `RESEND_LIFECYCLE_FROM` | Automations From, e.g. `Solomind <hello@mail.solomindlm.com>` |
| `RESEND_WEBHOOK_SECRET` | Svix signing secret from Resend webhook |
| `RESEND_TEST_MODE` | `true` in dev (Convex component default is testMode=true) |

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock README.md
git commit -m "$(cat <<'EOF'
chore: bump Resend SDK and add Convex Resend + React Email

Needed for Automations events, durable sends, and HTML templates.
EOF
)"
```

---

### Task 2: Mount `@convex-dev/resend`

**Files:**

- Modify: `convex/convex.config.ts`
- Create: `convex/email/client.ts`
- Modify: `convex/http.ts`

- [ ] **Step 1: Register the component**

In `convex/convex.config.ts`, after the workflow import:

```ts
import resend from "@convex-dev/resend/convex.config.js";
```

After `app.use(workflow);`:

```ts
app.use(resend);
```

- [ ] **Step 2: Create the client**

Create `convex/email/client.ts`:

```ts
import { Resend } from "@convex-dev/resend";
import { components, internal } from "../_generated/api";

export const resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE !== "false",
  apiKey: process.env.RESEND_API_KEY,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  onEmailEvent: internal.email.handleEmailEvent.handleEmailEvent,
});
```

`handleEmailEvent` is added in Task 6; until then, omit `onEmailEvent` so the project typechecks, then wire it in Task 6.

- [ ] **Step 3: Webhook route**

In `convex/http.ts`, after the Stripe webhook block, import `resend` from `./email/client` and add:

```ts
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req);
  }),
});
```

Dashboard: create webhook at `https://<deployment>.convex.site/resend-webhook` subscribed to all `email.*` events. Paste signing secret into `RESEND_WEBHOOK_SECRET`.

- [ ] **Step 4: Run Convex codegen** (`npx convex dev` or existing codegen) and `bun run typecheck:convex`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: mount Convex Resend component and webhook endpoint"
```

---

### Task 3: React Email templates + OTP upgrade

**Files:**

- Create: `convex/email/templates/Layout.tsx`
- Create: `convex/email/templates/VerifyEmail.tsx`
- Create: `convex/email/templates/ResetPassword.tsx`
- Create: `convex/_lib/resendSendError.test.ts`
- Modify: `convex/ResendOTP.ts`
- Modify: `convex/ResendOTPPasswordReset.ts`

- [ ] **Step 1: Shared layout**

`convex/email/templates/Layout.tsx`:

```tsx
import { Body, Container, Head, Html, Preview, Text } from "@react-email/components";
import type { ReactNode } from "react";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "560px" }}>
          {children}
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>
            SolomindLM · If you did not request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: OTP templates**

`VerifyEmail.tsx` / `ResetPassword.tsx` take `{ token: string }` and render the 8-digit code in a large monospace `Text`. Also export a `text` helper:

```ts
export function verifyEmailText(token: string): string {
  return `Your verification code is: ${token}\n\nIf you did not request this, you can ignore this email.`;
}
```

- [ ] **Step 3: Send with HTML + text + idempotency**

In `ResendOTP.ts` `sendVerificationRequest`:

```ts
import { render } from "@react-email/components";
import { VerifyEmail, verifyEmailText } from "./email/templates/VerifyEmail";

const html = await render(VerifyEmail({ token }));
const { error } = await resend.emails.send({
  from,
  to: [email],
  subject: "Verify your email for Solomind",
  html,
  text: verifyEmailText(token),
  idempotencyKey: `otp-verify:${email}:${token}`,
});
```

Same pattern for password reset with key `otp-reset:${email}:${token}`. Confirm `resend@6` `emails.send` still accepts `idempotencyKey` (it does; 409 means replay).

If Auth’s runtime cannot `await render()`, use `render({ pretty: false })` from `@react-email/components` — it is async in current React Email. Do **not** pass JSX as `react:` into the Auth-path SDK call unless this SDK version is confirmed to bundle React in that context; HTML string is safer for Auth providers.

- [ ] **Step 4: Tests for `throwOnResendSendError`**

```ts
import { describe, expect, it } from "vitest";
import { throwOnResendSendError } from "./resendSendError";

describe("throwOnResendSendError", () => {
  it("rewrites Resend test-mode restriction", () => {
    expect(() =>
      throwOnResendSendError({ message: "You can only send testing emails to your own email" })
    ).toThrow(/verify a domain/);
  });

  it("passes through other messages", () => {
    expect(() => throwOnResendSendError({ message: "Rate limit" })).toThrow("Rate limit");
  });
});
```

Run: `bun run test:convex` (or the file’s vitest path used by this repo).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: send Auth OTPs as React Email HTML with idempotency keys"
```

---

### Task 4: Event catalog + emit action

**Files:**

- Create: `convex/email/events.ts`
- Create: `convex/email/emit.ts`
- Create: `convex/email/emit.test.ts`

- [ ] **Step 1: Event names** — keep them product-shaped, never `resend:` prefixed.

```ts
export const EMAIL_EVENTS = {
  userCreated: "user.created",
  notebookCreated: "notebook.created",
  sourceAdded: "source.added",
  artifactGenerated: "artifact.generated",
  onboardingCompleted: "onboarding.completed",
  subscriptionStarted: "subscription.started",
  subscriptionCanceled: "subscription.canceled",
  invoicePaid: "invoice.paid",
  invoicePaymentFailed: "invoice.payment_failed",
} as const;

export type EmailEventName = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];
```

- [ ] **Step 2: Emit action** (`"use node"` because it uses the Resend Node SDK)

`convex/email/emit.ts`:

```ts
"use node";

import { Resend } from "resend";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { EMAIL_EVENTS } from "./events";

const eventNameValidator = v.union(
  v.literal("user.created"),
  v.literal("notebook.created"),
  v.literal("source.added"),
  v.literal("artifact.generated"),
  v.literal("onboarding.completed"),
  v.literal("subscription.started"),
  v.literal("subscription.canceled"),
  v.literal("invoice.paid"),
  v.literal("invoice.payment_failed")
);

export const emit = internalAction({
  args: {
    event: eventNameValidator,
    email: v.string(),
    payload: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY not configured");
    const resend = new Resend(apiKey);
    const { error } = await resend.events.send({
      event: args.event,
      email: args.email,
      payload: args.payload ?? {},
    });
    if (error) throw new Error(error.message);
    return null;
  },
});
```

Call sites: `await ctx.scheduler.runAfter(0, internal.email.emit.emit, { ... })` from mutations (never call `events.send` inline in a mutation).

- [ ] **Step 3: Unit-test the event map** (no network): every `EMAIL_EVENTS` value is unique and matches the validator literals.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Resend Automations event emit action"
```

---

### Task 5: Wire product events

**Files:**

- Modify: `convex/onboarding/state.ts` (`getOrCreateOnboardingRow`)
- Modify: `convex/onboarding/mutations.ts` (`completeTour`)
- Modify: `convex/_model/notebooks.ts` (`createNotebook`)
- Find document-create + first studio artifact insert (documents module + studio job complete) and emit `source.added` / `artifact.generated` once per user (idempotent flag on `userOnboarding` or a tiny `emailMilestones` table)

**Idempotency:** add optional fields on `userOnboarding`:

```ts
emittedUserCreated: v.optional(v.boolean()),
emittedNotebookCreated: v.optional(v.boolean()),
emittedSourceAdded: v.optional(v.boolean()),
emittedArtifactGenerated: v.optional(v.boolean()),
```

Widen-migrate-narrow is not needed (all optional). Set the flag in the same mutation **before** scheduling emit so retries do not double-fire.

Helper to resolve email:

```ts
async function userEmail(ctx: MutationCtx, userId: Id<"users">): Promise<string | null> {
  const user = await ctx.db.get(userId);
  return user?.email ?? null;
}
```

`getOrCreateOnboardingRow`: on insert only, if email present, `emittedUserCreated: true` then `scheduler.runAfter(0, internal.email.emit.emit, { event: "user.created", email, payload: { userId } })`.

`createNotebook`: if `!row.emittedNotebookCreated`, patch flag + emit.

First successful document ingest / first completed flashcard|quiz|etc.: emit `source.added` / `artifact.generated`. Prefer hooking the existing onboarding checklist completion detectors rather than every insert.

`completeTour` / checklist all-done: emit `onboarding.completed` so Automations can stop the drip (`Wait for event`).

- [ ] **Tests:** extend `convex/onboarding/state.test.ts` to assert `scheduler` was invoked on first create (convex-test can inspect scheduled functions if the suite already does; otherwise assert the flag is set).

- [ ] **Commit**

```bash
git commit -m "feat: emit Resend lifecycle events from onboarding and first-run milestones"
```

---

### Task 6: Bounce/complaint suppression

**Files:**

- Modify: `convex/schema.ts`
- Create: `convex/email/handleEmailEvent.ts`
- Modify: `convex/email/client.ts` (`onEmailEvent`)

Schema:

```ts
emailSuppressions: defineTable({
  email: v.string(),
  reason: v.union(v.literal("bounce"), v.literal("complaint")),
  emailId: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_email", ["email"]),
```

Handler:

```ts
import { vOnEmailEventArgs } from "@convex-dev/resend";
import { internalMutation } from "../_generated/server";

export const handleEmailEvent = internalMutation({
  args: vOnEmailEventArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const type = args.event.type;
    if (type !== "email.bounced" && type !== "email.complained") return null;
    const to = args.event.data.to;
    const addresses = Array.isArray(to) ? to : [to];
    const reason = type === "email.bounced" ? "bounce" : "complaint";
    for (const email of addresses) {
      if (!email) continue;
      const existing = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (existing) continue;
      await ctx.db.insert("emailSuppressions", {
        email,
        reason,
        emailId: args.id,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
```

Before every transactional `sendEmail` and before `emit`, skip if suppressed.

Resend also auto-suppresses at the ESP; this table stops us from enqueueing more lifecycle events that waste Automation runs.

- [ ] **Commit**

```bash
git commit -m "feat: suppress bounced and complained addresses from future email"
```

---

### Task 7: Billing transactional emails

**Files:**

- Create: `convex/email/templates/PaymentReceipt.tsx`
- Create: `convex/email/templates/PaymentFailed.tsx`
- Create: `convex/email/templates/SubscriptionCanceled.tsx`
- Create: `convex/email/sendTransactional.ts`
- Modify: `convex/billing/webhook.ts`

- [ ] **Step 1: `sendTransactional.ts`** — `internalMutation` that checks suppression, then `resend.sendEmail(ctx, { from, to, subject, html, text })`. Render HTML in a small `"use node"` internalAction that calls render then `runMutation` to enqueue, **or** render in the existing `"use node"` webhook action and pass html into an internalMutation. Prefer: webhook action already `"use node"` — render there, then `ctx.runMutation(internal.email.sendTransactional.enqueue, { ... })`.

- [ ] **Step 2: Stripe**

In `handleInvoicePaid`, after recording payment, look up user email and enqueue receipt + `emit invoice.paid`.

Add:

```ts
case "invoice.payment_failed":
  await handleInvoicePaymentFailed(ctx, event);
  break;
```

Implement `handleInvoicePaymentFailed` mirroring `handleInvoicePaid` field access; send PaymentFailed email + emit `invoice.payment_failed`.

`handleSubscriptionDeleted`: send SubscriptionCanceled + emit `subscription.canceled`.

`handleCheckoutCompleted` / first active sub: emit `subscription.started` (no extra marketing email in v1).

- [ ] **Step 3: Tests** — if billing webhook tests exist, add a case that `invoice.payment_failed` is not in the default branch. If none, add a focused test around the switch dispatch helper extracted from the action (extracting a pure `stripeEventToEmailJobs(event)` function is the TDD-friendly path).

- [ ] **Commit**

```bash
git commit -m "feat: send billing receipt, dunning, and cancel emails via Resend"
```

---

### Task 8: Resend Automations (dashboard + versioned JSON)

**Files:**

- Create: `convex/email/automations/welcome-onboarding.json`
- Create: `convex/email/automations/README.md` (operator steps only)

Create these **custom events** in the Resend dashboard (Events) with optional schemas:

- `user.created` `{ userId: string }`
- `notebook.created`, `source.added`, `artifact.generated`, `onboarding.completed`

Create **Templates** (published) for:

1. Welcome to SolomindLM
2. Create your first notebook
3. Add a source
4. Generate study materials

Automation graph (enabled after dry-run):

```
trigger user.created
  → send Welcome
  → wait_for_event notebook.created (timeout 24h)
       on event: skip reminder
       on timeout: send "create notebook"
  → wait_for_event source.added (timeout 72h)
       on timeout: send "add a source"
  → wait_for_event artifact.generated (timeout 7d)
       on timeout: send "generate flashcards"
  → wait_for_event onboarding.completed
       (global: if this fires at any time, stop remaining send steps)
```

Exact wait-for-event vs condition topology depends on the current Automations editor. Encode the intended graph in JSON matching [Create Automation](https://resend.com/docs/dashboard/automations/introduction) (`steps` + `connections`). Import via API or dashboard; do not edit enabled automations in place — duplicate, then switch.

Every lifecycle template **must** include `{{{RESEND_UNSUBSCRIBE_URL}}}` and send from `RESEND_LIFECYCLE_FROM`.

- [ ] **Manual verify:** fire `resend.events.send` from Convex dashboard to your own email; confirm OTP still works independently.

- [ ] **Commit JSON + README** (no secrets)

```bash
git commit -m "docs: version the welcome/onboarding Resend Automation graph"
```

---

### Task 9: Deliverability ops (not code)

Do this in Resend + DNS before enabling Automations in production:

1. Verify `solomindlm.com` (if not already).
2. Add sending subdomains: `notify.solomindlm.com` (transactional) and `mail.solomindlm.com` (lifecycle). Separate SPF/DKIM/DMARC alignment per subdomain.
3. DMARC on org domain at least `p=none` with rua reporting; plan `p=quarantine` once Postmaster Tools is clean.
4. Enroll [Google Postmaster Tools](https://postmaster.google.com/) for both subdomains.
5. Replace `onboarding@resend.dev` fallback in production — fail closed if `AUTH_RESEND_FROM` is still the Resend test domain.
6. Confirm Topics later for marketing; v1 lifecycle uses Resend’s unsubscribe URL.

Optional code hardening: if `process.env.AUTH_RESEND_FROM?.includes("@resend.dev")` and `CONVEX_DEPLOYMENT` looks like prod, log an error and skip send (dev-only test domain).

---

### Task 10: Verification

- [ ] `bun run typecheck:convex`
- [ ] `bun run typecheck:web`
- [ ] `bun run lint`
- [ ] `bun run test:convex`
- [ ] Sign-up + forgot-password e2e (`e2e/auth/sign-up.spec.ts`, `forgot-password.spec.ts`) — still pass in test mode
- [ ] Manual: OTP HTML in Gmail/Outlook; Stripe test clock or test invoice → receipt; bounce hook → `emailSuppressions` row
- [ ] Manual: first onboarding row → Automation run visible in Resend

---

## Self-review

| Spec / requirement | Task |
| --- | --- |
| Durable transactional send | 2, 7 |
| HTML OTP | 3 |
| Idempotency | 3 |
| Webhooks + suppression | 2, 6 |
| Event-driven onboarding | 4, 5, 8 |
| Billing + dunning | 7 |
| Stream separation / DMARC | 9 |
| SDK 6 + Automations API | 1, 4 |
| Broadcasts / Topics / BIMI | explicitly later |

No TBD steps. Types use `email` + `event` literals consistently (`emit`, `EMAIL_EVENTS`, `userOnboarding` flags).
