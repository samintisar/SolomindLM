# Onboarding Flow — Design Spec

**Date:** 2026-04-28
**Status:** Approved (pending implementation plan)
**Owner:** @samintisar

## Goal

Introduce a first-run onboarding flow that orients new users to the four pillars of the app — notebooks, sources, chat, and Studio — without overwhelming them. Optimize for getting a brand-new user to one finished Studio artifact (their "aha" moment) on day one.

## Non-goals

- Tutorials for individual Studio tools (Audio Overview demo, Flashcard study mode, etc.)
- Sample/demo notebook auto-creation
- Mobile or native-shell tooltip support
- A/B testing of copy
- Analytics instrumentation (mutations are easy hook points; defer until needed)
- Re-onboarding existing users — they default to "completed" and never see the tour

## Approach summary

A combination of two complementary surfaces:

1. **Guided product tour** — auto-launches once on first sign-in. Five action-gated tooltip steps that walk the user from creating a notebook to generating their first Studio artifact. Each step advances when the user _does_ the action (not when they click Next). Skippable.
2. **Persistent checklist** — bottom-right card with the same five items. Ticks derive from real data, not from tour progress, so it's honest even if the user took the tour but actions didn't persist. Dismissible. Auto-hides when all five complete.

Tour completion ≠ checklist completion. The tour is ephemeral guidance; the checklist is the durable signal.

## Architecture

### Component hierarchy

```text
<App>
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <OnboardingProvider>          ← new, mounted above <Routes>
            <AppContent>
              <Header />
              <Routes>...</Routes>
              <TourTooltip />            ← new, portaled
              <ChecklistCard />          ← new, fixed bottom-right
            </AppContent>
          </OnboardingProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
</App>
```

### State machine

`tourStatus` transitions:

```text
pending ──startTour──▶ active ──advanceTourStep×5──▶ completed
   │                     │
   │                     └──skipTour──▶ skipped
   └────(none)
```

`completed` is also reached when the client (in `OnboardingProvider`) detects all five checklist booleans are `true` and calls `completeTour`. This is client-driven — Convex doesn't run code on row inserts to other tables.

### Action gating

The tour and checklist read different shapes from the same backend.

**Checklist** subscribes to `getChecklistProgress` — five booleans derived from app-wide row counts for the user (any notebook counts). This is the durable, honest "have you ever done this" view.

**Tour** subscribes to `getTourProgress` — five booleans gated against a single tracked notebook (`userOnboarding.tourNotebookId`). Steps 2, 3, and 5 (`addSource`, `askQuestion`, `generateArtifact`) check counts _for that notebook only_. This prevents a bug where a user creates a second notebook, adds a source there, and the tour wrongly advances past `addSource` for the original tour notebook.

When the boolean for `currentStepId` flips to `true` in `getTourProgress`, the provider calls `advanceTourStep` (which validates `expectedCurrentStepId` server-side) to move to the next step. The same shape includes a `tourNotebookId` field so the provider can navigate without a separate query.

**`openStudio` step:** `StudioPanel` already manages `isOpen` as React state. We lift that state to `OnboardingProvider` via a small subscription pattern (a context-exposed `notifyStudioOpen()` that `StudioPanel` calls inside the same `useEffect` that already runs when its open state flips true). On reload, the open state is reconstructed from URL/local panel state the same way it always is — no emitter, no replay needed. This makes the gate tolerant of reloads, resumed sessions, and multi-tab.

## Data model

### New table: `userOnboarding`

Sibling table (not a `users` table extension) because `@convex-dev/auth`'s `authTables` is library-managed.

```ts
userOnboarding: defineTable({
  userId: v.id("users"),
  tourStatus: v.union(
    v.literal("pending"),
    v.literal("active"),
    v.literal("skipped"),
    v.literal("completed"),
  ),
  currentStepId: v.optional(v.union(
    v.literal("createNotebook"),
    v.literal("addSource"),
    v.literal("askQuestion"),
    v.literal("openStudio"),
    v.literal("generateArtifact"),
  )),
  /** Notebook the tour is bound to. Set when `createNotebook` step advances. */
  tourNotebookId: v.optional(v.id("notebooks")),
  checklistDismissed: v.boolean(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
}).index("by_user", ["userId"]),
```

