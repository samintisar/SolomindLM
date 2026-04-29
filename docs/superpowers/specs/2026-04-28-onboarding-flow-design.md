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

1. **Guided product tour** — auto-launches once on first sign-in. Five action-gated tooltip steps that walk the user from creating a notebook to generating their first Studio artifact. Each step advances when the user *does* the action (not when they click Next). Skippable.
2. **Persistent checklist** — bottom-right card with the same five items. Ticks derive from real data, not from tour progress, so it's honest even if the user took the tour but actions didn't persist. Dismissible. Auto-hides when all five complete.

Tour completion ≠ checklist completion. The tour is ephemeral guidance; the checklist is the durable signal.

## Architecture

### Component hierarchy

```
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

```
pending ──startTour──▶ active ──advanceTourStep×5──▶ completed
   │                     │
   │                     └──skipTour──▶ skipped
   └────(none)
```

`completed` is also reached automatically when all five checklist booleans become `true`, even if the user skipped the tour.

### Action gating

`OnboardingProvider` subscribes to a single Convex query (`getChecklistProgress`) that returns five booleans derived from row counts. When the boolean for `currentStepId` flips to `true`, the provider calls `advanceTourStep` to move to the next step. The same query feeds the checklist UI — single source of truth.

For `openStudio` (no Convex side-effect — just a UI panel toggle), `StudioPanel` emits an event via a small in-memory `onboardingEvents` emitter. This is the only step that bypasses the data-derived gate.

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
  checklistDismissed: v.boolean(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
}).index("by_user", ["userId"]),
```

### Default for users without a row

`getOnboardingState` returns `{ tourStatus: "completed", checklistDismissed: true }` for any user without a row. Existing accounts (founder + beta users) thus never see the tour. A row is created lazily by `startTour`, which only fires for users with `tourStatus: "pending"` after a fresh sign-up.

### No derived flags persisted

Booleans like `hasCreatedNotebook` are inferable from existing tables (`notebooks` count, `documents` count, `messages` count, etc.). Persisting them would duplicate truth. The checklist UI runs `getChecklistProgress`, which returns counts → booleans on each query.

### Convex functions (`convex/onboarding/index.ts`)

| Name | Type | Purpose |
|---|---|---|
| `getOnboardingState` | query | Returns the user's row or the default |
| `getChecklistProgress` | query | Returns `{ createNotebook, addSource, askQuestion, openStudio, generateArtifact }` derived from row counts (auth-scoped) |
| `startTour` | mutation | Creates row with `tourStatus: "active"`, `currentStepId: "createNotebook"`, `startedAt: Date.now()`. Idempotent: no-op if existing status is `completed` or `skipped` |
| `advanceTourStep` | mutation | Args: `expectedCurrentStepId`. Rejects if mismatch (prevents stale-client races). Advances to next step or sets `completed` if last |
| `skipTour` | mutation | Sets `tourStatus: "skipped"`, leaves `checklistDismissed` alone |
| `completeTour` | mutation | Sets `tourStatus: "completed"`, `completedAt`. Called automatically when all checklist items true |
| `dismissChecklist` | mutation | Sets `checklistDismissed: true` |
| `restartTour` | mutation | Resets `tourStatus: "pending"`, clears `currentStepId`. Triggered from avatar dropdown |

All mutations require an authenticated user. `getChecklistProgress` filters all counts by the calling user's `userId`.

## Tour engine

### Step definitions (`apps/web/src/features/onboarding/steps.ts`)

