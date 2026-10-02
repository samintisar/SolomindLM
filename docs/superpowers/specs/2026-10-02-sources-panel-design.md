# Sources panel on the design system

**Status:** approved direction (2026-10-02). Issue #261, part 1 of 3: the panel. Parts 2 and 3 (the add-source dialogs and Discover) are separate PRs.
**Branch:** `feature/ds-migrate-sources-panel`, stacked on `feature/soft-layered-design` (#282).
**House style:** `docs/design/principles.md` (soft layered).
**Why:** the Sources panel is the most visible area still on hand-built markup:
- outlined cards and a 2×2 grid of outlined buttons;
- a selection "checkbox" made from a clickable `div`;
- a custom kebab menu with no keyboard or Escape handling;
- 82 design-lint warnings across the panel files.

## Scope

In:
- `apps/web/src/features/sources/components/`: `SourcesPanel.tsx`, `SourcesPanelHeader.tsx`, `SourceList.tsx`, `SourceListItem.tsx`, `SourceViewer.tsx`, `PdfViewer.tsx`, `YouTubeVideoPreview.tsx`.
- Deleting the dead Source Guide web UI (#252, web only).
- Rollback fixes in `hooks/useSourceManager.ts`.
- e2e and onboarding selectors that point at these components.

Out:
- The add-source dialogs: `AddSourceModal` and the eight input/import modals.
- `DiscoverSourcesModal` and `AcademicDiscoveryFiltersSection`.
- The Source Guide backend and schema field (#252).
- `ConfirmDialog` (`@/shared/ui`, shared area #262).

## 1. New primitive: Item (grouped list rows)

Add shadcn `item` via the CLI (`bunx --bun shadcn@latest add item` from `apps/web`) and apply the usual post-add fixes:
- rewrite the `cn` import;
- drop bogus deps.

The parts are `ItemGroup`, `Item`, `ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` and `ItemSeparator`.

Adapt it to the soft layered style inside `ui/item.tsx`:
- `ItemGroup` gets a `variant="grouped"`: one in-flow surface (`rounded-2xl bg-card shadow-xs ring-1 ring-hairline`, `overflow-hidden`). Rows inside it are separated by hairlines (`ItemSeparator` or a `divide-y divide-border/60` rule). The plain group stays unstyled.
- `Item` rows: `px-3 py-2.5 gap-3`, a hover fill `hover:bg-muted/60`, and a focus-visible inset ring. No outline variant is used.
- Selected state comes from content, not a fill: the checkbox carries it. Rows have no `aria-selected` styling.

Add a smoke test and a gallery entry (when #285 lands, add an Item section to `/dev/design`; until then the smoke test covers it).

## 2. Source list (`SourceList`, `SourceListItem`)

**Actions row:**
- `Button` (default) "Add source", with `title="Add Source"` and `data-onboarding="add-source-button"` kept.
- Next to it, a `ButtonGroup variant="tray"` of ghost icon buttons, each with a tooltip (`ControlTooltip`-style: `Tooltip` plus an aria-label):
  - Discover;
  - Refresh all (the icon spins via `Spinner` while refreshing; disabled when it can't refresh);
  - Delete selected (disabled at 0 selected).
- Container queries keep labels visible only when the panel is wide enough, as today.

**Search:** an `InputGroup` with a search-icon addon and an `InputGroupInput`.

**Count row:** "N of M selected" (today it reads "N items"; update any test that reads the old text) and a ghost `Button size="sm"` "Select all" / "Deselect all".

**Rows:** an `ItemGroup variant="grouped"`, with one `Item` per source.
- `ItemMedia`: the file-type icon tile, or the favicon for web sources (`Favicon`).
- `ItemContent`:
  - `ItemTitle` is the source title, truncated. The paper hint stays visible in the meta line, so the old `title` tooltip is dropped.
  - `ItemDescription` is the meta line.
  - Status `Badge` with semantic tokens: Processing (`secondary`, with `Spinner`, text "Processing") or Failed (`destructive`, text "Failed").
- `ItemActions`:
  - A `Checkbox` with `aria-label={`Include ${title} in chat`}`, bound to the source's selected state.
  - A `DropdownMenu` (`modal={false}`). Its trigger is a ghost `icon-sm` button, `aria-label="More options"`, `title="More options"` kept for e2e. Items:
    - Refresh, only for remote sources;
    - Rename;
    - Delete, `variant="destructive"`, which goes through the existing confirm.
- The `Item` row is a plain `div`. Inside it, one `<button type="button">` wraps `ItemMedia` and `ItemContent` (`flex min-w-0 flex-1 items-center gap-3 text-left`) and opens the source.
  - It's disabled while processing or renaming.
  - The checkbox and menu sit outside that button, so there are no nested interactive elements.
  - It's keyboard reachable.
- Rename is an inline `Input` with `aria-label="Rename source"`.
  - Enter submits a trimmed value, Escape cancels, blur submits.
  - Focus moves to the input when rename starts and back to the menu trigger afterwards.
- Remove the z-index juggling, the click-outside overlay and the arbitrary values.

**Empty state:** `Empty` with an icon, the title "Add your first source", a one-line description, and an "Add source" button.

## 3. Header and viewer (`SourcesPanelHeader`, `SourceViewer`, `YouTubeVideoPreview`)

**Header:** one component, replacing today's duplicated mobile and desktop markup.
- **List mode:** title plus a count `Badge`.
- **Viewer mode:** back `Button` (ghost `icon-sm`, `aria-label="Back to sources"`), then the title.
  - Inline rename, with the same key rules as in the list.
  - The "click title to rename" span becomes a ghost `Button` that shows the title.
- **Actions:** a tray of open link (`Button asChild` over the `<a>`, keeping the "Open source in new tab" label), copy and download. Each gets a tooltip and stays disabled when it can't act.
- **Desktop close:** stays as a ghost icon button.
- Breakpoint differences become responsive classes. Unit test `SourcesPanelHeader.test.tsx` queries `getAllByRole("link", { name: "Open source in new tab" })`; after the merge the link should be single, so update it to `getByRole`.

**Source guide (inline in the viewer):**
- A `Card` holding a `Collapsible`. The trigger is a ghost button with `aria-expanded`, keeping the "Source guide" name.
- The summary keeps `data-testid="source-guide-summary"`.
- Topic chips become `Button variant="secondary" size="chip"` (accessible names unchanged).
- Generating: a `Skeleton` with the "Generating source guide..." text kept.
- Error: `Alert variant="destructive"`.

**States:**
- failed, error and PDF-load error: `Alert variant="destructive"`;
- loading: `Spinner`;
- placeholder: `Skeleton`.

**Markdown/PDF switch:** a `ToggleGroup type="single"` with the two options. Its `aria-pressed` semantics map to `data-state=on` and `aria-checked`; update any test that reads `aria-pressed`.

**PDF URL fetch:** replace the silent `.catch(() => setPdfUrl(null))` with a `console.error` plus the visible "Could not load PDF." message.

**Markdown typography:** the `prose*` classes on the viewer are unknown to the linter, so the typography plugin is not loaded and they generate nothing.
- Check how `MarkdownRenderer` styles content (chat uses `.prose.max-w-none` with project CSS).
- If those classes do produce CSS through project styles, keep only the ones that do.
- Otherwise remove them, and confirm visually that markdown sources render the same.

**YouTube preview:** `Card variant="flush"` around the iframe. The unavailable fallback is `Empty`. All `data-testid`s and aria-labels are kept.

## 4. PDF viewer (`PdfViewer`)

**Toolbar:** a `ButtonGroup variant="tray"` with:
- an outline `Toggle`;
- previous and next;
- the page `Input` (a narrow `w-12`, with the page count beside it);
- zoom out and zoom in.

Each control gets a tooltip and an aria-label. The arbitrary widths (`min-w-[2ch]`, `min-w-[3rem]`) become token sizes.

**States:** errors use `Alert` and loading uses `Spinner`.

**Outline sidebar:** a styled `aside` with token colours. The `react-pdf__Outline` nested-list indent becomes a hairline left rule (`border-l border-border/60`, not `border-l-2`). Keep its own scroll.

**Page height:** the zoom-dependent value becomes a CSS custom property set inline: `style={{ "--page-h": … }}` plus `h-(--page-h)`. That is the one allowed dynamic inline style.

**Must stay exactly as is:**
- IntersectionObserver virtualization and its scroll-root ref;
- the DPR cap of 2 and zoom 0.5–2;
- the current-page-from-scroll logic and the programmatic-scroll guard (`scrollend` plus the 120ms fallback);
- the page-input rules: digits only, Enter blurs, blur commits clamped.

## 5. Behaviour fixes

- **`useSourceManager`:** delete and rename currently apply locally and only toast on failure. Snapshot the previous state, restore it on failure, then toast. Bulk delete gets the same treatment. Add unit tests that mock the mutation to reject and assert the rollback.
- **`SourcesPanel` refresh-all:** a Drive token failure is `console.warn`'d. Keep it, since the toast already reports skipped Drive sources, and add a comment saying why it's acceptable.
- **Scroll body:** stays a native `overflow-y-auto` element. `ScrollArea` would break the rows' `truncate`, the same lesson as chat history. Token classes only.

## 6. Source Guide web cleanup (#252, web only)

Delete:
- `components/SourceGuide.tsx`
- `components/SourceGuide.test.tsx`
- `hooks/useSourceGuide.ts`

Keep:
- `useGenerateSourceGuide` (`services/documentsApi.ts`);
- the viewer's inline guide;
- the `SourceGuide` type;
- the whole backend.

Comment on #252 that the web UI is now removed, so only the backend decision remains.

## 7. Tests, e2e and enforcement

**Unit tests (new):**
- `SourceListItem`:
  - the row opens on click and on Enter;
  - it's disabled while processing;
  - the checkbox toggles and is labelled;
  - the menu opens and shows Rename and Delete, with Refresh only for remote sources;
  - the rename keys work;
  - Failed and Processing badges appear.
- `SourceList`:
  - the tray actions are disabled correctly;
  - the empty state renders;
  - select all works.
- `SourcesPanelHeader`: rename keys.
- `useSourceManager`: rollback.

**e2e:**
- `e2e/helpers/source-assertions.ts`:
  - `getSourceCard`: XPath `rounded-lg` ancestor → the `Item` (by `data-slot="item"` and the title text).
  - checkbox `div.text-primary` → `getByRole("checkbox", { name: /Include … in chat/ })`.
  - "Delete" → `getByRole("menuitem", { name: "Delete" })`.
  - `[title="More options"]` is kept.
- `e2e/sources/source-list.spec.ts`:
  - `svg[class*='check']` → `toBeChecked()`;
  - `input.border-primary` → `getByRole("textbox", { name: "Rename source" })`.
- `e2e/helpers/navigation.ts` (`[title="Add Source"]`) and the `[data-onboarding="add-source-button"]` hook keep working.
- Verify `bunx playwright test --list` parses.

**Enforcement:**
- Add the panel files to `MIGRATED` individually: `src/features/sources/components/{SourcesPanel,SourcesPanelHeader,SourceList,SourceListItem,SourceViewer,PdfViewer,YouTubeVideoPreview}.tsx`.
- `features/sources` as a whole stays at warn until parts 2 and 3. The panel files must reach 0 findings.
- Run `bun run lint:design:update` to lock in the drop.

**Visual check:** done by the controller with the user.
- The Sources tab at 390 px, plus the desktop panel, in light and dark.
- States: the list (selected, processing, failed), the row menu, rename, the empty state, a markdown source, a PDF source (toolbar and outline) and a YouTube source.
- Show the screenshots before pushing.