### Bootstrap: row creation at signup

The "no row" ambiguity is resolved by **eagerly creating a row at user creation time**, not lazily.

**Preferred path: signup hook.** `convex/auth.ts` is configured with the post-user-creation hook exposed by `@convex-dev/auth` (e.g. `createOrUpdateUser` callback or equivalent in the installed version) that inserts a `userOnboarding` row with `{ tourStatus: "pending", checklistDismissed: false }` immediately after the auth library creates the user. This is preferred over the client-side fallback because client-created bootstrap rows are race-prone and add a mount-time branch.

**Fallback path: client-side mount.** If the installed `@convex-dev/auth` version doesn't expose a usable post-create hook, the alternative is a `getOrCreateOnboardingRow` mutation called once from `OnboardingProvider`'s mount effect. In that case:

- The row is created with `tourStatus: "pending"` only when `users._creationTime > (now - FRESH_USER_WINDOW_MS)`, otherwise with `tourStatus: "completed"`.
- `FRESH_USER_WINDOW_MS` is a named constant (default: `5 * 60_000`) defined in `convex/onboarding/constants.ts`, with a code comment documenting the failure mode: a user who signs up but doesn't reach `/home` for >5 minutes (rare — would require closing the tab during signup) gets bucketed as "completed" and won't see the tour. The "Restart tour" menu item is the recovery path.

The implementation plan picks one of these two strategies after reading the installed auth library version.

**Legacy users (created before this feature):** a one-time backfill migration (using `@convex-dev/migrations`) iterates existing `users` and inserts rows with `{ tourStatus: "completed", checklistDismissed: true }`. After backfill, every user has a row; "no row" stops being a meaningful state for legacy users.

- **`getOnboardingState` query:** still returns a safe default for the brief window where a row might not yet exist (e.g. backfill running, or new user mid-signup), but the default is now contextual:
  - If `users._creationTime > (now - 5 minutes)` → return `{ tourStatus: "pending", checklistDismissed: false }` (treat as fresh signup; provider will create the row on next mutation).
  - Otherwise → return `{ tourStatus: "completed", checklistDismissed: true }` (legacy fallback).

This eliminates the contradiction where "no row" simultaneously meant "new user" and "completed."

### No derived flags persisted

Booleans like `hasCreatedNotebook` are inferable from existing tables (`notebooks` count, `documents` count, `messages` count, etc.). Persisting them would duplicate truth. The checklist UI runs `getChecklistProgress`, which returns counts → booleans on each query.

### Convex functions (`convex/onboarding/index.ts`)

