# Public notebooks

Date: 2026-10-14
Status: approved in conversation, pending spec review

## Goal

Let any user publish a notebook so every signed-in user can open it, read it, chat with it, practise
with its studio items, and fork it. Replace the unused "Featured" home tab with a "Public" tab that
leads with a curated shelf. Seed a set of showcase notebooks that demonstrate what the app does.

## Today

- `notebooks.isFeatured` is a per-owner flag. No UI sets it; the home "Featured" tab filters the
  user's *own* notebooks by it (`AppShell.tsx`). Nobody else can see them.
- Access is `owner | editor` (`convex/_lib/notebookAccess.ts`). There is no read-only role and no
  read-only UI.
- Chat conversations are effectively per notebook: `ensureConversation` reuses the notebook's most
  recent conversation regardless of who created it.
- Flashcard reviews, quiz answers and written-answer drafts/grades are written onto the shared
  studio row (`cardsData` / `questionsData`).
- `performNotebookFork` already deep-copies a notebook (sources, chunks, studio items, manual notes).

## Decisions

| Question | Decision |
| --- | --- |
| What can a viewer do? | Read sources and studio items, chat privately, practise with saved per-viewer progress, fork. No source or studio edits. |
| Who sees a published notebook? | Every signed-in user, immediately. Owner can unpublish. |
| Curation | Admins (existing `FEEDBACK_ADMIN_EMAILS` allowlist) mark public notebooks as featured; featured ones show on a shelf above the community grid. Admins can unpublish any notebook. |
| Showcase owner | The maintainer's own account, passed to the seed by email (never hard-coded). |
| How showcase content is made | A checked-in manifest + internal action, run on dev first, then prod after PRs 1–2 ship. |

## Delivery: three PRs

### PR 1 — Public notebooks core

**Schema** (widen only; all fields optional):

- `notebooks.isPublic?: boolean`, `notebooks.publishedAt?: number`.
- Index `by_isPublic_and_publishedAt` for the Public tab.
- `notebooks.isFeatured` changes meaning: admin-curated, honoured only when `isPublic` is true.
  Before merging, confirm no prod rows have `isFeatured: true` (no UI ever set it); clear any that do.
  `notebooks.create` / `notebooks.update` stop accepting `isFeatured`.
- `conversations.isPrivate?: boolean` — set on conversations a viewer starts.

**Access** (`convex/_lib/notebookAccess.ts`):

- `NotebookAccessRole = "owner" | "editor" | "viewer"`. `getNotebookAccess` returns `"viewer"` for
  any signed-in user who is neither owner nor member when the notebook is public.
- All read sites that go through `canReadNotebook` / `assertCanReadNotebook` open for viewers
  automatically. `assertCanEditNotebook` rejects `"viewer"` (it already requires owner/editor).
- Sites that write after only a read check are handled one by one:
  - Chat send / optimistic send / stream (`http.ts /chat/stream`) / release / voice transcription:
    viewers may call them, but only against a conversation they own (see Chat).
  - `ensureConversation` and `createConversation`: for viewers, find or create *their* private
    conversation.
  - `clearHistory`: viewers clear only their own conversations.
  - Source-guide generation: allowed for viewers (it is a derived cache on the shared document row).
  - `notebooks.get` DTO: return `access` explicitly instead of inferring `isSharedNotebook` from
    `access === "editor"`.
- Practice mutations (flashcard review, quiz answer, written-answer draft/grade) stay edit-only in
  PR 1; PR 2 opens them to viewers.

**Chat:**

- Viewers see only conversations where `userId` is theirs. Owners and editors see every
  conversation *except* private ones (`isPrivate: true`).
- Chat usage counts against the chatting user's limit (already true).
- Retrieval needs no change: vector search filters by notebook/document only.

**Queries / mutations** (`convex/notebooks/public.ts`):

- `setPublic({ notebookId, isPublic })` — owner only; sets/clears `publishedAt`.
- `listPublic({ paginationOpts })` — public notebooks newest-published first, with author display
  name and source count. Signed-in only.
- `listFeatured()` — public + featured, small bounded list.
- `setFeatured({ notebookId, isFeatured })`, `adminUnpublish({ notebookId })` — admin only.
- `forkPublic({ notebookId })` — notebook must be public; applies `checkNotebookLimit` and the
  `notebookFork` rate limit; calls `performNotebookFork`.
- `performNotebookFork` today skips literature tables, literature reports and deep-research
  results (`literatureTables`, `literatureReports`, `researchPlans` / `researchRuns` and their
  children). Extend it to copy completed ones, remapping document ids, so a forked research
  notebook keeps its outputs. In-progress review sessions and workflow state are not copied.

**Web:**

- Home tabs become `All · My notebooks · Public`. `FeaturedSection` becomes `PublicSection`:
  "Featured" shelf (curated) then "Community" grid. On *All*, show the Featured shelf only.
  Cards show a "Public" badge, author and source count; no actions menu for others' notebooks.
- Owner's own published notebooks show a "Public" badge in *My notebooks*.
- Share dialog gets a "Make public" switch with a one-line explanation of who can see it.
- Notebook page for a viewer: header shows "Public · by {author}" and a **Fork** button; sources,
  studio and settings controls that edit are hidden; chat works. `activeNotebook` must load from
  `notebooks.get` when the notebook isn't in the user's list.
