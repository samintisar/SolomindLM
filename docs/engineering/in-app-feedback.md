# In-app feedback

Users send bug reports / feature requests from the user menu ("Send feedback").
Submissions are stored in the Convex `feedback` table and confirmed with a
toast — there is no user-facing list of past submissions. Staff triage at
`/admin/feedback` and can push a submission to GitHub Issues.

## Convex env vars

| Var | Purpose | Default |
|---|---|---|
| `FEEDBACK_ADMIN_EMAILS` | Comma-separated email allowlist for `/admin/feedback` and the GitHub sync action. | `""` (no admins) |
| `FEEDBACK_GITHUB_TOKEN` | Fine-grained PAT with **Issues: write** on the target repo. Used only by the staff-triggered sync action. | `""` |
| `FEEDBACK_GITHUB_REPO` | `owner/repo` the issues are filed in. | `samintisar/SolomindLM` |

Set them:

```bash
bunx convex env set FEEDBACK_ADMIN_EMAILS "you@example.com"
bunx convex env set FEEDBACK_GITHUB_TOKEN "github_pat_..."
# prod:
bunx convex env set --prod FEEDBACK_ADMIN_EMAILS "you@example.com"
bunx convex env set --prod FEEDBACK_GITHUB_TOKEN "github_pat_..."
```

Add a staff member by appending their email (comma-separated) to
`FEEDBACK_ADMIN_EMAILS`. Matching is case-insensitive against the user's
account email.

## Behaviour notes

- `planTier` is derived server-side from the active Stripe subscription — never trusted from the client.
- Submissions are rate-limited to 5 per user per hour (`feedbackSubmit` window in `convex/_lib/rateLimits.ts`).
- The GitHub sync is one-directional and manual. Re-syncing a row is blocked once `githubIssueNumber` is set; the button in the triage list is replaced by the issue link.
- Issues are labelled `type:bug`/`type:feature` + `status:triage` and titled `[Feedback] <first line>`.
- `lastRequestId` is captured if `setLastRequestId()` (in `apps/web/src/features/feedback/lastRequestId.ts`) has been called on the web client; no producers are wired yet.
- The Expo mobile app is a WebView over the web routes, so the "Send feedback" entry point works there with no native change.

## Key files

| Area | Path |
|---|---|
| Schema | `convex/schema.ts` (`feedback` table) |
| Server functions | `convex/feedback/index.ts`, `convex/feedback/github.ts` |
| Admin allowlist | `convex/_lib/feedbackAdmin.ts` |
| Pure helpers | `convex/_model/feedback.ts` |
| Web modal + pages | `apps/web/src/features/feedback/` |