| Name                   | Type     | Purpose                                                                                                                                                                                                                                                                                              |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOnboardingState`   | query    | Returns the user's row or the contextual default (see Bootstrap)                                                                                                                                                                                                                                     |
| `getChecklistProgress` | query    | Returns five booleans derived from app-wide row counts for the calling user (any notebook)                                                                                                                                                                                                           |
| `getTourProgress`      | query    | Returns `{ tourNotebookId, createNotebook, addSource, askQuestion, openStudio, generateArtifact }` where steps 2/3/5 are scoped to `tourNotebookId` only. `openStudio` is always `false` server-side; the provider overlays its in-memory open state.                                                |
| `startTour`            | mutation | Upserts row to `tourStatus: "active"`, `currentStepId: "createNotebook"`, `startedAt: Date.now()` only when current status is `pending`. No-op if existing status is `active`, `completed`, or `skipped`. Reopening a `completed`/`skipped` flow is exclusively the responsibility of `restartTour`. |
| `advanceTourStep`      | mutation | Args: `expectedCurrentStepId`, optional `tourNotebookId` (passed when advancing from `createNotebook`). Rejects if `expectedCurrentStepId` mismatch. Advances to next step or sets `completed` if last                                                                                               |
| `skipTour`             | mutation | Sets `tourStatus: "skipped"`, leaves `checklistDismissed` and `tourNotebookId` alone                                                                                                                                                                                                                 |
| `completeTour`         | mutation | Sets `tourStatus: "completed"`, `completedAt`. Called by the client when all checklist items true (see Edge cases for why client-driven)                                                                                                                                                             |
| `dismissChecklist`     | mutation | Sets `checklistDismissed: true`                                                                                                                                                                                                                                                                      |
| `restartTour`          | mutation | Sets `tourStatus: "active"`, `currentStepId: "createNotebook"`, clears `tourNotebookId`, sets new `startedAt`. Deterministic — no `pending` round-trip. Triggered from avatar dropdown                                                                                                               |

All mutations require an authenticated user. `getChecklistProgress` filters all counts by the calling user's `userId`.

## Tour engine

### Step definitions (`apps/web/src/features/onboarding/steps.ts`)

All "for this notebook" gates below are scoped to `userOnboarding.tourNotebookId`, not global counts.

| id                 | route                       | target selector                              | copy                                                                                            | advance gate                                                                                                                                                                                                                                             |
| ------------------ | --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createNotebook`   | `/home`                     | `[data-onboarding="create-notebook-button"]` | "Notebooks are where your sources, chats, and study tools live. Create your first one."         | latest-created notebook for the user appears since tour started → call `advanceTourStep({ expectedCurrentStepId: "createNotebook", tourNotebookId: <newId> })` → server stores `tourNotebookId` → provider auto-navigates to `/notebook/:tourNotebookId` |
| `addSource`        | `/notebook/:tourNotebookId` | `[data-onboarding="add-source-button"]`      | "Add a PDF, URL, YouTube link, or pasted text. This is the knowledge your AI will work from."   | `documents` where `notebookId === tourNotebookId` `.length >= 1`                                                                                                                                                                                         |
| `askQuestion`      | `/notebook/:tourNotebookId` | `[data-onboarding="chat-input"]`             | "Ask anything about your sources. Answers come with citations."                                 | `messages` where `notebookId === tourNotebookId` `.length >= 1`                                                                                                                                                                                          |
| `openStudio`       | `/notebook/:tourNotebookId` | `[data-onboarding="studio-panel-toggle"]`    | "Studio turns your sources into reports, flashcards, quizzes, mind maps, audio, and more."      | `OnboardingProvider` reads StudioPanel's open state via context (lifted from `StudioPanel`) — survives reload because open state is reconstructed from existing UI state on mount, not from a one-shot emitter                                           |
| `generateArtifact` | `/notebook/:tourNotebookId` | `[data-onboarding="studio-tool-grid"]`       | "Pick any tool and generate your first artifact. We recommend a Report or Flashcards to start." | any of `reports`, `flashcards`, `quizzes`, `mindmaps`, `audioOverviews`, `slides`, `spreadsheets`, `writtenQuestions` where `notebookId === tourNotebookId` `.length >= 1`                                                                               |

### Tooltip rendering

Custom-built (no driver.js / shepherd dependency).

1. `useEffect` reads `document.querySelector(step.targetSelector).getBoundingClientRect()`
2. Portaled `<div>` positions itself adjacent (preferred side per step)
3. Translucent fixed overlay with a punched-out hole over the target (CSS clip-path)
4. Re-measures on:
   - `window.resize`
   - `scroll` events (capture-phase, on `window` and the nearest scrollable ancestor — panels in `NotebookView` scroll independently)
   - `MutationObserver` on the target's parent subtree
   - `requestAnimationFrame` loop while a tooltip is mounted, throttled to ~10fps, as a backstop for layout shifts not caught by the above (cheap; only runs during the tour)
5. If selector returns null, hide silently — wait for it to appear (e.g. user navigates to wrong route)

**Dev-only invariant:** in development builds, on each step transition, query the DOM for the target selector. If zero matches, log a console error with the step id; if more than one match, log a console error listing every matching element. Production silently no-ops as before — silent failure is correct UX in prod, but bad for implementation debugging.

Each tooltip shows: copy + step counter ("3 of 5") + "Skip tour" link. No "Next" button — advance is action-gated only.

### Auto-launch

