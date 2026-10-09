# Content-Security-Policy

The policy lives in one place: the `Content-Security-Policy-Report-Only` header in
[`apps/web/vercel.json`](../../apps/web/vercel.json). It is currently **report-only**: browsers log
violations but block nothing.

`vercel.json` uses the legacy `routes` array, so every response header (the CSP,
`X-Content-Type-Options`, `X-Frame-Options`) sits on the first route entry,
`{ "src": "/(.*)", "headers": {...}, "continue": true }`, ahead of `{ "handle": "filesystem" }`.
Vercel ignores top-level `headers`, `redirects`, `rewrites`, `cleanUrls` and `trailingSlash` when
`routes` is present, without failing the build. Until October 2026 the headers sat in a top-level
`headers` block and never reached production.

## What guards it

| Guard | Where | Catches |
| --- | --- | --- |
| Static check | `apps/web/src/shared/security/csp.test.ts` (`test:web`) | Headers declared where Vercel ignores them (a top-level `headers`/`redirects`/`rewrites` next to `routes`, or a headers route after `handle: filesystem`), `nosniff`/`DENY` removed, policy removed or loosened (`'unsafe-inline'`/`'unsafe-eval'` in `script-src`, bare `*`), inline `<script>` in `index.html`, an `index.html` script origin missing from `script-src`, `report-uri` pointing at a route that doesn't exist |
| Browser smoke test | `e2e/csp/csp.spec.ts` (`bun run test:csp`, CI job **CSP smoke test**) | Any `securitypolicyviolation` on `/`, `/sign-in`, `/faq`, `/privacy`, including secondary requests such as GA4 collect calls |
| Deployed headers | `e2e/csp/check-deployed-headers.ts` (`bun run test:deployed-headers <url>`, workflow **Deployed headers** on every Vercel `deployment_status`) | A deployment that doesn't send the `vercel.json` headers on `/`, `/faq`, an SEO page, an SPA route or a static file, or an unknown path that stops returning 404. Needs the `VERCEL_AUTOMATION_BYPASS_SECRET` repo secret for protected previews; advisory, not a required check |
| Production reports | `POST /api/csp-report` in `convex/http.ts` | Violations on pages and flows the tests don't cover (signed-in app, Google Drive Picker, audio, YouTube embeds) |

The smoke test serves the built app with the headers from `vercel.json` (`e2e/csp/serve-dist.ts`),
so it tests the policy that ships. It needs no secrets or backend, unlike the main E2E suite.

## Adding a third-party script, API or embed

1. Add the origin to the narrowest directive that needs it in `vercel.json` (`script-src`,
   `connect-src`, `frame-src`, ...). Do not add `*`.
2. Run `bun run build:prod && bun run test:csp`. A missing origin shows up as a violation naming
   the blocked URL and directive.
3. Prefer an external file over an inline script (`apps/web/public/*.js`).

## Reading production reports

Reports are written to the Convex logs as one JSON line each (query strings are stripped, browser
extension noise is dropped). In a Log Stream, filter on `topic:service service:csp`; the interesting
fields are `effectiveDirective`, `blockedUri`, `documentUri` and `sourceFile`.

## Moving from report-only to enforcing

1. Let report-only run for a few days and click through the flows the tests don't cover: sign-in
   (email and Google), Google Drive Picker, audio overviews, YouTube embeds, billing redirect.
2. Allow every legitimate origin that shows up in the reports; fix or remove anything that is not.
3. Rename the header key in `vercel.json` from `Content-Security-Policy-Report-Only` to
   `Content-Security-Policy`. The static check and the browser test work in both modes.
4. Keep `report-uri` so enforced violations are still visible.

Caveats: `frame-ancestors` and `report-uri` must be delivered as headers, not `<meta>`.
`report-uri` is used instead of `report-to` because Firefox and Safari only honour the former.