| id | route | target selector | copy | advance gate |
|---|---|---|---|---|
| `createNotebook` | `/home` | `[data-onboarding="create-notebook-button"]` | "Notebooks are where your sources, chats, and study tools live. Create your first one." | `notebooks.length >= 1` → auto-navigate to `/notebook/:newId` |
| `addSource` | `/notebook/:id` | `[data-onboarding="add-source-button"]` | "Add a PDF, URL, YouTube link, or pasted text. This is the knowledge your AI will work from." | `documents` for this notebook `.length >= 1` |
| `askQuestion` | `/notebook/:id` | `[data-onboarding="chat-input"]` | "Ask anything about your sources. Answers come with citations." | `messages` for this notebook `.length >= 1` |
| `openStudio` | `/notebook/:id` | `[data-onboarding="studio-panel-toggle"]` | "Studio turns your sources into reports, flashcards, quizzes, mind maps, audio, and more." | `onboardingEvents.emit('studioOpened')` from `StudioPanel` |
| `generateArtifact` | `/notebook/:id` | `[data-onboarding="studio-tool-grid"]` | "Pick any tool and generate your first artifact. We recommend a Report or Flashcards to start." | any of `reports`, `flashcards`, `quizzes`, `mindmaps`, `audioOverviews`, `slides`, `spreadsheets`, `writtenQuestions` for this notebook `.length >= 1` |

### Tooltip rendering

Custom-built (no driver.js / shepherd dependency).

1. `useEffect` reads `document.querySelector(step.targetSelector).getBoundingClientRect()`
2. Portaled `<div>` positions itself adjacent (preferred side per step)
3. Translucent fixed overlay with a punched-out hole over the target (CSS clip-path)
4. Re-measures on `window.resize` and via `MutationObserver` on the target's parent
5. If selector returns null, hide silently — wait for it to appear (e.g. user navigates to wrong route)

Each tooltip shows: copy + step counter ("3 of 5") + "Skip tour" link. No "Next" button — advance is action-gated only.

### Auto-launch

In `OnboardingProvider`, on first render where `isAuthenticated && onboardingState.tourStatus === "pending"`, call `startTour`. Triggers once per account.

### Cross-route continuity

`OnboardingProvider` sits above `<Routes>`, so state survives navigation. After `createNotebook` advances, the provider calls `navigate('/notebook/:newId')` so step 2 finds its target.

### Skip behavior

Soft skip: tooltip unmounts, dim overlay clears, but `<ChecklistCard />` remains. User can finish the items in any order.

## Checklist widget

### Visibility

Show iff:
- `tourStatus !== "completed"`
- `checklistDismissed === false`
- not all five progress booleans are `true`
- current route is `/home` or `/notebook/:id`
- not running in native shell (`isNativeShell()` false)

When all five flip to true, `completeTour` mutation runs server-side and the card animates out.

### Behavior

- **Position:** fixed bottom-right, `z-40` (under modals, over content)
- **Collapsed pill:** "3 of 5 complete" — expands on click. Collapse state in localStorage (UI-only, no server round-trip)
- **Expanded:** five items, each with tick/empty circle, label, and a "Do it" link that navigates to the right surface (e.g. `addSource` link navigates to most recent notebook and opens AddSourceModal)
- **Dismiss:** `×` button → `dismissChecklist` mutation. Card never returns unless user clicks "Show getting-started checklist" in avatar dropdown
- **Restart tour** in avatar dropdown: calls `restartTour` mutation

### Mobile / native shell

Tour disabled when `isNativeShell()` is true (tooltip positioning is fragile). Checklist still renders.

## Edge cases

| Case | Handling |
|---|---|
| User signs out mid-tour | State is server-side; resumes at `currentStepId` on next login |
| User deletes the tour's target notebook | Provider routes back to `/home`, resets `currentStepId` to whichever step is consistent with current counts |
| Existing user with zero notebooks | No `userOnboarding` row → default `tourStatus: "completed"` → no tour. Acceptable. |
| User on mobile / native shell | Tour disabled; checklist still shows |
| User deletes `data-onboarding` attribute via DevTools | Tooltip hides silently per missing-target rule; advances when underlying action completes |
| Two tabs open | Convex queries are reactive; second tab updates naturally |
| Studio Panel target hidden behind closed panel | `openStudio` step exists specifically to open it; no earlier step targets anything inside Studio |
| Stale client calls `advanceTourStep` with wrong `expectedCurrentStepId` | Mutation rejects; client re-syncs from query |