In `OnboardingProvider`, on first render where `isAuthenticated && onboardingState.tourStatus === "pending"`, call `startTour`. Triggers once per account.

### Cross-route continuity

`OnboardingProvider` sits above `<Routes>`, so state survives navigation. After `createNotebook` advances, the provider reads `tourNotebookId` from `getTourProgress` and calls `navigate('/notebook/:tourNotebookId')` so step 2 finds its target. On any later mount (e.g. user reloaded mid-tour), if `currentStepId` is one of `addSource`/`askQuestion`/`openStudio`/`generateArtifact` and the URL is not already on `/notebook/:tourNotebookId`, the provider navigates there once.

### Skip behavior

Soft skip: tooltip unmounts, dim overlay clears, but `<ChecklistCard />` remains. User can finish the items in any order.

## Checklist widget

### Visibility

Show iff:

- `tourStatus !== "completed"`
- `checklistDismissed === false`
- not all five progress booleans are `true`
- current route is `/home` or `/notebook/:id`

When all five flip to true, the client calls `completeTour` and the card animates out.

### Behavior

- **Position:** fixed bottom-right, `z-40` (under modals, over content)
- **Collapsed pill:** "3 of 5 complete" — expands on click. Collapse state in localStorage (UI-only, no server round-trip)
- **Expanded:** five items, each with tick/empty circle, label, and a "Do it" link that navigates to the right surface (e.g. `addSource` link navigates to most recent notebook and opens AddSourceModal)
- **Dismiss:** `×` button → `dismissChecklist` mutation. Card never returns unless user clicks "Show getting-started checklist" in avatar dropdown
- **Restart tour** in avatar dropdown: calls `restartTour` mutation

### Mobile / native shell

Tour disabled when `isNativeShell()` is true (tooltip positioning is fragile). Checklist still renders — it's just a fixed-position card with no DOM-targeting requirements, so it works on every viewport. (This is the canonical statement; the visibility list above intentionally omits a native-shell exclusion.)

## Edge cases

| Case                                                                          | Handling                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User signs out mid-tour                                                       | State is server-side; resumes at `currentStepId` on next login                                                                                                                                                                                                                                                                                                                              |
| User deletes `tourNotebookId` mid-tour                                        | Provider detects `notebooks.find(n => n.id === tourNotebookId)` is undefined → calls `restartTour` → user re-enters at step 1. Their checklist progress (global) is unaffected if they had created sources/messages in other notebooks.                                                                                                                                                     |
| Legacy user with zero notebooks                                               | Backfill assigned `tourStatus: "completed"`. They never see the tour. They can opt in via "Restart tour" in the avatar dropdown.                                                                                                                                                                                                                                                            |
| User on mobile / native shell                                                 | Tour disabled; checklist still shows                                                                                                                                                                                                                                                                                                                                                        |
| User deletes `data-onboarding` attribute via DevTools                         | Tooltip hides silently per missing-target rule; advances when underlying action completes                                                                                                                                                                                                                                                                                                   |
| Two tabs open                                                                 | Convex queries are reactive; second tab updates naturally. The dev-only duplicate-selector invariant still passes because each tab queries its own DOM.                                                                                                                                                                                                                                     |
| Studio Panel target hidden behind closed panel                                | `openStudio` step exists specifically to open it; no earlier step targets anything inside Studio                                                                                                                                                                                                                                                                                            |
| Stale client calls `advanceTourStep` with wrong `expectedCurrentStepId`       | Mutation rejects; client re-syncs from query                                                                                                                                                                                                                                                                                                                                                |
| All five checklist items become true (e.g. user already had data from before) | Client (in `OnboardingProvider`) detects all-true and calls `completeTour`. Note: this is client-driven, not a server-side trigger — Convex doesn't run code on row inserts to other tables. The trade-off is that a user who never opens the app after their data hits 5/5 won't have `tourStatus` flipped to `completed`. Acceptable; checklist hides via the visibility rule regardless. |

## File touch list

### New

