# Discover sources on the design system

**Status:** approved direction, 2026-10-03.

Issue #261, part 3 of 3: Discover. Parts 1 (the panel, #298) and 2 (the add-source dialog, #300) are done.

**Branch:** `feature/ds-migrate-sources-discover`, stacked on `feature/ds-migrate-sources-dialogs` (#300).

**House style:** `docs/design/principles.md` (soft layered).

**Reference implementation:** `components/add-source/AddSourceDialog.tsx` and `AddSourceMenu.tsx`.

**Why:** `DiscoverSourcesModal` (1046 lines) and `AcademicDiscoveryFiltersSection` (411 lines) are the last hand-built screens in sources. They carry 38 design-lint warnings, plus a palette that lint doesn't catch: sky, amber, violet, emerald, green and rose pills and bars. The problems:

**Shell**
- The overlay is hand-built: no dialog semantics, no focus trap, no focus restore.
- The heading is the brand name, and the real title sits in the body.

**Results**
- Each row is a clickable `div` with a fake checkbox, so you can't select it with the keyboard.
- The grid view has no selection at all, yet the footer still says "N selected".

**Controls**
- The filters are native selects and a range slider in a hand-positioned popover.
- The switches and accordions are hand-built and have no accessible names.

**Data**
- The Journal Rating (SJR) filter is never sent to the search.
- The limit is hard-coded to 200 sources.
- A successful add shows no message at all.

## Decisions (user)

- **List only:** the grid view and its toggle are removed.
- **SJR filter removed from the UI** until the backend supports it. A follow-up issue covers wiring it up server-side. The taxonomy constants and the `worstAllowedJournalQuartile` state field stay.

## Scope

**In**, under `apps/web/src/features/sources/`:
- `components/DiscoverSourcesModal.tsx`
- `components/AcademicDiscoveryFiltersSection.tsx`
- Discover's wiring in `SourcesPanel.tsx`
- `constants/academicFieldTaxonomy.ts`, only to drop the palette classes the UI no longer uses

**Out:**
- The discovery backend (`DiscoveryService`).
- Chat's `ExternalSourcesModal`, which has its own row and is already migrated.
- The composer `FiltersPopover` shell. It only picks up the restyled section.

## 1. Shell

Move the code into a new folder, `components/discover/`:

| File | Role |
|---|---|
| `DiscoverSourcesDialog.tsx` | The `Dialog` shell. Owns search, selection and adding, plus the header, toolbar, body and footer. |
| `DiscoveryToolbar.tsx` | The search `InputGroup`, the source-type `ToggleGroup` and the Filters `Popover`. |
| `DiscoveryFilters.tsx` | The popover body: time range, sort, total results, the academic section, and reset. |
| `DiscoveryResultItem.tsx` | One result row. |
| `discoveryFormat.ts` (+ test) | Pure helpers moved out of the modal: byline, snippet-duplicates-title, relevance label, access label, already-added matching. |

- `DiscoverSourcesModal.tsx` is deleted.
- `AcademicDiscoveryFiltersSection.tsx` stays at its current path, because chat imports it.

**Dialog:**
- `Dialog` / `DialogContent size="wide" padding="none" showCloseButton={false}`, with the same header, body and footer structure as `AddSourceDialog`.
- **Header:**
  - `DialogTitle` "Discover sources" (`font-display text-xl` on an inner span).
  - `DialogDescription` "Search the web, news, papers and finance, then add what you need."
  - An outline `Button` "Add sources" (Plus icon), `hidden sm:inline-flex`, which calls `onAddSourcesClick`.
  - A ghost `icon-sm` close button.
- **Hand-off:** Add sources hands off like the add dialog does. A `handoffRef` plus `onCloseAutoFocus` stops focus from returning to the panel while the add dialog opens.

**State survives close.** The component stays mounted in `SourcesPanel`, as today. `query`, `results` and `selectedIds` live in `DiscoverSourcesDialog` above `DialogContent`, so a reopen shows the last search. Filters keep their `useSessionStorage("discovery-filters")` persistence and the one-time `maxResults ≤ 20` clamp.

**Escape and outside click** come from Radix. The modal's global keydown and mousedown listeners are removed. While any add is in flight, closing is blocked (the same busy rule as the add dialog).

**Limit:** `useUserLimits()` replaces the hard-coded `isAtLimit` prop.
- `limitReached = !limitsLoading && notebookSources.length >= sourceLimit`
- `remaining = sourceLimit - notebookSources.length`

`SourcesPanel` stops passing `isAtLimit`.

## 2. Toolbar (`DiscoveryToolbar`)

**Search** is a `<form>`:
- A visible label "Search" (`FieldLabel`, or `sr-only` if the layout needs it, with the label wired to the input).
- `InputGroup`:
  - a Search icon addon;
  - `InputGroupInput`, `autoFocus`, with the placeholder `Search for articles, papers, or websites...` exactly, because e2e reads it;
  - an inline-end `InputGroupButton` "Search", which shows `Spinner aria-hidden` while loading and is disabled while the query is blank or a search is running.
- Search runs only on submit, as today.
- Add a stale-response guard: a request counter, so a slow earlier search can't overwrite a newer one.

**Source types:** `ToggleGroup type="multiple" variant="outline" size="sm"`, `aria-label="Source types"`.
- Items: Web (Globe), News (Newspaper), Academic (GraduationCap), Finance (TrendingUp).
- If every item is deselected, it falls back to `["web"]`, as today.
- Neutral tokens only: the `SOURCE_TYPE_STYLES` palette map is deleted.

**Filters:** a `Popover` with an outline `Button size="sm"` trigger "Filters" (SlidersHorizontal icon).
- When any filter differs from the defaults, the trigger shows a small `Badge` with the count of changed filters.
- `PopoverContent align="end"` holds `DiscoveryFilters`. It scrolls internally with `max-h-(--radix-popover-content-available-height)`, the Radix-provided CSS variable, so there are no arbitrary values.

## 3. Filters (`DiscoveryFilters`)

Uses `FieldGroup` with:
- **Time range:** `Select`, with today's options and values.
- **Sort by:** `Select`: relevance, date, citations.
- **Results:** `ToggleGroup type="single" variant="outline" size="sm"` with 5, 10, 15 and 20, which replaces the range input. It never allows an empty value.
- **Academic section:** shown only when Academic is selected (`showTopDivider` logic kept).
- **"Reset filters":** a ghost `Button size="sm"`, disabled at the defaults.

## 4. Academic filters (`AcademicDiscoveryFiltersSection`, shared with chat)

Keep the exports (`AcademicDiscoveryFiltersSection`, `buildAcademicDiscoveryApiFilters`, `DiscoveryAcademicFilterState`, `ACADEMIC_FILTER_DEFAULTS` or whatever exists) and the props unchanged.

**Publication year:** `RadioGroup` with All years, Last N years and Custom range.
- **Last N:** a labelled number `Input` ("Years"), clamped to 1–80. It is enabled only while that option is selected.
- **Custom:** labelled "From" and "To" number inputs. If From is after To, both get `aria-invalid` and a `FieldError` reads "From must be before To". `buildAcademicDiscoveryApiFilters` omits the invalid range.
- Ids come from `useId`, replacing the fixed `name="pub-year-mode"`.

**Has PDF and Open access:** `Field orientation="horizontal"` with a `Checkbox` and `FieldLabel`. These replace the hand-built `FilterToggle` switch.

**Minimum citations:** a labelled number `Input`, `min={0}`. The placeholder becomes "Any", and 0 or blank means no minimum.

**Field of study:**
- A `Collapsible`. Its trigger is a ghost `Button` with a chevron and `aria-expanded` from Radix, labelled "Field of study" plus the selected count.
- Its content holds:
  - an `InputGroup` search ("Filter fields");
  - for each group, a heading and `Checkbox` fields;
  - "Show N more" / "Show less" ghost `Button size="xs"`.
- The list scrolls with `max-h-52 overflow-y-auto`.

**Journal rating (SJR):** removed from the UI. The tier constants' `pillClass`, `barClass` and `barWidth` palette fields are deleted from `academicFieldTaxonomy.ts` if nothing else reads them; grep first.

**Typography:** no `text-[11px]` or `text-[10px]`. Section labels use `FieldLabel` or `text-xs font-medium text-muted-foreground`.

**Chat:** the composer `FiltersPopover` renders the same section. Its tests in `chat/components/composer/popovers.test.tsx` ("Academic papers" text) must keep passing.

## 5. Results

**Formatting helpers** (`discoveryFormat.ts`, TDD). Port the logic exactly:
- `formatAcademicByline`;
- `isSnippetRedundant` (the old title-duplicate check);
- `relevanceLabel(score)` → `"High" | "Medium" | "Low"`, with the same thresholds as `getScoreBadge`;
- `accessLabel(result)` → `"OA PDF" | "Open access" | "External access" | "Metadata only" | null`, using the same rules as `academicAccessChip`;
- `isAlreadyAdded(result, notebookSources)`: normalized URL, OpenAlex id or DOI, as today.

**List:** `ItemGroup variant="grouped"`, with `role="list"` provided by the group. Each row is a `<div role="listitem">` around `Item asChild size="sm"` over a `<label htmlFor={checkboxId}>`, so clicking the row toggles the checkbox, the same pattern as `BibtexImportForm`.

Each row contains:
- **Selection:** `ItemMedia` holds a `Checkbox` (`aria-label="Include ⟨title⟩"`). An already-added result shows a disabled, checked checkbox and is not selectable.
- **Content** (`ItemContent`):
  - the favicon, or a type-icon tile;
  - the title (`line-clamp-2`, inside a span);
  - the byline for academic results;
  - the snippet (`line-clamp-2`) unless it duplicates the title;
  - a metadata row of `Badge variant="outline"`: type, domain, relevance ("High match", "Medium match" or "Low match"), access, and citations with a Quote icon when present.

  No palette colours, and no left accent bar.
- **Actions** (`ItemActions`, outside the label's click target, with `stopPropagation` on its controls):
  - a ghost `icon-sm` link "Open ⟨title⟩ in new tab" (ExternalLink, `asChild` `<a target="_blank" rel="noreferrer">`);
  - a per-row `Button size="sm" variant="outline"` with these states:
    - "Add";
    - `Spinner aria-hidden` plus "Adding…" while adding;
    - "Added" with a Check icon, disabled;
    - "Limit reached", disabled, when `limitReached`.

**States:**
- **Before the first search:** `Empty` with an icon, "Find sources to add", and "Search the web, news, academic papers or finance."
- **Loading:** three `Skeleton` rows inside a `role="status"` wrapper with an `sr-only` "Searching…".
- **Error:** `Alert variant="destructive"`.
- **No results:** `Empty` "No sources found". The description is `warnings[0]` if present, otherwise "Try different keywords or filters."
- A result count line is shown politely to screen readers (`aria-live="polite"`), e.g. "12 results".

## 6. Footer and adding

**Footer** (always visible, `bg-muted/40`):
- "N of M selected", plus a ghost `Button size="sm"` "Select all" / "Clear". Select all selects only results that are not already added, up to `remaining`.
- When the selection is larger than `remaining`, a muted note reads "Only R more sources fit in this notebook."
- A primary `Button` "Add N sources" (Spinner while adding), disabled while nothing is selected, while adding, or at the limit.

**Adding:**
- Port `addResult` exactly:
  - `useCreateDocument` with `paper_record` for academic results and `url` otherwise;
  - the optimistic `Source` passed to `onAddSource`;
  - `onDocumentUploaded`.
- **Bulk add** stays sequential:
  - it adds at most `remaining` results;
  - it collects successes;
  - on finish, it shows `useToast().success("Added N sources")` (singular for 1), then clears the added ids from the selection.
- **Errors:** they keep today's error toast, and the row stays selectable.
- **Busy:** while anything is adding, close is blocked.

## 7. Tests, e2e and enforcement

**Unit tests:**
- **`discoveryFormat.test.ts`:** byline, snippet redundancy, relevance thresholds, access labels, already-added matching (URL normalisation, DOI, OpenAlex id).
- **`DiscoverSourcesDialog.test.tsx`**, with `useUnifiedDiscovery`, `useCreateDocument`, `useUserLimits` and `useToast` mocked:
  - the dialog is named "Discover sources";
  - submit calls discover with query, types and filters;
  - results render as checkboxes, and a row click toggles one;
  - select all skips added results and caps at `remaining`;
  - a per-row add calls create with `url` or `paper_record`;
  - bulk add toasts "Added 2 sources";
  - the limit disables Add;
  - a stale response is ignored;
  - the empty and no-results states render;
  - the source-type toggle never ends up empty.
- **`AcademicDiscoveryFiltersSection.test.tsx`:**
  - year mode radios;
  - an invalid custom range shows the error, and the built filters omit it;
  - Has PDF / Open access checkboxes call `setAcademic`;
  - the field-of-study collapsible, search and checkboxes;
  - no SJR control.
- **Existing chat tests stay green.**

**e2e:** `e2e/sources/add-source-modal.spec.ts` opens Discover from the add dialog and reads the placeholder, which is unchanged. Scope it to `getByRole("dialog", { name: "Discover sources" })` if needed. `bunx playwright test --list` must parse.

**Enforcement:**
- Add `src/features/sources/components/discover/**/*.tsx` and `src/features/sources/components/AcademicDiscoveryFiltersSection.tsx` to `MIGRATED`.
- With all panel files listed, `features/sources` should now reach 0 findings.
- If every file under `src/features/sources/**/*.tsx` is clean, collapse the per-file entries into `"src/features/sources/**/*.tsx"`.
- Run `lint:design:update`.

**Gates:** `typecheck:web`, `typecheck:convex`, `lint`, `test:web`, `lint:design`.

**Visual check** (by the controller, with the user, before pushing):
- At desktop and 375px, light and dark, check:
  - the empty state;
  - results with web and academic rows;
  - the filters popover with the academic section;
  - the chat composer filters (it shares the section);
  - the limit state.
- A real search calls Tavily and the academic APIs (cached server-side). Run a single search, and ask the user first.

**Follow-up issue:** "Journal rating (SJR) filter: support it in discovery search". Open it when the PR opens, and link #261.
