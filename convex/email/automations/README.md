# Welcome / first-run Resend Automation

Operator steps only. Do not put API keys in this file.

## DNS and sending domains (before enabling in production)

1. Verify `solomindlm.com` in Resend (if not already).
2. Add sending subdomains:
   - `notify.solomindlm.com` — transactional (OTP, receipts, dunning)
   - `mail.solomindlm.com` — lifecycle / Automations
3. Align SPF, DKIM, and DMARC on each subdomain.
4. Set org-domain DMARC to at least `p=none` with `rua` reporting; move to `p=quarantine` once Google Postmaster is clean.
5. Enroll both subdomains in [Google Postmaster Tools](https://postmaster.google.com/).
6. Set Convex env:
   - `AUTH_RESEND_FROM=Solomind <notify@notify.solomindlm.com>`
   - `RESEND_TRANSACTIONAL_FROM` (can match auth From)
   - `RESEND_LIFECYCLE_FROM=Solomind <hello@mail.solomindlm.com>`
   - `RESEND_WEBHOOK_SECRET` from the webhook below
   - `RESEND_TEST_MODE=false` in production only
7. Production fails closed if `AUTH_RESEND_FROM` still contains `@resend.dev`.

## Webhook

Create a Resend webhook at `https://<deployment>.convex.site/resend-webhook` subscribed to `email.*` events. Paste the signing secret into `RESEND_WEBHOOK_SECRET`.

## Custom events

Create these custom events in Resend (Events) with optional schemas:

| Event | Payload |
| --- | --- |
| `user.created` | `{ userId: string }` |
| `notebook.created` | `{ userId: string }` |
| `source.added` | `{ userId: string }` |
| `artifact.generated` | `{ userId: string }` |
| `onboarding.completed` | `{ userId: string }` |

Billing events (`subscription.started`, `subscription.canceled`, `invoice.paid`, `invoice.payment_failed`) are also emitted for later Automations.

## Templates

Publish four lifecycle templates. Each **must** include `{{{RESEND_UNSUBSCRIBE_URL}}}` and send from `RESEND_LIFECYCLE_FROM`:

1. Welcome to SolomindLM
2. Create your first notebook
3. Add a source
4. Generate study materials

Replace the `{{TEMPLATE_*_ID}}` placeholders in `welcome-onboarding.json` with the published template IDs.

## Import and enable

1. Duplicate rather than edit an enabled automation in place.
2. Import `welcome-onboarding.json` via the Automations API or recreate the graph in the dashboard.
3. Dry-run: from the Convex dashboard, run `email/emit:emit` to your own email with `event: "user.created"`.
4. Confirm OTP sign-up still works independently of Automations.
5. Enable the automation only after the dry-run looks correct.

`onboarding.completed` is a wait-for-event at the end of the graph so remaining reminder sends stop once the user finishes the in-app tour. If the editor supports a global cancel-on-event, add that as well.