- `convex/onboarding/index.ts` — 3 queries (`getOnboardingState`, `getChecklistProgress`, `getTourProgress`) + 7 mutations (`startTour`, `advanceTourStep`, `skipTour`, `completeTour`, `dismissChecklist`, `restartTour`, `getOrCreateOnboardingRow` if fallback path used)
- `convex/onboarding/constants.ts` — `FRESH_USER_WINDOW_MS` and related constants (only if fallback path used)
- `convex/onboarding/index.test.ts` — backend tests (see Testing)
- `convex/migrations.ts` (or extend if exists) — one-time backfill marking pre-existing users as `isLegacyUser: true`, `tourStatus: "completed"`
- `apps/web/src/features/onboarding/OnboardingProvider.tsx`
- `apps/web/src/features/onboarding/useOnboarding.ts`
- `apps/web/src/features/onboarding/steps.ts`
- `apps/web/src/features/onboarding/components/TourTooltip.tsx`
- `apps/web/src/features/onboarding/components/ChecklistCard.tsx`
- `apps/web/src/features/onboarding/components/ChecklistItem.tsx`
- `apps/web/src/features/onboarding/hooks/useChecklistProgress.ts`
- `apps/web/src/features/onboarding/hooks/useTourProgress.ts`
- Test files colocated with each frontend module (see Testing)

