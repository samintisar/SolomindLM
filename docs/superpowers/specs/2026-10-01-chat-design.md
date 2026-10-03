# Chat: design-system migration

**Issue:** #260 (part of #265)
**Scope decision:** option A. Restyle and polish on shadcn, keeping the same features and behaviour, with targeted file splits only where we touch code. No backend changes.
**Branch:** `feature/ds-migrate-chat`, stacked on `feature/ds-migrate-notebooks` (#269). It needs z-100 portal layers, sans controls, card border tokens and `button-group`. Retarget to `main` once #269 merges.
**Inventory (file:line facts this spec relies on):** `docs/superpowers/notes/2026-10-01-chat-ui-inventory.md`. Line numbers there are as of `0d8976c1`.

## Problem

`apps/web/src/features/chat` has 19 components, about 5,800 lines, and 116 design-lint findings: 79 arbitrary values, 23 inline styles and 14 raw colours. It imports nothing from `@/shared/components/ui`. Every floating surface is hand-built:
- composer drop-ups (`createPortal` + `useAnchoredPosition`, z-200)
- the conversation-row menu
- the history panel
- the citation tooltip (manual `getBoundingClientRect` math inside the 1,060-line `ChatPanel.tsx`)
- two modals (`fixed inset-0 z-120`).

Known defects:
- **Citation tooltip:**
  - Leaving the tooltip rarely hides it, because a stale `isTooltipHovered` closure means it only closes on a click outside.
  - On touch, tapping a citation toggles twice: `onTouchStart` and `onClick` both fire.
  - A tooltip placed above a citation overlaps it by about 64px (it is `h-80`, but the code offsets by 256px).
  - It doesn't reposition on scroll or resize.
- **Mojibake in `ChatPanel.tsx`:** the user-visible "Note Â· Saved Chat", the aria-label "Creatingâ€¦", and a corrupted regex in a duplicate `stripRefs`.
- **`MessageBubble`:** defines `ActionBar`, `ThinkingIndicator` and `FollowUpChips` inside its render body, so they remount on every render. Its memo comparator also ignores handler props (stale-closure risk).
- **The e2e chat suite is stale:**
  - `button[title="Research options"]` doesn't exist.
  - `openComposerModeMenu` is imported but not exported.
  - "Deep research" pill assertions point at controls that are gone.

## Design

### 1. Panel header and history
- **Header:** "Chat" in sans (`text-sm font-semibold`), not uppercase. The header actions are `Button variant="outline" size="icon-sm"`, each wrapped in a `Tooltip`:
  - Open Sources and Open Studio (desktop only); keep `title`/`aria-label` "Open Studio", which e2e uses.
  - History, New chat, Chat options.
- **History:** a `Popover` (`align="end"`) holding a `ScrollArea` capped by Radix's available height, with `ConversationList` inside.
  - The click-outside/Escape effect and the `[data-thread-submenu-root]`/`[data-confirm-dialog-root]` guards are removed.
- **Chat options:** shadcn `DropdownMenu` with Configure chat, Export chat, Save to note, a separator, then Pin/Unpin chat. This replaces chat's use of the hand-rolled `@/shared/ui/DropdownMenu`; studio keeps using it.
- **`ConversationList` rows:**
  - A per-row `DropdownMenu` (`modal={false}`) with Pin/Unpin, Rename and Delete. This removes the shared portaled menu, `useAnchoredPosition`, and the scroll/resize/pointerdown listeners.
  - Inline rename uses `Input`.
  - Delete confirm: keep `useConfirmDialog` (shared, tracked in #262), but render its component **outside** the history `Popover` so closing the popover can't unmount an open confirm.
  - Section labels and "No other threads" use tokens.

### 2. Messages (`MessageBubble`)
- **Structure:** `ActionBar`, `ThinkingIndicator` and `FollowUpChips` become module-level components. The memo comparator includes the handler props it reads ; this fixes the stale-closure risk.
- **User message:** a right-aligned plain element (`rounded-2xl bg-secondary px-4 py-2.5 text-secondary-foreground`), not a `Card`. It replaces the `bg-[color-mix(...)]` arbitrary value. If `secondary` reads wrong in the visual check, add a `--chat-user-bubble` token in `index.css` and use it as `bg-chat-user-bubble`.
  - It keeps `data-message-id` and the `items-start`/assistant class contract the e2e helpers use.
- **Assistant message:** serif body, no bubble. The `.prose.max-w-none` wrapper in `messageRendering.tsx` is unchanged.
- **Action row:** `Button variant="ghost" size="icon-sm"` with `Tooltip` and `aria-label` for Copy, Retry, Helpful and Not helpful.
  - The bar shows on hover/focus-within on desktop and always on touch (`pointer-coarse:`).
  - The sources pill becomes `Button variant="outline" size="sm"` holding the favicon stack. The stack uses `-space-x-2`, not inline margins and z-indexes.
- **Thinking indicator:**
  - Dots and pings use CSS `animate-*` utilities and `delay-*`, not inline `style`.
  - A text shimmer on "Thinking…" via a small `@utility` in `index.css` that respects reduced motion.
- **Status chip:** "Searched sources for … · 2 results" becomes a muted inline chip: `Badge variant="secondary"`.
- **Entrance:** new messages use the house CSS entrance (`animate-in fade-in slide-in-from-bottom-2 duration-320 ease-out`). The streaming row (`__streaming__`) doesn't re-animate as it grows.
- **Follow-up chips:** `Button variant="outline" size="sm"`.

### 3. Citations (`CitationPopover`, new)
- **One controlled Radix `Popover` per `ChatPanel`,** anchored with `PopoverAnchor virtualRef` to the hovered or tapped citation element (the same pattern as `TourTooltip`). This works with Virtuoso, which unmounts off-screen rows; a `PopoverTrigger` per citation would not.
- **Open/close behaviour:**
  - Desktop: hover intent opens it after about 80ms and closes it about 150ms after leaving both the chip and the content. The content's `onPointerEnter`/`onPointerLeave` cancel and arm the close.
  - Touch and click: the chip toggles on `onClick` only. `onTouchStart` is removed (it caused the double toggle).
  - Escape and click-outside are handled by Radix.
- **Content (moved out of `ReferenceTooltip.tsx`, restyled):**
  - a header with the source title, linked or clickable as today
  - the snippet rendered by the existing lazy `MarkdownRenderer`, in a `ScrollArea` with a fixed max height (`max-h-64`)
  - "Add to notebook" as `Button size="sm"`.
  
  Width is `w-96` with Radix collision padding of 16.
- **Removed from `ChatPanel`:** `tooltipPosition`, `tooltipStyle`, `isTooltipHovered`, `tooltipRef`, the click-outside effect and the placement `useMemo`. What stays is the `{ messageId, refId, anchor element }` state, plus the existing logic for open-in-sources and add-to-notebook.
- **Citation chip** (`messageRendering.tsx`): keeps `title="Reference N"` (e2e). It becomes `role="button"`, `tabIndex=0`, opens on Enter, uses an `align-middle` class instead of inline style, and uses token classes.

### 4. Composer (`ChatInput` → `composer/*`)
- **Shell:** `InputGroup` (`size="lg"`) keeps `data-onboarding="chat-input"` and the `@container/chat-input` container queries. The textarea becomes `InputGroupTextarea` with `field-sizing-content` and `max-h-40`, which replaces the imperative `fitTextareaHeight` and its `ResizeObserver`.
  - Enter sends unless Shift is held **or `event.nativeEvent.isComposing`**, a new IME guard.
  - Placeholders are unchanged (e2e).
- **Toolbar controls, split into `components/composer/`:**
  - `ModeMenu`: `DropdownMenu` + `DropdownMenuRadioGroup`, `side="top"`. Options Chat, Deep Research and Literature Review use `role="menuitemradio"`. The trigger keeps `aria-label="Composer mode: …"`.
  - `ResearchDatabaseMenu`: `Popover side="top"` with a new shadcn `RadioGroup` of All Papers, PubMed and ArXiv, each with an icon and description.
  - `FiltersPopover`: `Popover side="top"` with a "Source channels" list of new shadcn `Checkbox` + `Label` rows (Notebook sources, Academic, Web, News, Finance).
    - It keeps the rule that the last active channel can't be removed.
    - It hosts `AcademicDiscoveryFiltersSection` from the sources feature unchanged; that component is restyled in #261.
  - `ModelMenu`: `DropdownMenu` + radio items. The trigger shows `ModelBrandIcon` and the name, with the existing container-query hiding.
  - `VoiceButton`: `Button variant="ghost" size="icon-sm"` with `aria-pressed`. While recording it shows the pinging dot and an `aria-live` timer; while transcribing, `Spinner`. Titles are unchanged.
  - `SendButton`: `Button size="icon-sm"` with states send, stop (`variant="destructive"`), remote-generating and loading. It keeps `title` values containing "(Enter)" (e2e `sendMessage`).
- **Removed:** `ComposerDropUp`, the click-outside/Escape effect, and the `openMenu` union state (each Radix control owns its open state; the corpus menu still closes when it becomes hidden).
- **Constants and types** (`CHAT_DEFAULT_SOURCE_FILTERS`, `ChatComposerMode`, …) keep their exports from `ChatInput.tsx` or move to `composer/constants.ts`, updating `usePersistedComposerPrefs` and `composerPrefsStorage` imports.
- **Disclaimer line:** `text-xs text-muted-foreground`.

### 5. Research and literature-review UI
- **`AgentActivityPanel`:**
  - The disclosure becomes the new shadcn `Collapsible`; open state still persists in `sessionStorage`.
  - The grounding callout becomes `Alert` with a new `warning` variant (`bg-warning-muted` / `text-warning-muted-foreground` / `border-warning-border`), replacing 12 amber tokens.
  - Source badges become `Badge variant="outline"`.
- **`DeepResearchSourcesSection`:** `Collapsible` with `Card`. "Used in answer" and "Searched only" become `Badge` variants.
- **`LiteratureReviewSteps`:**
  - The completed check uses `text-success`.
  - The connector line uses `left-1/2 -translate-x-1/2`.
  - Pills become `Badge`, or `Button variant="outline" size="sm"` when drill-down is available. The button names are unchanged (unit tests).
- **`ResearchPlanMessage` and `LiteratureReviewMessage`:**
  - The two divergent `ResultCard`s merge into one `components/ResultCard.tsx` on `Card variant="interactive"`.
  - Status cards become `Card`; the failed panel becomes `Alert variant="destructive"`.
  - Column confirmation uses `Checkbox` + `Input` + `Button`.
  - Cancel and "Approve & Research" become `Button`s (the copy is unchanged; e2e reads it).
- **Spinners:** every `Loader2 animate-spin` becomes `Spinner` (`aria-hidden` when next to text).

### 6. Dialogs
- **`ConfigureChatModal`:** `Dialog` (default size).
  - Instruction mode (Default, Learning Guide, Custom) becomes a `RadioGroup` of cards. A locked mode is disabled with the existing explanation.
  - Custom instructions use `Textarea` + `Field`, keeping the 10,000-character cap and read-only when locked.
  - Response length becomes a `ToggleGroup`.
  - Footer: Cancel and Save.
- **`ExternalSourcesModal`:** `Dialog size="wide"`, with select-all as `Button variant="link"`, rows of `Checkbox` + label + link, and a source-type `Badge`.
  - It moves from inside each assistant bubble to a single instance owned by `ChatPanel`, opened with that message's sources. This avoids one dialog per bubble.

### 7. Empty state
- `ChatEmptyState`:
  - starter prompts become `Button variant="outline"` chips (the "Quiz me on this material" text is unchanged)
  - the skeleton widths use `w-*` classes
  - the safe-area padding moves to a named `@utility` (no arbitrary value)
  - the header tile uses the notebook cover via `coverFillClass`.

### 8. Shared additions
- shadcn CLI: `checkbox`, `radio-group`, `collapsible` (usual `cn` import and dependency cleanup).
- `Alert` gets a `warning` variant.
- `index.css` gets small `@utility` helpers where a value can't be a theme token: the composer-clearance height `var(--chat-composer-clearance, …)`, the safe-area padding, and the shimmer. Arbitrary values are not allowed.

### 9. Housekeeping while touching
- Fix the mojibake strings and comments in `ChatPanel.tsx`. Delete the duplicate `stripRefs` in favour of `stripReferencesSection`.
- Remove the unused `confirm` destructure and the `ConfirmDialogComponent` render in `ChatPanel` if nothing calls `confirm`.
- `QuoteBlocks.tsx` (dead until #271): restyle to 0 findings only. No wiring.

## Out of scope
- quote-from-selection behaviour (#271)
- agent, prompt and streaming logic
- Streamdown/KaTeX rendering
- `AcademicDiscoveryFiltersSection` internals (#261)
- shared `ConfirmDialog` and the hand-rolled `shared/ui/DropdownMenu` (#262)
- which tab the phone view opens on

## Acceptance
- `src/features/chat/**` has **0** design-lint findings and is in `MIGRATED`. The baseline is lowered. Shared ui additions don't increase findings (CLI files go in `UPSTREAM_ARBITRARY` only for upstream idioms).
- **Citations:**
  - Hover opens and leaving closes on desktop.
  - A single tap toggles on touch.
  - The popover never covers its citation and stays on screen at the edges.
  - Keyboard: Tab to a citation, Enter opens it, Escape closes it.
- **Composer:** every control is reachable by keyboard and labelled. Menus open upwards and flip when there's no room. Enter sends; Shift+Enter and IME composition don't.
- **Dialogs and menus** sit above the app header and trap focus where modal.
- **Behaviour unchanged** for streaming, scroll-to-bottom, voice, mode/corpus/filter/model persistence, research-plan approve/reject, the literature-review flow, export and save-to-note.
- **Tests:**
  - New vitest coverage for the composer controls (mode, database, filters including the last-channel rule, model, send states, IME guard), `CitationPopover` (hover intent, tap toggle, Escape), `MessageBubble` action row, `ConversationList` menu and rename, `ConfigureChatModal`, `ExternalSourcesModal` and `ResultCard`.
  - Existing chat tests pass.
- **E2E helpers rewritten** for the real composer:
  - `openComposerModeMenu` exported
  - the role-based mode menu
  - `getByRole("checkbox", { name })` for channels
  - stale "Research options" and "Deep research pill" assertions removed or rewritten.
- `typecheck:web`, `typecheck:convex`, `lint`, `lint:design` and `test:web` all pass.
- Visual check at 390×844 and 1440×900:
  - empty state
  - a conversation with citations
  - each composer menu
  - the history popover with its row menu
  - Configure chat
  - the external sources dialog
  - deep-research and literature-review cards where data exists.
