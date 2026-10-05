# Studio on the design system, with a premium redesign (#264)

**Status:** approved 2026-10-04
**Issue:** #264, folding in #171 (mind map zoom), #177 (written-question header wrap) and #299 (editable spreadsheets), plus a new bug issue for the audio transcript sync. Rules: `.agents/skills/shadcn/SKILL.md`, `docs/design/principles.md`, the design-system notes in `CLAUDE.md`.
**Mockups:** the visual companion screens in `.superpowers/brainstorm/` (not committed): `generating.html`, `quiz-feel.html`, `flashcards-v3.html`, `spreadsheet.html` and `audio-v5.html`.

## Goal

`apps/web/src/features/studio` passes `lint:design` at 0 and joins `MIGRATED`, as #264 asks. Along the way, every Studio view gets a premium pass: motion that feels deliberate, rewarding feedback when studying, editable spreadsheets and an audio transcript that follows the audio.

## Scope

**380 findings** on `main` at 351bd3ce, split across eight PRs:

| PR | Area | Findings |
|---|---|---|
| 1 | Foundation and Studio panel: `StudioPanel`, `StudioPanelHeader`, `ToolGrid`, `NoteItem`, `NoteIcon`, `NoteListView`, `ActiveNoteView` | 23 |
| 2 | Quiz and written questions: `QuizView`, `WrittenQuestionsView` | 37 |
| 3 | Flashcards: `FlashcardView`, `StudyMode`, `EditCardModal`, `ProficiencyBadge` | 92 |
| 4 | Audio overview: `features/audio` player, plus the audio job in `convex/studio/audio` | 0 (already migrated; this PR is a redesign and a bug fix) |
| 5 | Spreadsheets: `SpreadsheetView`, plus `convex/studio/spreadsheets` | 0 (a redesign and a feature) |
| 6 | Reading views: `ReportView`, `UserNoteView`, `MindMapView`, `InfographicView` | 37 |
| 7 | Create dialogs: the seven `Customize*Modal`s, `DiscoverStudioPromptsModal`, `SaveAsPromptModal`, `StudioModalDiscoverPromptsButton`, `CitePaperModal`, `CitationStylePicker` | 118 |
| 8 | Literature review: `LiteratureTableView`, `LiteratureReportView`, `LiteratureScreeningPanel`, `LiteraturePapersPanel`, `LiteratureTablePaperCell`, `LiteratureTableExtractionCell`, `ColumnManager`, `PrismaFlowDiagram`, `LiteratureStudioView` | 73 |

The PRs land in this order and each one adds its own files to `MIGRATED` and lowers the baseline. PR 8 replaces the per-file globs with `src/features/studio/**/*.tsx`.

Some debt the lint cannot see is in scope too:
- **Type colours in lookup tables:** `NoteIcon`'s per-type map and the `color` field in `shared/constants/index.ts` (the Create grid) hold raw palette classes as strings.
- **Dead `prose-*` modifiers:** `prose-sm`, `prose-stone`, `dark:prose-invert` and about 30 `prose-h2:`-style variants generate no CSS, because the project has no typography plugin. Only the house `.prose` class in `index.css` exists.

