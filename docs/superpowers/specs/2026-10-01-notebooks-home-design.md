# Notebooks home: design-system migration

**Issue:** #259 (part of #265) · also closes #226
**Scope decision:** option A, restyle plus layout fixes. Same features and data, no backend change.
**Branch:** `feature/ds-migrate-notebooks`, stacked on `feature/ds-migrate-auth` (#227). It uses the `Card` `elevated` variant and the `.auth-form-light`/token work from that PR. Retarget to `main` once #227 merges.

## Problem

`apps/web/src/features/notebooks` is the first screen after sign-in. It's what App Store reviewers see next, and the iOS app shows it at phone width. Today:

1. **Phone:** two dashed "Create new folder / Create new notebook" tiles (16:10, full width) take about 660px, so the user's notebooks start below the fold.
2. **Cards:** a 55% colour band plus a 45% mostly empty body. The title is pinned to the bottom. The only metadata is a count badge.
3. **Folders and notebooks look identical** (#226). New notebooks default to the `Folder` icon, and both card types share one layout.
4. **Header:** the tabs, view toggle and sort menu are separate hand-built controls. Each closes on click-outside through a global `mousedown` listener.
5. **Dialogs** (customize notebook, customize folder, move to folder, share) are hand-built `fixed inset-0` overlays with no focus trap.
6. **54 design-lint findings.** RecentSection 12, ShareNotebookModal 12, NotebookCard 7, FolderCard 5, FolderView 4, NotebookPanelSeparator 4, and the rest at 1 or 2 each.

## Design

### 1. Header (`HomeHeader`, new)

Two compact rows at every width. The first holds the page title **"Your notebooks"** (serif display) and the primary create action. The second holds the tabs on the left and the view controls on the right. The controls:
- **Tabs:** All · My notebooks · Featured. shadcn `Tabs`, list only. The panels stay as today's conditional sections.
- **View toggle:** `ToggleGroup` type single, grid or list, each item with an `aria-label`.
- **Sort:** `Select` with "Most recent" and "Title (A–Z)". It replaces the custom dropdown and its open state.
- **Primary action:** a split button. **New notebook** is `Button` default. Next to it, a `DropdownMenu` trigger (chevron, `aria-label="More create options"`) holds **New folder**. The onboarding target `data-onboarding="create-notebook-button"` moves onto the New notebook button.

On phone the second row wraps if needed. The signed-out behaviour is unchanged: create actions call `onRequireAuth(...)`.

The dashed create tiles and list rows are **removed** from `RecentSection` and `FolderView`. Inside a folder, the folder header gets its own **New notebook** button, which creates the notebook directly in that folder, as today.

### 2. Notebook card (grid)

Built on `Card`. A new `interactive` variant on `Card` (in `ui/card.tsx`) adds the hover lift, focus ring and press scale with the house `ease-out`. A card is one `button`-like surface. It's a real `<button>` or a link-styled `div` with `role="button"`, `tabIndex=0` and Enter/Space handling, plus a separate actions trigger, so the menu isn't nested inside the clickable area.

- **Cover:** a fixed-height band (`h-20`) with the persisted swatch class from `coverFillClass`. The icon sits bottom-left at `size-8`.
- **Body:** the title at the top (`line-clamp-2`, sans, semibold). Below it a muted meta line: **"16 sources · Sep 12"**. The date is the notebook's **created** date (see Decisions).
- **Actions:** the top-right of the cover has a ghost `icon-sm` `Button` (`aria-label="Notebook actions"`) that opens a `DropdownMenu`: Customize, Move to folder, a separator, then Delete (destructive item → existing `useConfirmDialog`). Shared notebooks show a `Badge` "Shared" instead.
- **Size:** about 168px tall instead of about 330px. Grid columns: 2 on phone, 3 at `md`, 4 at `lg`, 5 at `2xl`.
- **Featured notebooks** (`FeaturedSection`) use the same card with a "Featured" `Badge` and no actions menu. The list variant matches the list rows in §4.

### 3. Folder card (grid), visually distinct

The same `Card interactive` base with a folder silhouette. A small tab on the top-left edge (a pseudo-element filled with the folder's swatch) and a **stacked-sheets** edge (two offset borders behind the card) make it read as a container even with a custom colour or icon. The cover band is lighter: a swatch tint, not a full fill. The meta line reads **"6 notebooks"** (singular "1 notebook"). Folders always sort before notebooks, as today.

### 4. List view

A `Table`-like grid of rows using semantic tokens: icon chip, title, meta and an actions menu. The column template moves from arbitrary `grid-cols-[…]` values to theme spacing tokens or flex. The `ListHeader` labels stay. On phone, rows drop the sources column into the meta line.

### 5. #226: notebook icon defaults

- New notebooks default to the **`Book`** icon in `useNotebookCRUD`, `notebooksApi` (optimistic) and the `convex/notebooks` create fallback. This is a one-line constant change, not a schema change.
- Remove `Folder` from the **notebook** icon picker.
- **Render-time mapping:** a notebook stored with `icon: "Folder"` or no icon renders as `Book`. No data migration.

### 6. Dialogs

Customize notebook, customize folder, move to folder and share are rebuilt on `Dialog` + `Field`/`Input` + `Button`. The swatch and icon pickers become `ToggleGroup`s of swatches with `aria-label`s. Radix provides the focus trap, Esc handling and scroll lock. Share uses `InputGroup` with a copy button and a toast. The headings, placeholders and button labels the e2e specs use are unchanged: "Create notebook", "Notebook title", "Create", "Save".

### 7. Motion

Everything goes through `@/shared/components/motion` (`m.*`, `LazyMotion strict`). Reduced motion is honoured through `MotionConfig reducedMotion="user"` and the global CSS rule.
- **Grid entrance: CSS, not `m.*`.** `tw-animate-css` `animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards`, staggered with `delay-*` steps of about 40ms for the first 12 cards; later cards get none. The cards are never hidden waiting on the lazy motion chunk (the sign-in lesson from #227).
- **Reorder and move:** `m.div` with `layout` on card wrappers, so sort changes and moving a notebook into a folder glide. `AnimatePresence` handles enter and exit, so a newly created notebook scales in and a deleted one fades out. If the chunk hasn't loaded, items simply appear and disappear without animation.
- **Loading:** `Skeleton` cards in the grid shape replace the current blank state while the queries load.

### 8. Empty state

When a signed-in user has no notebooks or folders, the grid area shows `Empty`: an icon, "Create your first notebook", one line of copy and the New notebook button. Featured still shows when the tab is All.

## Out of scope

- The notebook page itself (`NotebookView`, panels, chat, sources, studio). `NotebookView` is already at 0 findings. `NotebookPanelSeparator`'s 4 restyle findings are fixed here only because the folder must reach 0.
- `useConfirmDialog` (lives in `shared/`, tracked in #262).
- Backend "last activity" tracking (see Decisions).
- New home features (pins, continue-where-you-left-off).

## Decisions

- **Meta date = created date, not "edited".** `notebooks.updatedAt` only changes on rename, customize or move, not when sources are added or chats happen, so "Edited 2d ago" would mislead. A real last-activity timestamp needs a backend change. If wanted, that's a follow-up issue.
- **`Card` gets an `interactive` variant** instead of per-call hover classes, per the "new look = new cva variant" rule.
- **The e2e specs move to role-based selectors**, as #227 did for the account menu. `getByText("Create new notebook")` → `getByRole("button", { name: "New notebook" })` in `notebook.spec.ts`, `notebook.fixture.ts` and `onboarding-ui.spec.ts`. `[class*="kebab"]` → `getByRole("button", { name: "Notebook actions" })`.

## Acceptance

- `src/features/notebooks/**` is at **0** design-lint findings and in `MIGRATED`. The baseline is lowered.
- At 390×844 the first notebook card is visible without scrolling, and two cards fit per row.
- Folder and notebook cards with the same swatch are distinguishable in grid and list view. New notebooks never show the folder icon (#226).
- Every dialog traps focus, closes on Esc and returns focus to its trigger.
- Keyboard: cards are focusable and open on Enter. The actions menu is reachable without opening the card.
- Unit tests updated: `useNotebookCRUD.test.ts` (Book default), plus new tests for the icon fallback mapping, card meta text, the header (create split button, tabs, view toggle), notebook/folder cards and their actions menu, and the customize dialog. The signed-out guard in `HomePage` is unchanged and not newly tested.
- `typecheck:web`, `typecheck:convex`, `lint`, `lint:design` and `test:web` all pass. `test:convex` passes if the create fallback changes.
- Visual check (Playwright) at 1440×900, 768×1024 and 390×844: grid, list, empty state and each dialog.