## File touch list

### New

- `convex/onboarding/index.ts` — 2 queries + 6 mutations
- `convex/onboarding/index.test.ts` — backend tests (see Testing)
- `apps/web/src/features/onboarding/OnboardingProvider.tsx`
- `apps/web/src/features/onboarding/useOnboarding.ts`
- `apps/web/src/features/onboarding/steps.ts`
- `apps/web/src/features/onboarding/onboardingEvents.ts` — small in-memory emitter for `studioOpened`
- `apps/web/src/features/onboarding/components/TourTooltip.tsx`
- `apps/web/src/features/onboarding/components/ChecklistCard.tsx`
- `apps/web/src/features/onboarding/components/ChecklistItem.tsx`
- `apps/web/src/features/onboarding/hooks/useChecklistProgress.ts`
- Test files colocated with each frontend module (see Testing)

### Edited

- `convex/schema.ts` — add `userOnboarding` table
- `apps/web/src/App.tsx` — wrap children in `<OnboardingProvider>`; mount `<TourTooltip />` and `<ChecklistCard />` once at top level
- `apps/web/src/features/notebooks/components/views/RecentSection.tsx` (or wherever the "Create notebook" CTA lives) — add `data-onboarding="create-notebook-button"`
- `apps/web/src/features/sources/components/SourcesPanelHeader.tsx` — add `data-onboarding="add-source-button"`
- `apps/web/src/features/chat/components/ChatInput.tsx` — add `data-onboarding="chat-input"`
- `apps/web/src/features/studio/components/StudioPanel.tsx` — add `data-onboarding="studio-panel-toggle"` + emit `studioOpened` event when panel opens
- `apps/web/src/features/studio/components/ToolGrid.tsx` — add `data-onboarding="studio-tool-grid"`
- `apps/web/src/features/auth/components/AvatarDropdown.tsx` — add "Restart tour" + "Show checklist" menu items

## Testing

Repo has no formal test runner configured yet, but `apps/web/src/features/studio/components/SaveAsPromptModal.test.tsx` exists as a Vitest precedent. Match that pattern (Vitest + React Testing Library) for the web; use `convex-test` for backend. The implementation plan installs missing devDependencies if needed.

### Backend (`convex/onboarding/index.test.ts`)

| Test | Asserts |
|---|---|
| `getOnboardingState` default | Returns `{ tourStatus: "completed", checklistDismissed: true }` for user without row |
| `startTour` happy path | Creates row with `pending → active`, sets `currentStepId: "createNotebook"`, sets `startedAt` |
| `startTour` idempotent | No-op when user has `tourStatus: "completed"` or `"skipped"` |
| `advanceTourStep` linear walk | Walks all five steps; final advance sets `completed` and `completedAt` |
| `advanceTourStep` stale-client rejection | Throws when `expectedCurrentStepId` doesn't match server state |
| `skipTour` | Sets `tourStatus: "skipped"`, leaves `checklistDismissed` unchanged |
| `dismissChecklist` independence | Sets only `checklistDismissed: true`; tour status unaffected |
| `getChecklistProgress` derivation | Insert notebook → `createNotebook: true`. Insert document → `addSource: true`. Etc. |
| `getChecklistProgress` auth scope | User A's data does not tick User B's checklist |
| All mutations require auth | Unauthenticated calls throw |

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

None at design time. Implementation plan should confirm:
- Exact selector for "Create notebook" button (component is in `views/RecentSection.tsx` or similar — TBD by reading)
- Whether StudioPanel already exposes an open/closed boolean we can subscribe to, or whether we need to add the event emitter

## Approval log

- 2026-04-28 — Architecture approved
- 2026-04-28 — Data model approved
- 2026-04-28 — Tour engine + steps approved
- 2026-04-28 — Checklist + edge cases + file list approved
- 2026-04-28 — Testing approach approved