**Out of scope:**
- **Upstream shadcn markup in `shared/components/ui/*`** (about 70 warnings): its own PR, since it needs the gallery screenshot baselines refreshed.
- **Landing (#263).**
- **A visual redesign of the Studio panel itself.** It keeps today's look, by the user's decision. Only its colours move into tokens and its generating state changes.

## Design

### 1. Motion foundation (PR 1)

**Reduced motion, gentle fallbacks.** Today `index.css` sets every animation and transition to 0.01ms under `prefers-reduced-motion: reduce`. On Windows with "Animation effects" off (the user's PC), the whole app stops moving, which is why the flashcard flip shows on their phone but not on their desktop. The rule is replaced with this policy:
- **Movement becomes a fade.** Under reduced motion, a global rule sets `--tw-enter-translate-x/y`, `--tw-exit-translate-x/y`, `--tw-enter-scale`, `--tw-exit-scale`, `--tw-enter-rotate` and `--tw-exit-rotate` back to their neutral values with `!important`. Every `animate-in`/`animate-out` (`tw-animate-css`) keeps its fade and loses its slide, zoom and spin. That covers dialogs, sheets, popovers and slide-ins app-wide.
- **Framer Motion is unchanged:** `MotionConfig reducedMotion="user"` already drops transform animations and keeps opacity.
- **Studio's own keyframes** each get an explicit reduced version:
  - the card flip becomes a cross-fade between faces;
  - the shake, burst and card throw are off;
  - count-ups jump to the final value;
  - the Sheen is off, while the progress bar still fills.
- **Spinners and progress bars keep moving,** as today.

The rule applies app-wide, so PR 1 checks chat, sources and notebooks with reduced motion on, at desktop and phone widths.

**Studio motion helpers** live in `features/studio/motion/` and ship in PR 2 with their first users (Knip fails CI on unused exports), so PRs 2 and 3 share them:
- **`useCountUp(target, { duration })`:** an eased number for scores and tallies. It returns the target at once under reduced motion.
- **`<Burst />`:** a small particle burst from an anchor element, using token colours. It renders nothing under reduced motion.
- **`useStreak()`:** tracks consecutive good answers. A streak chip shows from 2 in a row.
- **Keyframes:** PR 1 ships `studio-sheen`, `studio-bob`, `studio-pop`, `studio-glow` and the `Progress` sweep and glint in `index.css`, each paired with a reduced-motion rule; `studio-shake` comes with PR 2.

**Type colour tokens.** `--studio-audio`, `--studio-mindmap`, `--studio-report`, `--studio-flashcard`, `--studio-quiz`, `--studio-infographic`, `--studio-written`, `--studio-spreadsheet`, `--studio-note` and `--studio-literature`:
- **Values:** defined in `index.css` with light and dark values that reproduce today's hues (teal, fuchsia, amber, red, blue, violet, green, cyan, indigo and orange), exposed as `bg-studio-*` and `text-studio-*`.
- **Users:** `NoteIcon`, `ToolGrid` and `shared/constants` switch to the tokens. Nothing changes on screen.

**Generating state: Sheen.** A Saved item that is generating gets:
- **Sheen:** a soft light in the type's colour sweeps across the row about every 2.4 seconds.
- **Icon:** the type icon replaces today's spinner and bobs gently.
- **Step text:** the current step ("Drafting cards 5 of 8", from the stored `currentStep`) rolls up when it changes.
- **Progress:** the bar is indeterminate until the job reports a percentage, then fills smoothly with a moving glint.
- **When generation finishes,** the row glows briefly in the success colour, the icon pops, and the subtitle fades to the finished summary ("8 Flashcards · Medium").

### 2. Quiz and written questions: Rewarding (PR 2)

**Quiz:**
- **Progress:** a bar with one segment per question. Each segment fills in the success or destructive colour once that question is answered.
- **Options:** cards with an A–D key chip. They lift on hover and press in on click.
- **Feedback on answering:**
  - the correct option turns `success-muted` and its tick draws itself;
  - a wrong pick turns `destructive-muted` and shakes gently;
  - the other options fade back;
  - the explanation unfolds below.
- **Rewarding extras:**
  - a correct answer sends a small `Burst` from the option, and the running score in the footer bumps;
  - a streak chip ("🔥 3 in a row") appears after two correct answers in a row.
- **Transitions:** questions slide between each other, and Next gives a small nudge once you have answered.
- **Results:**
  - the score ring fills while the number counts up;
  - a headline matches the score;
  - one chip per question, coloured by result, can be tapped to review that question.
  - A perfect score gets a burst.
- **Hint:** stays as it is, in a `Popover`.

**Written questions:**
- **Grading:** submitting shows a grading shimmer on the answer. When the grade arrives, the score counts up, and the feedback and rubric unfold.
- **Shared motion:** the quiz's progress segments, streak and results screen.
- **#177:** the header wraps at word boundaries (`min-w-0`, `wrap-break-word`), and the count badge is `shrink-0`.

### 3. Flashcards: Deck (PR 3)

**Study mode:**
- **The deck:** the next two cards peek out behind the current one (offset and scaled).
- **The flip:** a 3D flip lifts slightly on hover. Today the flip depends on classes defined in an inline `<style>` element. The redesign uses the Tailwind utilities `perspective-*`, `transform-3d` and `backface-hidden`, plus a small `rotate-y-180` utility in `index.css`. The face swap at the midpoint stays, because `backface-visibility` alone is unreliable with composited children.
- **Ratings:** four buttons (Again, Hard, Good, Easy), each with its next interval as subtext. They have no number badges; keys 1–4 still work, through `aria-keyshortcuts` and a tooltip.
- **After a rating,** the card is thrown in that rating's direction: Again to the left, Good to the right, Easy upward, and Hard fades out. The next card rises from the stack.
  - Good and Easy send a `Burst` and build the streak.
  - The progress bar is stacked by rating colour.
- **Session complete:** a medal springs in, and a tally per rating counts up.
- **Reduced motion:** faces cross-fade, and cards fade in and out without moving.

**Browse and edit:**
- **Browse** uses the same card and flip.
- **Edit** uses `EditCardModal` on the shared `Dialog`.

**Colours:** rating and proficiency colours use semantic tokens: `destructive` for Again, `warning` for Hard, `success` for Good and `info` for Easy, in place of the emerald, rose and amber palette classes.

### 4. Audio overview: Reader, with real sync (PR 4)

**Bug (new issue):** the transcript never follows the audio. `AudioPlayer` renders `transcript` as one static block of text, and generation stores no timing. The job joins lines into a plain string and drops the speaker.

**Fix:**
- **Timing at synthesis:** each synthesis chunk already makes one WAV per script line. The chunk records each line's duration, worked out from the PCM data length, sample rate and channel count.
- **Saving the lines:** the assemble step adds the chunk offsets to those durations. Each chunk's offset is the decoded length of its MP3, so encoder padding can't drift. The result is saved on the overview as `metadata.lines: { speaker: "host_a" | "host_b", text: string, startMs: number, endMs: number }[]`. Lines that failed to synthesize are left out, because their audio is not in the file.
- **No schema change:** `metadata` is already `v.any()`.
- **Older overviews** have no `lines`. They split `transcript` on newlines, spread the duration in proportion to character count, and show a small "Approximate sync" note.

**Reader layout:**
- **The transcript is the main view,** styled like live lyrics:
  - large serif lines, each with its speaker label in that speaker's colour;
  - the current line is in full contrast at full size, and other lines are faded and slightly smaller;
  - the current line scrolls to the centre, inside a soft top and bottom fade mask.
- **Following:** clicking a line seeks to it. Scrolling by hand while the audio plays pauses following, and a "Follow along" pill brings it back.
- **The floating player card** has three rows:
  1. the title with its subtitle (type and hosts), and the speed pill on the right;
  2. a waveform scrubber, which can be clicked or dragged to seek, with the elapsed time and the total;
  3. centred transport controls: podcast-style skip back and forward buttons with "10" inside and a small twist on press, and a larger play button.
- **Speed pill:**
  - It cycles through 1×, 1.25×, 1.5× and 2×.
  - The number rolls as it changes.
  - The pill is filled whenever the speed isn't 1×.
- **Keyboard:** Space plays and pauses, and the arrow keys skip 10 seconds.
- **`MiniAudioPlayer`:** shares the new controls.

### 5. Spreadsheets: Sheet, editable (PR 5, closes #299)

**The sheet:**
- **Layout:**
  - the header row and the row numbers stay in place while scrolling;
  - columns of numbers are right-aligned with tabular figures.
- **Editing:** it is always editable for anyone who can edit the notebook.
  - Click a cell to select it.
  - Typing, double-click, Enter or F2 starts editing.
  - Enter moves down and Tab moves right; the arrow keys move between cells.
  - Escape cancels the edit, and Delete clears the cell.
- **Column header menu:** a `DropdownMenu` with Sort A→Z, Sort Z→A, Insert column right, Rename and Delete column.
- **Adding:** "+ Add row" at the bottom and "+" after the last column.
- **Saving:** a changed cell flashes softly. The header shows "Saving…", then "Saved · Edited".
- **Read-only viewers** get the same sheet without editing.
- **Phones:** tapping selects a cell, and a second tap edits it. No action is hover-only.

**Data and backend:**
- **Shared CSV module.** One `parseCsv`/`serializeCsv` pair, following RFC 4180, handles quoted cells, embedded commas, quotes and newlines.
  - It lives where both the web app and Convex can import it.
  - It replaces `SpreadsheetView`'s hand-rolled `parseCSV`, which splits on newlines before handling quotes, and `convex/_agents/spreadsheet/csvHelpers.ts` uses it too.
  - Required property: `serializeCsv(parseCsv(x))` equals the normalised `x`.
- **One update mutation.** `convex/studio/spreadsheets/index.ts` keeps `update`, the one the web app calls through `spreadsheetsApi.ts`. It removes the near-duplicate public `updateSpreadsheet`, which nothing calls. `update`:
  - checks `assertCanEditNotebook`;
  - checks the data is a string of at most 512 KB, with at most 2,000 rows and 50 columns;
  - sets `metadata.editedAt`.
- **Autosave:** the web app saves the whole CSV 800 ms after the last edit, and immediately when the view closes. If two people edit at once, the last save wins; notebooks have a single editor today.
- **Export:** CSV download serialises the current data.

### 6. Reading views (PR 6)

- **Report and note:**
  - The dead `prose-*` classes go. The house `.prose` styles the content, with a comfortable reading width and a fade-in on open.
  - Markdown tables, KaTeX maths and code blocks render as they do today; the visual check covers this.
- **Mind map (#171):**
  - It opens fitted to the view, with a minimum readable zoom of 60%.
  - Above 40 nodes it opens with only the root's children expanded.
  - The zoom controls become a `ButtonGroup`: zoom out, fit and zoom in.
- **Infographic:**
  - The image fades in from a blur once loaded.
  - Zoom and download controls use `Button`.

### 7. Create dialogs (PR 7)

- **Dialogs:**
  - Every Customize dialog uses `Dialog`, `Field`, `Label`, `Textarea`, `ToggleGroup` and `Select`, with layout-only classes at the call sites.
  - Their option chips become `ToggleGroup` items.
- **Discover prompts:**
  - Its hand-rolled modal (`bg-black/60`) and underline tabs become `Dialog` and `Tabs`.
  - Its 10–11px text becomes `text-xs`.
- **Infographic style previews:**
  - The per-style thumbnails (kawaii, anime, clay and others) move to `InfographicStyleThumbnail.tsx`.
  - `no-raw-colors`, `no-arbitrary-values` and `soft-surfaces` are turned off for that one file, as was done for `ModelBrandIcon`, because they illustrate the generated image's palette rather than app chrome.
  - The rest of the dialog is migrated normally.

### 8. Literature review (PR 8)

- **Primitives:**
  - The literature table and its cells use `Table`, `Badge` and `Tooltip`.
  - `Table` doesn't exist yet. PR 8 adds it with `bunx --bun shadcn@latest add table`, applying the usual CLI fix-ups (the `cn` import path, and dropping any extra dependencies it adds).
  - The `/dev/design` gallery gets a `Table` entry.
- **Menus:**
  - The three users of the legacy `shared/ui/DropdownMenu.tsx` (`LiteraturePapersPanel`, `LiteratureReportView` and `LiteratureTableView`) move to the shadcn `DropdownMenu`.
  - `shared/ui/DropdownMenu.tsx`, its `anchoredPosition` helper and its override in `eslint.config.mjs` are deleted.
- **Text size:** 10–12px text becomes `text-xs` (13px), the smallest step on the scale. The table gets slightly roomier.
- **Screening panel:** its `minmax(300px,…)` grid templates move to named CSS custom properties in the component, used as `grid-cols-(--screening-cols)`.
- **Colours:** neutral and status palette colours become `muted`, `warning` and `destructive` tokens.

## Error handling

- **Spreadsheet saves:**
  - A failed autosave keeps the edit on screen, shows "Couldn't save · Retry" in the header, and retries once after 3 seconds.
  - Validation errors (too large, too many rows) appear as a toast through `useServiceErrorToast` and roll back the last change.
- **Audio:**
  - If `metadata.lines` is malformed (bad times or the wrong length), the player falls back to the estimate and logs a warning.
  - If the audio fails to load, today's "Audio unavailable" state stays.
- **Quiz and written-question submissions** stay optimistic, as today. A failed submit shows a toast, and the answer stays selected so it can be resubmitted.

## Testing

- **Unit tests (vitest), written first:**
  - CSV parse and serialise round-trips: quotes, commas, newlines in cells, empty cells and ragged rows;
  - WAV duration maths and line-offset accumulation, including skipped lines;
  - the estimated-timing fallback;
  - `useCountUp` and `useStreak`;
  - the quiz result summary and the flashcard rating-to-throw-direction map.
- **`convex-test`:**
  - the spreadsheet `update` checks (permissions, size and row/column caps) and `editedAt`;
  - the audio assemble phase saves `metadata.lines` in order without failed lines.
- **Playwright:**
  - existing Studio selectors keep working;
  - new end-to-end tests edit a spreadsheet cell and see it persist after a reload, and seek audio by clicking a transcript line.
- **Design lint:** each PR's files reach 0 findings, and `lint:design:update` lowers the baseline.
- **Visual check:** each PR is checked at desktop (1440px) and phone (375px) widths, in light and dark, with reduced motion on and off, in the browser pane.

## Decisions log

| Question | Decision |
|---|---|
| Studio type colours | Keep today's hues, moved into `studio-*` tokens (the user tried a matte set and kept the original) |
| Infographic style previews | Exempt as illustrations in their own file |
| PR split | Eight PRs by area, in the order above |
| Reduced motion | Gentle fallbacks app-wide: movement becomes a fade, and spinners keep going |
| Generating item | Sheen |
| Quiz and written-question feel | Rewarding (burst, running score, streak) |
| Flashcard study | Deck, with no 1–4 badges on the rating buttons |
| Spreadsheet | Sheet: always editable, autosave |
| Audio overview | Reader, with the three-row floating player, podcast skip buttons and the rolling speed pill |
