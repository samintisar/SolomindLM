# Add-source dialog on the design system

**Status:** approved direction (2026-10-02). Issue #261, part 2 of 3: the add-source dialogs.
- Part 1 (the panel, #298) is done.
- Part 3 (`DiscoverSourcesModal` + `AcademicDiscoveryFiltersSection`) is a separate PR.

**Branch:** `feature/ds-migrate-sources-dialogs`, stacked on `feature/ds-migrate-sources-panel` (#298).
**House style:** `docs/design/principles.md` (soft layered).

**Why:** none of the nine add-source dialogs is a real dialog. Each one is `if (!isOpen) return null` plus a hand-built `fixed inset-0` overlay, so they lack:
- dialog semantics;
- a focus trap;
- Escape handling;
- focus restore.

They also open in two different ways:
- Website, Transcripts and Copied text close Add sources and open in its place.
- The five paper dialogs stack over it, and closing them returns to it.

They also contain:
- clickable `div`s acting as buttons and checkboxes;
- unlabelled fields;
- hand-built tabs and alerts;
- an inline-styled progress bar;
- two copies of the same Zotero/Mendeley component.

## Scope

**In** (all under `apps/web/src/features/sources/`):
- `components/AddSourceModal.tsx`
- `UrlInputModal.tsx`, `SocialMediaInputModal.tsx`, `TextInputModal.tsx`
- `DoiInputModal.tsx`, `ManualPaperModal.tsx`, `BibtexImportModal.tsx`
- `ZoteroImportModal.tsx`, `MendeleyImportModal.tsx`
- their wiring in `SourcesPanel.tsx`
- e2e selectors that reach into them

**Out:**
- `DiscoverSourcesModal` and `AcademicDiscoveryFiltersSection` (part 3). Until part 3 lands, Discover will look different from Add sources.
- `GoogleDrivePicker.tsx`: it renders nothing, and its imperative `open()` and its OAuth stay as they are.
- Any backend change.

## 1. Structure: one dialog with steps

Move the dialog into a new folder, `components/add-source/`:

| File | Role |
|---|---|
| `AddSourceDialog.tsx` | The shadcn `Dialog` shell. Holds the `step` state, the step header, close rules and the limit footer. |
| `AddSourceMenu.tsx` | The menu step: drop zone, option groups, warnings. |
| `UrlForm.tsx` | Website URLs (was `UrlInputModal`). |
| `VideoForm.tsx` | Video and social URLs (was `SocialMediaInputModal`). |
| `TextForm.tsx` | Pasted text (was `TextInputModal`). |
| `DoiForm.tsx` | Resolve and add by DOI (was `DoiInputModal`). |
| `ManualPaperForm.tsx` | Manual paper entry (was `ManualPaperModal`). |
| `BibtexImportForm.tsx` | BibTeX/RIS file or paste (was `BibtexImportModal`). |
| `LibraryImportForm.tsx` | Zotero and Mendeley `.bib` export import. `source: "zotero" \| "mendeley"` picks the icon, the copy and the `sourceType`. |
| `PaperFileDrop.tsx` | Shared "choose a .bib file" control used by the BibTeX and library forms. |

The nine old `*Modal.tsx` files are deleted.

**Step state:** `type AddSourceStep = "menu" | "url" | "video" | "text" | "doi" | "bibtex" | "zotero" | "mendeley" | "manual"`.
- `AddSourceDialog` owns it.
- It resets to `"menu"` whenever the dialog closes.
- Each form unmounts when you leave its step, so a reopened form always starts empty. This fixes today's stale DOI and Manual state on the success path.

**Step header:**
- Every non-menu step renders a ghost `icon-sm` Back button (`aria-label="Back to add sources"`) beside its `DialogTitle`. The dialog's accessible name follows the step.
- The menu's title is "Add sources", with a `DialogDescription`.
- Each form step has a one-line `DialogDescription` (the old intro copy, where one existed).

**Width:** one width for every step: `DialogContent size="wide"` (`sm:max-w-3xl`, a flex column capped at `max-h-svh`), so the dialog doesn't jump in size between steps.
- The body scrolls natively (`overflow-y-auto`, `min-h-0 flex-1`).
- The header and footer stay fixed.
- Form steps cap their own content at `max-w-xl` and centre it, so short forms don't stretch across 768px.

**Close rules:**
- The ✕, Escape and an outside click close the dialog from any step. Escape closes; it does not go back.
- While a form is busy (submitting, resolving, parsing or importing), all three are blocked. The form reports this to the dialog through `onBusyChange(busy)`, which feeds:
  - `onEscapeKeyDown` / `onInteractOutside` → `preventDefault()`;
  - the ✕ being disabled.
- The Back button is also disabled while busy.

**Success:** every form calls `onDone()` on success, which closes the whole dialog. The new sources appear in the list.
- This is a change for the paper forms, which used to return to the menu.
- Failures keep the step open, and a toast or inline `Alert` explains the failure, as today.

**Drag reset:** keep today's behaviour. When the dialog closes, `onDragLeave` is called with a synthetic event through a ref; the comment explains this avoids an infinite loop.

**`SourcesPanel` wiring:**
- Remove `showUrlInput`, `showSocialMediaInput`, `showTextInput` and the three sibling modals.
- `AddSourceDialog` receives `onUrlUpload`, `onVideoUpload` and `onTextUpload` (the `sourceUpload.handle*Upload` handlers) plus `isUploading`.
- Discover and Google Drive keep today's flow: close the dialog, then open Discover or call `googleDriveRef.current?.open()`.
- Discover's `onAddSourcesClick` still reopens the dialog, which opens on the menu.
- The paper forms still need `noteId`. Their menu options are disabled when `noteId` is missing, as today: `canUpload` requires it.

## 2. Menu step (`AddSourceMenu`)

**Header row:**
- The title "Add sources" and the description (today's copy).
- An outline `Button` "Discover sources" with the Globe icon, `hidden sm:inline-flex` as today.

**Drop zone:** a `div` drop target with `data-testid="source-dropzone"`.
- **Look:** `rounded-2xl border border-dashed border-border bg-muted/40`, padded and centred. A 1px dashed hairline on a non-button is allowed by `solomind/soft-surfaces`.
- **Content:**
  - the upload icon tile;
  - "Upload sources" (keep the text, for e2e);
  - "Drag & drop or choose files";
  - the supported-types line.
- **Keyboard:** a real outline `Button` "Choose files" opens the hidden file input, so upload is keyboard reachable. Clicking anywhere on the zone also opens the picker, as today.
- **Drag:** `data-state={isDragging ? "dragging" : "idle"}` with `data-[state=dragging]:border-primary data-[state=dragging]:bg-primary/10`. No scale.
- **Disabled** (`!canUpload`): `aria-disabled`, `opacity-50`, and the Choose files button is disabled.
- The hidden file input keeps its `accept` list and `multiple`. It stays the only `input[type=file]` mounted on the menu step, which `file-uploads.spec.ts` relies on.

**Options:** two `ItemGroup variant="grouped"` lists, stacked on mobile and side by side on `sm` and wider (`grid gap-4 sm:grid-cols-2`). Each group has a small muted heading.
- **"Links and text":**
  - Website (Globe)
  - Transcripts (Youtube)
  - Copied text (FileText)
  - Choose from Google Drive (HardDrive), only when `isGoogleDrivePickerConfigured`
- **"Research papers":**
  - Import from DOI
  - Import BibTeX or RIS
  - Import from Zotero
  - Import from Mendeley
  - Add manually

**Option rows:** each option is an `Item asChild` over a `<button type="button">`, containing:
- `ItemMedia variant="icon"`;
- `ItemContent`, with an `ItemTitle` (the label above) and an `ItemDescription` hint;
- a trailing `ChevronRight`.

The hint is linked through `aria-describedby`, so each button's accessible name is exactly its label. `disabled={!canUpload}`.

The hints:

| Option | Hint |
|---|---|
| Website | Paste one or more web page links |
| Transcripts | YouTube, TikTok, Instagram or X video links |
| Copied text | Paste notes or any text |
| Google Drive | Pick files from your Drive |
| DOI | Look up a paper by its DOI |
| BibTeX/RIS | Upload or paste a bibliography |
| Zotero | Import a Zotero BibTeX export |
| Mendeley | Import a Mendeley BibTeX export |
| Add manually | Enter a paper's details yourself |

**Warnings** (`Alert`, after the options):
- Not signed in or no notebook: `variant="warning"`, title "Authentication required", today's description.
- At the limit: `variant="destructive"`, title "Source limit reached", today's description.

**Footer** (`AddSourceDialog`, every step):
- "Source limit" with the File icon.
- A shadcn `Progress`, added with the CLI and adapted to tokens. Its value is `limitsLoading ? 0 : min(count / max, 1) * 100`, and its indicator turns destructive at the limit (`data-state` or a variant).
- The count `{count} / {max | "…"}`. The text format stays exactly `0 / 100`.
- The footer is a quiet strip: `bg-muted/40`, no top border, with the dialog's padding.

## 3. Form steps

**Shared layout for every form:**
- A `<form>` with `onSubmit`.
- `FieldGroup`, `Field` and `FieldLabel` with `htmlFor`/`id` on every control.
- A footer row (`flex justify-end gap-2`) with the primary submit `Button`. Back sits in the step header, so there is no Cancel.
- Busy submit buttons show `Spinner` plus the busy label.
- Inline errors use `Alert variant="destructive"` with `role="alert"`, which Alert already sets.

**Website (`UrlForm`), Transcripts (`VideoForm`), Text (`TextForm`):**
- One labelled `Textarea`, `autoFocus`. Labels: "Website URLs", "Video URLs", "Text".
- Placeholders unchanged: the e2e tests use `Paste your text here...` and the `https://example.com` pattern.
- Kept as is:
  - Cmd/Ctrl+Enter submits;
  - URLs are split on whitespace, and only http(s) is kept;
  - the toast text "Please enter at least one valid URL (starting with http:// or https://)." is unchanged;
  - `await onUpload(...)`, then `onDone()`; errors keep the step open.
- Submit labels unchanged: "Add Sources" (Website, Transcripts) and "Add Source" (Text).
- Submit is disabled while `!input.trim()` or uploading. Busy is reported while uploading.

**DOI (`DoiForm`):**
- A labelled `InputGroup` ("DOI"): the input, plus an `InputGroupButton` "Resolve" (Search icon, or Spinner while resolving). Enter resolves.
- A failed or empty resolve shows today's "Could not resolve DOI…" message in an `Alert`.
- The preview is a `Card` containing:
  - the title in `font-display`;
  - the authors;
  - the abstract, `line-clamp-4`;
  - a meta row (venue · year · DOI, as text).
- Submit "Add to notebook" calls `useUpload` with `type: "paper_record"`, as today.
- Busy is reported while resolving and while adding.

**Manual (`ManualPaperForm`):**
- Required fields: Title and Authors. They carry `aria-required` and a visible required mark (`text-destructive` asterisk, `aria-hidden`).
- The authors field has a `FieldDescription`: "Separate authors with commas".
- Optional fields:
  - Abstract (`Textarea`);
  - DOI, Venue, Year and PDF URL in `grid gap-4 sm:grid-cols-2`.
- Year is `inputMode="numeric"`; a value that isn't a number is dropped, as today.
- Validity and payload are unchanged: `isOa: false`, `sourceType: "manual"`, and empty optional fields become `undefined`.
- Submit "Add Paper".

**BibTeX/RIS (`BibtexImportForm`):**
- `Tabs` with "Upload file" and "Paste text":
  - **Upload file:** `PaperFileDrop` (`accept=".bib,.ris"`), a real `Button` plus a hidden input. It shows the chosen file name once loaded.
  - **Paste text:** a labelled mono `Textarea` (rows 8) and a "Parse bibliography" button.
- **Format fix:** detect the format from the content actually being parsed (the new file's text, or the textarea's text), not from stale `fileContent` state: `"ris"` if it starts with `TY  -`, otherwise `"auto"`.
- **Results:**
  - Stats `Badge`s: N found (`secondary`), N with DOI, and N missing DOI (`warning`/`destructive` style tokens).
  - Parse warnings in an `Alert variant="warning"`, as a list.
  - A "Select all" / "Deselect all" ghost `Button size="sm"`.
  - An `ItemGroup variant="grouped"` (scroll body `max-h-64 overflow-y-auto`) with one `Item` per paper. Each row has a `Checkbox` labelled "Include ⟨title⟩", and an `ItemContent` with the title, plus authors and year in an `ItemDescription`. Every paper is selected after a parse, as today.
- Submit "Import N selected paper(s)" calls `useBulkUpload`, as today, with `sourceType: p.sourceType || "bibtex"`.

**Zotero and Mendeley (`LibraryImportForm source`):**
- A short help line: "Export your ⟨Zotero|Mendeley⟩ library as BibTeX (.bib), then choose the file."
- `PaperFileDrop` with `accept=".bib"`; parsing starts as soon as a file is chosen (`format: "auto"`).
- Parsing shows `Spinner` plus "Parsing bibliography...".
- Stats `Badge`s: found, already in notebook, new.
- The new papers are listed in a read-only grouped list (no checkboxes, as today).
- When every paper is already present, `Empty` shows "All papers from this file are already in your notebook."
- Submit "Import N paper(s)" bulk-uploads only the new papers, with `sourceType` `"zotero"` or `"mendeley"`.
- **Dedupe** moves to `features/sources/lib/paperDedupe.ts`, with TDD:
  - `paperKey(paper)`: the lowercased DOI if present, otherwise `title|firstAuthorSurname`, normalised as today.
  - `splitNewPapers(parsed, existing)` returns `{ fresh, duplicates }`.

## 4. Primitives

- **`Progress`:** add it with `bunx --bun shadcn@latest add progress`, then apply the usual post-add fixes (the `cn` import, bogus deps). Track `bg-muted`, indicator `bg-primary`.
  - Add a destructive state: a `variant` on the indicator through cva, or a `data-*` hook the page sets.
  - The indicator's `transform` inline style lives in `ui/**`, which is lint-exempt.
  - Add it to the ui smoke test.
- **No other new primitives:** Dialog, Field, InputGroup, Tabs, Item, Checkbox, Badge, Alert, Empty, Spinner and Card cover everything else.

## 5. Tests, e2e and enforcement

**Unit tests (new, `add-source/*.test.tsx`):**
- **`AddSourceDialog`:**
  - opens on the menu with the dialog named "Add sources";
  - an option goes to its step (the title changes) and Back returns;
  - closing and reopening lands on the menu;
  - every option is disabled when signed out or at the limit;
  - Escape is blocked while a form reports busy;
  - the footer shows `N / M` and "…" while limits load.
- **`UrlForm`:**
  - invalid input toasts the exact message;
  - Cmd/Ctrl+Enter submits;
  - success calls `onDone`;
  - a rejected upload keeps the form.
- **`TextForm`:** submit is disabled when the input is blank.
- **`ManualPaperForm`:** the fields are reachable by label, submit is disabled until Title and Authors are filled, and the payload is right.
- **`BibtexImportForm`:**
  - parse results render checkboxes, all checked;
  - deselecting updates the submit count;
  - RIS content is detected.
- **`paperDedupe.test.ts`:** matches by DOI case-insensitively, falls back to the title and author surname, and splits fresh from duplicates.

Mock the Convex hooks (`documentsApi`) as the existing panel tests do.

**e2e** (repo-root `e2e/`):
- `helpers/navigation.ts`: `openAddSourceModal` waits for `getByRole("dialog", { name: "Add sources" })`.
- `sources/add-source-modal.spec.ts`: `modalDiscoverButton` becomes `getByRole("dialog").getByRole("button", { name: "Discover sources" })`, and the doc comment is updated.
- `helpers/source-assertions.ts`: scope option and submit buttons to the dialog. "Add Source" is now inside the dialog, so `.last()` is no longer needed.
- `sources/file-uploads.spec.ts`: `div[class*='border-dashed']` becomes `getByTestId("source-dropzone")`.
- `sources/url-ingestion.spec.ts`: scope to the dialog as needed. The toast text assertion is unchanged.
- Verify that `bunx playwright test --list` parses.

**Enforcement:**
- Add `"src/features/sources/components/add-source/**/*.tsx"` to `MIGRATED` in `apps/web/eslint.config.mjs`.
- Every file in the folder reaches 0 findings.
- Run `bun run lint:design:update` to lock in the drop for `features/sources`. The `no-inline-styles` count should reach 0.

**Gates:**
- `typecheck:web`
- `typecheck:convex`
- `bun run lint`
- `test:web`
- `lint:design`

**Visual check** (by the controller, with the user, before pushing):
- At 390px and on desktop, in light and dark:
  - the menu: idle, dragging, disabled at the limit and signed out;
  - each form step;
  - a DOI preview;
  - BibTeX results;
  - library results and the empty state.
