# Shared shell and stragglers on the design system (#262)

**Status:** approved 2026-10-04
**Issue:** #262. Rules: `.agents/skills/shadcn/SKILL.md`, `docs/design/principles.md`, the design-system notes in `CLAUDE.md`.

## Goal

The hand-written code in `apps/web/src/shared` and four small feature folders (`billing`, `audio`, `feedback`, `legal`) uses the soft layered design system, passes `lint:design` at 0, and is added to `MIGRATED`.

## Scope

**63 findings** on `main` at 98591bc2:

| Area | Findings |
|---|---|
| `shared/components/icons/ModelBrandIcon.tsx` | 20 (`no-raw-colors`) |
| `features/billing/components/BillingPage.tsx` | 12 |
| `features/audio` (`AudioPlayer`, `MiniAudioPlayer`) | 6 |
| `features/feedback` (`FeedbackModal`, `AdminFeedbackPage`) | 6 |
| `shared/ui/Header.tsx` | 5 |
| `shared/components/Favicon.tsx` | 4 |
| `shared/components/ProtectedRoute.tsx` | 4 |
| `shared/ui/ConfirmDialog.tsx` | 3 |
| `features/legal/components/LegalPageShell.tsx` | 1 |

The 2 findings in `shared/ui/DropdownMenu.tsx` are out of scope, as listed below.

**Out of scope:**
- **Upstream shadcn markup in `shared/components/ui/*`** (70 warnings). Examples are `ring-[3px]` and `top-[50%]`, allowed through `UPSTREAM_ARBITRARY` and the Field and InputGroup exceptions. A separate PR handles them, because they touch every screen and need the gallery screenshot baselines refreshed.
- **The legacy `shared/ui/DropdownMenu.tsx`** and its `anchoredPosition` helper. Only three Studio literature views use them. #264 replaces those menus with the shadcn `DropdownMenu` and deletes both files.

## Design

### ConfirmDialog on `AlertDialog`

`shared/ui/ConfirmDialog.tsx` is a hand-rolled portal. It has no focus trap and no Escape handling, and its button styles are hand-written.
- **Rebuild:** use the shadcn `AlertDialog` primitives: `AlertDialogContent`, `Header`, `Title`, `Description`, `Footer`, `Cancel` and `Action`.
- **Behaviour:** Radix gives focus trapping, Escape to cancel, and focus returned to the element that opened the dialog.
- **Buttons:** Cancel is `AlertDialogCancel`. Confirm is `AlertDialogAction`, using `variant="destructive"` for `danger` and `default` otherwise.
- **Variants:** the unused `warning` variant is removed, leaving `"danger" | "default"`.
- **Closing:** closing any other way (Escape, overlay, Cancel) resolves `false`. Confirm resolves `true`.
- **`useConfirmDialog` API unchanged:** `confirm(title, message, options) => Promise<boolean>` and the rendered `<ConfirmDialogComponent />` stay the same. The five calling components (`BillingPage`, `FolderCard`, `NotebookCard`, `SourcesPanel` and `StudioPanel`) and `BillingPage.test.tsx` need no changes.
- **E2E:** selectors keep working, since `AlertDialogContent` renders `role="alertdialog"`.

### App header (`shared/ui/Header.tsx`)

- **Bottom edge:** `border-b-2 border-border` becomes a hairline separation, matching the other app chrome.
- **Share:** the hand-rolled button becomes `<Button variant="outline" size="sm">` with the same icon, label and title.
- **Notebook title input:**
  - The measured width moves from an inline `width` to a `--title-width` custom property, used as `w-(--title-width)`.
  - The editing underline becomes a state-gated token rather than a permanent `border-primary`.
  - The measuring span and the 100px minimum stay.

### Small shared widgets

- **`Favicon`:** the four inline size styles become one `--favicon-size` custom property, with `size-(--favicon-size)` and `max-*` classes.
- **`ProtectedRoute`:** the two `border-4 border-primary` spinners become the `Spinner` primitive.
- **`ModelBrandIcon`:**
  - The real brand colours stay: they are company logos in the chat model picker.
  - `eslint.config.mjs` turns off `shadcn/no-raw-colors` for this one file, with a comment that brand marks are exempt like the cover swatches are.
  - Every other rule still applies to it.

### Billing page (`features/billing/components/BillingPage.tsx`)

- **Plan and summary blocks:** the hand-built `bg-card border-2 rounded-xl p-8` blocks become `Card`.
- **Highlighted plan:**
  - It was `border-2 border-primary shadow-lg`. It becomes `Card variant="elevated"`.
  - If that isn't distinct enough in the visual check, add a `featured` Card variant (a soft primary ring plus shadow) to `card.tsx`, rather than restyling at the call site.
- **Buttons:** the hand-rolled buttons become `Button` variants: `outline` for secondary actions and `default` for the primary upgrade.
- **Warning text:** `text-orange-500` becomes `text-warning`.

### Audio players (`AudioPlayer`, `MiniAudioPlayer`)

- **Edge:** the `border-b-2 border-primary` edge becomes fill or shadow separation.
- **Slider colour:** the inline `accentColor` becomes an `accent-primary` class.

### Feedback (`FeedbackModal`, `AdminFeedbackPage`)

- **Title:** `font-display font-bold` on `DialogTitle` is dropped, because `DialogTitle` owns its typography. If the modal needs a display title, that becomes a variant.
- **Label colour:** `text-muted-foreground` on `Label` moves to a wrapper or `FieldDescription`.
- **Admin page:**
  - `text-[11px]` becomes `text-xs`.
  - The bordered admin cards become `Card`.

### Legal

`md:text-[15px]` becomes `md:text-sm`, the same size on the scale.

### Enforcement

- **`MIGRATED` additions:**
  - `src/shared/ui/**/*.tsx`, excluding `DropdownMenu.tsx` until #264;
  - `src/shared/components/*.tsx` and `src/shared/components/icons/**/*.tsx`;
  - `src/features/billing/**/*.tsx`, `src/features/audio/**/*.tsx`, `src/features/feedback/**/*.tsx` and `src/features/legal/**/*.tsx`.
- **Baseline:** `lint:design:update` drops the `billing`, `audio`, `feedback` and `legal` entries. `shared` keeps the 70 upstream warnings and the 2 in `DropdownMenu.tsx`.

## Testing

- **ConfirmDialog unit test:**
  - Confirm resolves `true`.
  - Cancel resolves `false`, and so does Escape.
  - `danger` renders a destructive action.
  - The dialog has the alertdialog role and title.
- **Existing tests:** `Header.test.tsx`, `BillingPage.test.tsx` and the feedback and audio tests keep passing. Selectors change only if a role changes.
- **Gates:** `typecheck:web`, `typecheck:convex`, `lint`, `lint:design`, `test:web`, and `bunx playwright test --list` parsing.
- **Visual check** at desktop and 375px, light and dark:
  - the billing page;
  - the notebook header, including title editing and Share;
  - a delete confirmation;
  - the audio player;
  - the feedback modal;
  - the legal page.