- Admins see "Feature" / "Unfeature" / "Unpublish" on public cards.
- Rename everywhere: `featuredNotebooks` → `publicNotebooks`, `FeaturedSection` → `PublicSection`,
  `HomeTab "featured"` → `"public"`.

**Tests:** access-role unit tests (owner/editor/viewer/stranger × public/private), chat privacy
(viewer conversations hidden from owner and vice versa), `forkPublic` rejects private notebooks,
`setFeatured` rejects non-admins, `listPublic` excludes private notebooks. Component tests for
`PublicSection` and the card badge. E2E: publish → second user sees it in Public → opens → forks.

### PR 2 — Per-viewer studio progress

- New table `studioProgress { userId, itemType: "flashcards" | "quizzes" | "writtenQuestions",
  itemId: string, notebookId, progress: any, updatedAt }`, index `by_user_and_item`.
  `progress` mirrors the per-entry fields each type stores today (flashcard SRS state; quiz
  selected answer/correctness; written answer draft, grade and feedback), keyed by entry index.
- When the caller's access is `"viewer"`, the practice mutations write to `studioProgress` instead
  of the shared row, and the studio `get`/`list` queries overlay the viewer's progress onto the
  entries. Owner/editor behaviour is unchanged.
- Written-answer AI grading counts against the viewer's own grading limit.
- Deleting a notebook deletes its `studioProgress` rows; forking does not copy them.
- Tests: viewer progress never touches the shared row; overlay returns the viewer's state; two
  viewers don't see each other's progress; owner unaffected.

### PR 3 — Showcase notebooks seed

- `convex/showcase/manifest.ts`: typed list of notebooks → sources → studio items.
- `convex/showcase/seed.ts`: internal action `seedShowcase({ ownerEmail, slug? })`. Per notebook it
  creates the notebook (idempotent by title + owner), inserts sources and schedules
  `docEmbedding`, waits for ingestion, then starts each studio job through the internal row
  creators (the same path `convex/eval/studioEvalAction.ts` uses), then sets `isPublic` and
  `isFeatured`. Re-running skips what already exists.
- File sources (e.g. Project Gutenberg text, PDFs) are fetched by the action and stored with
  `ctx.storage.store`.
- Literature review and deep research run through their durable workflows; the seed approves the
  workflow's plan/screening pause itself (as the owner would in the UI). Their outputs are tied to
  the owner's chat thread, which viewers can't see, so the seed also saves the final table/report
  as Studio items (no `literatureReviewSessionId`) so viewers and forks get them.
- **Sources are publicly readable by viewers, so publishing a notebook republishes its sources.**
  The showcase only uses openly licensed or public-domain material: OpenStax (CC BY), arXiv papers
  with a CC BY licence, U.S. government reports and SEC filings, MIT OpenCourseWare videos. Papers
  found through discovery stay metadata + abstract unless their full text is openly licensed.
  Exact URLs are chosen and checked to ingest during implementation.
- Run on dev, review every notebook in the app, then run on prod.

Each notebook is built like a real user's working notebook for one of the app's audiences, and
together they cover every studio type plus literature review and deep research:

| Notebook | Audience | Sources | Outputs |
| --- | --- | --- | --- |
| ECON 101 · Midterm Prep | Students | OpenStax *Principles of Economics* chapters, MIT OCW lecture videos | ~60-card spaced-repetition deck, quiz, mind map, audio recap; Learning Guide chat mode |
| Pharmacology Essentials | Med / nursing students | OpenStax *Pharmacology*, NIH MedlinePlus drug pages | Large flashcard deck, short-answer written questions, ~8-min brief audio |
| Literature Review: Does Spaced Repetition Work? | Grad students / researchers | Papers added through academic discovery | Screened paper set, literature table, review draft (APA 7), deep-research report |
| LLM Hallucinations: Paper Digest | ML researchers | CC BY arXiv papers | Literature table comparing methods, critique audio, report |
| Home Battery Storage · Market Scan | Analysts / founders | U.S. DOE and NREL reports, EIA data pages | Briefing doc, market spreadsheet, infographic |
| Reading a 10-K | Business / finance | One public SEC 10-K filing | Financials spreadsheet, briefing doc, quiz |
| Getting Started with SolomindLM | New users | Text guide to the app | One of each studio type |

Prompt rules from AGENTS.md apply: the seed passes ordinary user-style options (type, count,
focus); no generation prompt is changed for the showcase.

## Out of scope

Signed-out access and SEO pages for public notebooks, abuse reports, likes/view counts, search
within the Public tab, per-viewer chat settings.

## Risks

- **Read paths that assume owner/editor.** Mitigation: the role is added in one function and every
  read-then-write site is listed above; a test asserts viewers can't reach any edit mutation used
  by the web app.
- **Cost of viewer chat on popular notebooks.** Viewer chat uses the viewer's own limits.
- **Seed cost.** About 30 studio jobs (7 audio overviews), 1 literature review and 1 deep-research
  run on each of dev and prod. Run once per deployment; the seed is idempotent.