(No `onboardingEvents.ts` — replaced by lifting StudioPanel's open state into provider context.)

### Edited

- `convex/schema.ts` — add `userOnboarding` table
- `apps/web/src/App.tsx` — wrap children in `<OnboardingProvider>`; mount `<TourTooltip />` and `<ChecklistCard />` once at top level
- `apps/web/src/features/notebooks/components/views/RecentSection.tsx` (or wherever the "Create notebook" CTA lives) — add `data-onboarding="create-notebook-button"`
- `apps/web/src/features/sources/components/SourcesPanelHeader.tsx` — add `data-onboarding="add-source-button"`
- `apps/web/src/features/chat/components/ChatInput.tsx` — add `data-onboarding="chat-input"`
- `apps/web/src/features/studio/components/StudioPanel.tsx` — add `data-onboarding="studio-panel-toggle"`; expose `isOpen` to `OnboardingProvider` via context (no event emitter)
- `convex/auth.ts` — wire post-user-creation hook to insert default `userOnboarding` row (or document fallback to `getOrCreateOnboardingRow` if hook unavailable in installed auth version)
- `apps/web/src/features/studio/components/ToolGrid.tsx` — add `data-onboarding="studio-tool-grid"`
- `apps/web/src/features/auth/components/AvatarDropdown.tsx` — add "Restart tour" + "Show checklist" menu items

## Testing

Repo has no formal test runner configured yet, but `apps/web/src/features/studio/components/SaveAsPromptModal.test.tsx` exists as a Vitest precedent. Match that pattern (Vitest + React Testing Library) for the web; use `convex-test` for backend. The implementation plan installs missing devDependencies if needed.

### Backend (`convex/onboarding/index.test.ts`)

| Test                                                  | Asserts                                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `getOnboardingState` contextual default — fresh user  | No row + `users._creationTime > now - FRESH_USER_WINDOW_MS` → returns `{ tourStatus: "pending", checklistDismissed: false }`     |
| `getOnboardingState` contextual default — legacy user | No row + old `_creationTime` → returns `{ tourStatus: "completed", checklistDismissed: true }`                                   |
| `startTour` happy path                                | Sets `pending → active`, `currentStepId: "createNotebook"`, sets `startedAt`                                                     |
| `startTour` only acts on `pending`                    | No-op when status is `active`, `completed`, or `skipped` (reopening flows is `restartTour`'s job)                                |
| `advanceTourStep` linear walk                         | Walks all five steps; final advance sets `completed` and `completedAt`                                                           |
| `advanceTourStep` stale-client rejection              | Throws when `expectedCurrentStepId` doesn't match server state                                                                   |
| `skipTour`                                            | Sets `tourStatus: "skipped"`, leaves `checklistDismissed` unchanged                                                              |
| `dismissChecklist` independence                       | Sets only `checklistDismissed: true`; tour status unaffected                                                                     |
| `getChecklistProgress` derivation                     | Insert notebook → `createNotebook: true`. Insert document → `addSource: true`. Etc.                                              |
| `getChecklistProgress` auth scope                     | User A's data does not tick User B's checklist                                                                                   |
| `getTourProgress` is notebook-scoped                  | Document inserted into a notebook other than `tourNotebookId` does not flip `addSource`. Same for messages and Studio artifacts. |
| `getTourProgress` returns `tourNotebookId`            | Provider can navigate without a separate query                                                                                   |
| `restartTour` is deterministic                        | Sets `active` directly with `currentStepId: "createNotebook"`; no `pending` round-trip; clears `tourNotebookId`                  |
| Backfill migration                                    | After running, all existing users have a row with `tourStatus: "completed"`, `checklistDismissed: true`                          |
| All mutations require auth                            | Unauthenticated calls throw                                                                                                      |

### Frontend unit (Vitest + RTL)

- `OnboardingProvider.test.tsx` — auto-launch fires when `pending`, not when `skipped`/`completed`; advances `currentStepId` when gating boolean flips; `skipTour` clears tooltip but keeps checklist.
- `TourTooltip.test.tsx` — renders against targeted `data-onboarding` selector; hides silently when target missing; re-measures on resize; "Skip" calls `skipTour`.
- `ChecklistCard.test.tsx` — renders five items with correct ticks; collapse toggle works; dismiss calls mutation; auto-hides when all five true; mounts only on `/home` and `/notebook/:id`.
- `steps.test.ts` — pure data: documented order; every step has a target selector and a gate field.

### Integration

- `OnboardingFlow.integration.test.tsx` — render `<App>` with mocked Convex client; simulate fresh user; drive five actions; assert tooltip walks all five steps and checklist hits 5/5.

### Excluded

- Real keyboard nav, animations, exact pixel positioning. Manual smoke handles these.

## Open questions

Resolved by implementation plan, not blocking design:

- Whether `@convex-dev/auth` (installed version) exposes a post-user-creation hook. If yes, wire bootstrap there. If no, use `getOrCreateOnboardingRow` mutation called from `OnboardingProvider`'s mount, with the contextual default in `getOnboardingState` covering the brief gap.
- Exact component for the "Create notebook" CTA selector (likely in `views/RecentSection.tsx` or `HomePage.tsx` — confirmed by reading during implementation).
- Whether `StudioPanel` already exposes its `isOpen` state to a parent (likely needs lifting into a small context the provider can read).

## Approval log

- 2026-04-28 — Architecture approved
- 2026-04-28 — Data model approved
- 2026-04-28 — Tour engine + steps approved
- 2026-04-28 — Checklist + edge cases + file list approved
- 2026-04-28 — Testing approach approved
- 2026-04-28 — Revised after first review:
  - Added `tourNotebookId` (and initially `isLegacyUser`) to `userOnboarding`
  - Split progress into `getChecklistProgress` (global) and `getTourProgress` (notebook-scoped)
  - Replaced "no row = completed" default with bootstrap-at-signup + contextual default + legacy backfill migration
  - Made `restartTour` deterministic (sets `active` directly, no `pending`)
  - Replaced in-memory `studioOpened` emitter with lifted StudioPanel state via context
  - Added scroll-aware tooltip remeasurement and rAF backstop
  - Added dev-only invariant for missing/duplicate `data-onboarding` selectors
  - Documented that `completeTour` is client-driven and noted the trade-off
- 2026-04-28 — Final tweaks after second review:
  - Removed `isLegacyUser` field (redundant with backfill + eager creation)
  - Marked signup hook as the preferred bootstrap path; client fallback only if hook unavailable
  - Extracted `FRESH_USER_WINDOW_MS` to a named constant in `convex/onboarding/constants.ts`
  - Constrained `startTour` to act only when status is `pending`; reopening completed/skipped flows is exclusively `restartTour`'s job
  - Resolved the visibility-rule conflict on native shell (tour disabled, checklist still renders)
  - Made client-driven wording for `completeTour` consistent throughout
  - Updated `getOnboardingState` tests to cover both contextual defaults instead of the old single default
