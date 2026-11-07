# Report and block for public content

**Date:** 2026-11-07
**Status:** Approved design
**Why:** App Store guideline 1.2 (user-generated content). Public notebooks and the public prompt
library show content made by other users. Apple requires a way to report it, a way to block
abusive users, timely action on reports, and terms that forbid objectionable content. Public
notebooks have none of these; the prompt library has Report only.

## Scope

- **In:** public notebooks (Public tab: Community grid and Featured shelf; the read-only viewer of
  someone else's notebook) and the public prompt library (`DiscoverStudioPromptsModal`).
- **Platforms:** web and the iOS app alike (the app loads the web routes).
- **Out:** an automated content filter at publish time; an admin report queue page (report emails
  do that job); hiding a blocked author's notebook when opened by direct link.

## Data model

New Convex module `convex/moderation/`.

| Table | Fields | Indexes |
| --- | --- | --- |
| `userBlocks` | `blockerId: Id<users>`, `blockedUserId: Id<users>`, `createdAt` | `by_blocker_and_blocked`, `by_blocked` |
| `notebookReports` | `notebookId`, `reporterUserId`, `reason` (enum), `note?: string` (≤ 500 chars), `createdAt` | `by_notebook_and_reporter`, `by_reporter` |
| `publishingBans` | `userId`, `bannedBy: Id<users>`, `createdAt` | `by_user` |

`reason` enum, shared by notebook and prompt reports: `spam`, `sexual`, `harassment`, `violence`,
`illegal`, `other`.

New optional fields on `notebooks`: `reportCount`, `lastReportedAt`, `moderationHold` (true once
the notebook is auto-unpublished for reports; blocks re-publishing until cleared in the dashboard).

`studioPromptReports.reason` stays `v.optional(v.string())`; the client now sends one of the enum
values, and the existing 500-char cap still applies.

All new fields and tables are optional or new, so no migration is needed.

## Backend

### Blocking (`convex/moderation/blocks.ts`)

- `blockUser({ userId })` — signed in; refuses blocking yourself; idempotent.
- `unblockUser({ userId })` — idempotent.
- `listBlocked()` — the caller's blocks with each user's display name (`name ?? "SolomindLM user"`),
  newest first. Bounded (`take(200)`).
- `blockedUserIds(ctx, viewerId)` — internal helper returning a `Set` of ids, read once per query.

### Notebook reports (`convex/moderation/reports.ts`)

- `reportNotebook({ notebookId, reason, note? })`
  - Signed in; the notebook must be public; you can't report your own; one report per user per
    notebook (`Already reported`).
  - Inserts the report, bumps `reportCount` and `lastReportedAt`.
  - At `NOTEBOOK_REPORT_AUTO_HIDE_THRESHOLD = 3`: unpublishes (`isPublic: false`,
    `isFeatured: false`, `publishedAt: undefined`) and sets `moderationHold: true`.
  - Schedules the admin email (below).
- `setPublic` refuses `isPublic: true` when the notebook has `moderationHold` or the owner has a
  publishing ban, with a user-facing `InputValidationError` that points to support.

### Prompt reports

- `reportPrompt` keeps its behaviour (auto-hide at 5) and also schedules the admin email.
- `publishPrompt` refuses when the owner has a publishing ban.

### Hiding from the viewer

`listPublic`, `listFeatured` and `listPublicPrompts` drop rows whose author the viewer blocked and
rows the viewer reported. They filter after `paginate`, so a page can come back short; the
paginated hooks already handle that. `listPublicPrompts` reads the viewer when signed in and keeps
working signed out (no filtering).

### Admin actions (`assertFeedbackAdmin`)

- `adminHidePrompt({ promptId })` — sets `status: "hidden"`.
- `adminBanPublisher({ userId })` — inserts a `publishingBans` row, then unpublishes every public
  notebook and prompt that user owns (bounded loop over `by_user` indexes).
- Existing `adminUnpublish` and `setFeatured` are unchanged.

### Report email (`convex/moderation/notify.ts`, `internalAction`)

- Sent through Resend (`RESEND_API_KEY`, from `AUTH_RESEND_FROM`) to `FEEDBACK_ADMIN_EMAILS`.
- Subject: `Report: <notebook|prompt> "<title>" (<reason>)`.
- Body: reason, note, report count, whether it was auto-hidden, and a link
  (`SITE_URL/notebook/<id>` for notebooks; the prompt id for prompts).
- Best-effort: a send failure is logged with `serviceLogger` and never fails the report.
  No email when `FEEDBACK_ADMIN_EMAILS` is empty.

### Account deletion

`convex/account/_purge.ts` removes the user's `userBlocks` (both directions), `notebookReports`
they filed and any `publishingBans` row. `deletion.test.ts` covers the new tables.

## Web UI

- **Report dialog** (`features/moderation/ReportDialog.tsx`): radio list of reasons, optional note,
  Submit. Used for notebooks and prompts. Success toast: "Thanks — we'll review it. You won't see
  it anymore."
- **Block confirm**: "Block <name>? You won't see their public notebooks or prompts. You can
  unblock them from Blocked users in the account menu."
- **Public notebook card** (`NotebookCard`, `variant="public"`, not your own): menu with
  Report notebook and Block author. Admins see these after Feature / Unpublish, plus
  Remove author from Public.
- **Notebook viewer header** (`access === "viewer"`): the same two items; blocking returns you to
  the Public tab.
- **Prompt library card**: Report keeps its place but opens the Report dialog; add Block author.
  Admins also get Hide prompt and Remove author from Public.
- **Account menu**: "Blocked users" opens a dialog listing blocks with Unblock buttons and an
  empty state.
- **Share dialog**: the Public option adds "Public notebooks must follow our Terms" with a link.

All primitives come from `shared/components/ui`; follow `docs/design/principles.md`.

## Terms of Service

New "Public content" section in `TermsOfService.tsx`:

- No tolerance for objectionable or abusive content (sexual content, harassment, hate, violence,
  illegal content, spam).
- Anyone can report public content or block its author from the content's menu.
- Reports are reviewed within 24 hours; content can be removed and accounts barred from
  publishing.
- Contact: support@solomindlm.com.

## Errors

Backend throws `InputValidationError` mapped with `toConvexError` for: self-block, self-report,
duplicate report, publishing while on hold or banned, note too long. The web shows them with
`parseServiceError`.

## Testing

- **Convex** (`convex/moderation/*.test.ts`, `notebooks/public.test.ts`,
  `studio/prompts/index.test.ts`): block/unblock idempotence and self-block refusal; list filtering
  for blocked authors and reported items; report dedupe, self-report refusal, hold at 3; publish
  refused on hold or ban; ban unpublishes notebooks and prompts; admin-only guards; the email
  action is scheduled; purge covers new tables.
- **Web** (vitest): card and header menus by role (viewer, owner, admin); Report dialog submits the
  chosen reason; Blocked users dialog lists and unblocks.
- **Notify action:** unit test with a mocked Resend client — skips with no admins, swallows send
  errors.

## Release

- No new env vars. The email reuses `RESEND_API_KEY`, `AUTH_RESEND_FROM` (sign-in codes),
  `FEEDBACK_ADMIN_EMAILS` and `SITE_URL`. Confirm all four are set on prod before resubmitting.
- App Review notes: describe Report and Block on public notebooks and prompts, and the 24-hour
  review commitment.
