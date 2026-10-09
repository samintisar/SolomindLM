# Chat UI inventory for shadcn migration (read-only; worktree `...\premium-ui-shadcn-linter-74efdb`)

Paths below are relative to `apps/web/src/features/chat/` unless they start with `e2e/` or `apps/web/`. "L" means line.

## 0. Headline findings (read first)

1. **Nothing in `features/chat` imports from `@/shared/components/ui` yet.** The design-lint baseline for `features/chat` (`apps/web/design-lint-baseline.json`) is 79 `no-arbitrary-values`, 23 `no-inline-styles` and 14 `no-raw-colors`, with zero `no-restyle`.
   - The 14 raw colours are exactly amber ×12 and green ×2. `bg-black/60` and `ring-black/5` are not counted.
   - The 23 inline styles are counted per CSS property, not per `style=` attribute.
   - `eslint.config.mjs` sets `no-restyle` to `allow: ["layout"]`. A className on a shadcn component may only carry layout classes, so looks must become variants in `ui/`.
2. **The e2e chat suite is already stale and does not match the current `ChatInput`.**
   - `e2e/helpers/chat-assertions.ts:13,24` uses `button[title="Research options"]`. No such control exists; the current toolbar has Mode, Research databases, Filters, Model, Mic and Send.
   - `e2e/chat/deep-research.spec.ts:3` imports `openComposerModeMenu`, which is **not exported** from `chat-assertions.ts`.
   - `chat-input.spec.ts` tests "Deep Research" as a button and a "Deep research" pill that no longer exist.
   - Plan the migration against the selectors in section 6, not against these specs. The e2e helpers need rewriting.
3. **No @mention popover, drag/drop, or file-attach exists in chat.** The grep for mention/drag/drop was empty. The only keyboard handling is Enter, Shift+Enter, Escape and rename Enter/Escape.
4. **`QuoteBlocks.tsx` and `contexts/SelectionQuoteContext.tsx` (including `useSelectionTooltip`) have no production importers.** Only their own tests import them. The `data-quotable*` attributes in `MessageBubble` feed that dead feature. Consider deleting rather than migrating.
5. **No shadcn Checkbox or RadioGroup exists in `ui/`.** Three places use native `<input type="checkbox">` (`ChatInput` L596, `ExternalSourcesModal` L139, `LiteratureReviewMessage` L384). The research-database list in `ChatInput` is a hand-made radio group.
6. **Mojibake in `ChatPanel.tsx`.** The file contains double-encoded UTF-8; confirmed with xxd: `c3 82 c2 b7` for "·".
   - L327: user-visible placeholder note `preview: "Note Â· Saved Chat"`.
   - L764: aria-label `"Creatingâ€¦"`.
   - L451 and L992: comments.
   - L495: `stripRefs` regex char class `[\d\s.,\-:â€“â€”]` is corrupt. It is a duplicate of `stripReferencesSection` in `utils/messageRendering.utils.ts:4`, which has the correct `–—`. Fix while touching it.

---

## 1. Per-file inventory

### Components (`components/`)

**`ChatPanel.tsx` (1060 lines)**
- Exports `ChatPanel: React.FC<ChatPanelProps>`.
- Props: `isLeftOpen`, `isRightOpen`, `toggleLeft`, `toggleRight`, `notebookId?`, `notebookTitle="Chat"`, `notebookIcon?`, `notebookCoverColor?`, `chatSettings?`, `onOpenNotebookSource?`, `onOpenLiteratureTable?`, `onOpenLiteratureReport?`, `onOpenRankedPapers?`, `onOpenScreeningDecisions?`.
- Importer: `features/notebooks/components/views/NotebookView.tsx` L7. Desktop use is L474 (inside a resizable `<Panel id="notebook-chat">`). Mobile use is L530 (tab "chat", with `toggleLeft/Right` no-ops).
- Structure is in section 8.

**`ChatInput.tsx` (824 lines)**
- Exports:
  - `ChatInput` (props below).
  - Constants/types: `CHAT_DEFAULT_SOURCE_FILTERS`, `DEEP_RESEARCH_DEFAULT_SOURCE_FILTERS`, `ChatComposerMode` (`"chat" | "deepResearch" | "literatureReview"`), `ResearchDatabaseOption` (`"all" | "pubmed" | "arxiv"`).
  - Internal: `ComposerDropUp` (L121-159).
- `ChatInputProps`: `value`, `onChange`, `onSend`, `disabled?`, `waitingOnRemoteGeneration?`, `isStreaming?`, `onStop?`, `notebookId?`, `onAppendTranscription?`, `onVoiceError?`, `mode`, `onModeChange`, `researchDatabase`, `onResearchDatabaseChange`, `sourceFilters?`, `onSourceFilterChange?`, `academicDiscoveryFilters?`, `onAcademicDiscoveryFiltersChange?`, `chatSettings?`, `onModelChange?`.
- Importers:
  - `ChatPanel.tsx` L41-46 (the component and the constants).
  - Type-only: `hooks/usePersistedComposerPrefs.ts:2` and `utils/composerPrefsStorage.ts:1,5`. Moving these types or constants means updating those files.
- Structure is in section 8.

**`MessageBubble.tsx` (466 lines)**
- Exports `MessageBubble = React.memo<MessageBubbleProps>` with a custom comparator at L446-464.
- Props: `message`, `isAssistantStreamActive?`, `refHandlers: RefHandlers`, `onCopyMessage`, `copiedMessageId`, `onSetFeedback?`, `onSendFollowUp?`, `onRetry?`, `externalSources?`, `onAddExternalSources?`, `showSourcesButton?`, `notebookId?`, `onOpenNotebookSource?`, `notebookDocumentIds?`.
- Importer: `ChatPanel.tsx` L50.
- Renders:
  - `AgentActivityPanel`, `DeepResearchSourcesSection` and `ExternalSourcesModal`.
  - An icon `ActionBar` (L163-228): `role="toolbar"`, copy / retry / thumbs-up / thumbs-down, plus a "N sources" pill button with stacked Favicons.
  - A `ThinkingIndicator` (L257-302).
  - `FollowUpChips` (L315-353).
- Hazard: `ActionBar`, `ThinkingIndicator` and `FollowUpChips` are **components defined inside the render body**. They remount on every parent render, which matters for Radix Tooltip/focus state.
- Hazard: the `memo` comparator **ignores** `refHandlers`, `onCopyMessage`, `onSetFeedback`, `onSendFollowUp`, `onRetry`, `onAddExternalSources`, `onOpenNotebookSource` and `notebookDocumentIds`. Changes in those props never re-render a bubble. This is a latent stale-closure bug for `handleRefClick`, which closes over `hoveredRefId`.
- `ExternalSourcesModal` is mounted inside each assistant bubble's content div (L432-438), not at the panel level.

**`ReferenceTooltip.tsx` (271 lines)**
- Exports `ReferenceTooltip: React.FC<ReferenceTooltipProps>`.
- Props: `hoveredRefId: number`, `tooltipRef`, `reference: ReferenceChunk`, `position {x,y}`, `onMouseEnter`, `onMouseLeave`, `onOpenInSources?`, `onAddToNotebook?`.
- Importer: `ChatPanel.tsx` L51 (render at L939-988).
- Contains:
  - A big `tooltipMarkdownComponents` map (L13-87), plus helper functions L89-151.
  - A lazy `MarkdownRenderer` (L7-9).
  - A fixed 384×320 card (`w-96 h-80`, L197).
  - A header that is a `<button>` / `<a>` / `<div>` depending on `onOpenInSources` / `sourceUrl` (L204-245).
  - A full-width "Add to notebook" button (L254-265).

**`ConversationList.tsx` (317 lines)**
- Exports `ConversationList` (function) with props `conversations`, `activeConversationId`, `onSelect`, `onRename`, `onDelete`, `pinnedIds?`, `onTogglePin?`.
- Importer: `ChatPanel.tsx` L48 (inside the history popover, L740-751).
- Includes:
  - Pinned/Recents sections (`SectionLabel`).
  - Rows with an inline rename `<input>` (L156-179).
  - A per-row `MoreVertical` trigger (L210-231).
  - A single shared portaled menu (L270-314) positioned with `useAnchoredPosition`.
  - Its own `useConfirmDialog` for delete (L56, L132-139, L269).

**`ConfigureChatModal.tsx` (302 lines)**
- Exports `ConfigureChatModal` with props `isOpen`, `onClose`, `onSave(settings)`, `chatSettings?`, `saving?`, `instructionModeLocked?`.
- Importer: `ChatPanel.tsx` L47 (L1050).
- Hand-rolled modal at L130-300:
  - Radio-card list for instruction mode (L169-226): Default / Learning Guide / Custom, with `aria-disabled` when locked.
  - Custom-instructions `<textarea>` with a 10000-char slice cap (L235-246).
  - Segmented control for response length (L258-277): Default / Longer / Shorter.
  - Footer Cancel / Save (L282-298).

**`ExternalSourcesModal.tsx` (211 lines)**
- Exports `ExternalSourcesModal` with props `isOpen`, `onClose`, `sources`, `onAddSelected`, `isLoading?`.
- Importer: `MessageBubble.tsx` L10.
- Hand-rolled modal. It has `role="dialog" aria-modal aria-labelledby="external-sources-modal-title"` at L85-87, a select-all toggle, and checkbox rows. The rows are `<label>` wrapping `<input type=checkbox aria-label="Include {title}">` and an `<a>`.

**`DeepResearchSourcesSection.tsx` (213 lines)**
- Exports `DeepResearchSourcesSection` with props `researchRunId`, `answerContent`, `notebookId?`, `onOpenNotebookSource?`, `notebookDocumentIds?`.
- Importer: `MessageBubble.tsx` L9.
- A collapsible "Sources searched" card with `STATUS_CLASS`, a custom `<ul>`, and badge-like spans for "Used in answer", "Searched only" and the source type.

**`AgentActivityPanel.tsx` (341 lines)**
- Exports `AgentActivityPanel = React.memo`, with props `isStreaming`, `activityPhase`, `activityDetail?`, `historicalPhase?`, `historicalDetail?`, `activityPhases`, `toolCalls`, `groundingChecks`, `references?`, `clarificationResponse?`.
- Importer: `MessageBubble.tsx` L8.
- A collapsible disclosure with a manual trigger button (L187-210) using `aria-expanded` / `aria-controls` / `role="region"`.
- Persists open state in `sessionStorage` key `solomind-chat-activity-open`.
- Contains the amber grounding callout (L295-322), the source list, and `SOURCE_BADGE_CLASS` (L14-17) badges that may be `<a>`.

**`ChatEmptyState.tsx` (129 lines)**
- Exports `ChatEmptyState` with props `onSendMessage`, `disabled?`, `sourceCount?`, `sourceSummary?`, `suggestions?`, `isLoadingSuggestions?`, `notebookIcon?`, `notebookCoverColor?`, `notebookTitle?`.
- Importer: `ChatPanel.tsx` L40 (L852).
- Starter-prompt chips are raw buttons (L114-123), skeletons are `animate-pulse` divs with inline widths (L104-110), and there is a header icon tile and a divider.

**`LiteratureReviewMessage.tsx` (512 lines)**
- Exports `LiteratureReviewMessage` with props `message`, `onOpenTable?`, `onOpenReport?`, `onOpenRankedPapers?`, `onOpenScreeningDecisions?`.
- Importer: `ChatPanel.tsx` L49.
- Internals:
  - `ColumnConfirmationCard` (L360-482), with checkbox + inline-edit `<input type=text>` + remove button per row, an "Add column" button, and a "Continue" button.
  - `ResultCard` (L493-512), a card-as-button with an arrow.
  - A failed-state panel (L316-339), with a raw "Retry from last step" button (L323-337).

**`LiteratureReviewSteps.tsx` (383 lines)**
- Exports `LiteratureReviewSteps` with props `steps`, `expandAll?`, `sessionId?`, `onOpenRankedPapers?`, `onOpenScreeningDecisions?`.
- Importers: `LiteratureReviewMessage.tsx` L14 and `ResearchPlanMessage.tsx` L7.
- A timeline with custom connector lines (inline style L125), a `StepStatusIcon` (L178-206), expandable step titles, and pill spans (`QUERY_PILL_CLASS` / `PILL_CLASS`, L39-43). The pills become `<button>` when drill-down is available.

**`ResearchPlanMessage.tsx` (312 lines)**
- Exports `ResearchPlanMessage` with props `planId`, `subQuestions`, `onApprove`, `onReject`, `onOpenTable?`, `onOpenReport?`.
- Importer: `ChatPanel.tsx` L52.
- A status card (draft / dismissed / failed), numbered sub-question list, channel pills (`CHANNEL_PILL_CLASS`, L23-24), a local `ResultCard` (L56-82, a **duplicate** of the one in `LiteratureReviewMessage`), and Cancel / "Approve & Research" buttons (L279-304).

**`QuoteBlocks.tsx` (40 lines)**
- Exports `QuoteBlocks` (no props, reads `useSelectionQuotes`). It has **no production importer**.
- Cards with an absolutely positioned X button (`aria-label="Remove quote"`).

**`researchStepTypes.ts` (72 lines)**
- Types and parsers: `ResearchStep`, `LiteratureReviewStepCounts`, `parseResearchStepMetadata`, `extractSearchQueriesFromDetails`.
- Importers: `LiteratureReviewMessage`, `LiteratureReviewSteps`, `utils/deepResearchSteps.ts`.

### Utils (`utils/`)

| File | Lines | Purpose / callers |
|---|---|---|
| `messageRendering.tsx` | 99 | `renderMessageWithReferences()`: Streamdown markdown plus citation pills. Callers: `MessageBubble` L371 and L410. |
| `messageRendering.utils.ts` | 20 | `stripReferencesSection`, `RefHandlers` interface. Callers: `ChatPanel`, `MessageBubble`, `messageRendering`. |
| `MarkdownRendererLazy.tsx` | 5 | `lazy()` wrapper for `@/shared/components/MarkdownRenderer`. Caller: `messageRendering`. |
| `messageStatus.tsx` | 65 | `getStatusIcon`, `getStatusMessage`. Callers: `MessageBubble`, `AgentActivityPanel`. |
| `citationMarkers.ts` | 39 | `replaceCitationMarkersOutsideMath`, which turns `[n]` into `CITE:n` outside `$`/`$$` math. Caller: `messageRendering`. |
| `aggregateRetrievalSources.ts` | 215 | Aggregates references into source rows. Caller: `AgentActivityPanel`. |
| `deepResearchSources.ts` | 121 | Caller: `DeepResearchSourcesSection`. |
| `deepResearchSteps.ts` | 61 | Caller: `ResearchPlanMessage`. |
| `literatureReportPreview.ts` | 81 | Caller: `LiteratureReviewMessage`. |
| `literatureReviewStepDrilldown.ts` | 9 | Caller: `LiteratureReviewSteps`. |
| `exportChat.ts` | 60 | `exportAsMarkdown`. Caller: `ChatPanel` L38. |
| `chatStreamHelpers.ts` | 65 | Caller: `hooks/useChatStream.ts` L31. |
| `composerPrefsStorage.ts` | 107 | Caller: `usePersistedComposerPrefs`. |

### Other non-component files (context, not for the UI migration)
- Hooks:
  - `useChatStream.ts` (919). It creates the synthetic rows `__streaming__` (L671) and `__remote_generating__` (L699). Imported by `App.tsx`.
  - `useChatVoiceTranscription.ts` (311). Used by `ChatInput` L36.
  - `useComposerClearance.ts` (55). Used by `ChatPanel` L30.
  - `usePersistedComposerPrefs.ts`, `useStartLiteratureReview.ts`, `useConversationCRUD.ts` (imported by `App.tsx`).
- Context: `contexts/SelectionQuoteContext.tsx` (dead feature, see above).
- Plumbing: `ChatStreamingContext.tsx` (Provider, used by `App.tsx`), `useChatStreaming.ts` (context + hook), `chatStreamTypes.ts`.
- Services: `chatApi.ts`, `chatStream.ts`, `literatureReviewApi.ts`, `researchApi.ts`, `userNotesApi.ts`. `useNoteCRUD.ts` in studio imports `userNotesApi`.

### Shared pieces chat depends on
- `@/shared/ui/DropdownMenu.tsx`: hand-rolled, portaled, uses `useAnchoredPosition`. Used by `ChatPanel` plus 3 studio files (`LiteraturePapersPanel`, `LiteratureReportView`, `LiteratureTableView`).
- `@/shared/ui/useConfirmDialog.tsx` and `ConfirmDialog.tsx`: hand-rolled `fixed inset-0 z-300` alert dialog with `data-confirm-dialog-root`. Used by `BillingPage`, `FolderCard`, `NotebookCard`, `SourcesPanel`, `StudioPanel`, `ChatPanel`, `ConversationList`.
- `@/shared/ui/anchoredPosition.ts` exports `useAnchoredPosition`. **Every user across `apps/web/src`:**
  1. `features/chat/components/ChatInput.tsx` L34 (import), L139 (`side:"top"`, `align` from prop). Used inside `ComposerDropUp`, which serves all four composer drop-ups.
  2. `features/chat/components/ConversationList.tsx` L6, L46 (`side:"bottom"`, `align:"end"`, `repositionKey: threadMenu?.convId`).
  3. `features/studio/components/NoteItem.tsx` L5, L50 (`side:"bottom"`, `align:"end"`).
  4. `shared/ui/DropdownMenu.tsx` L3, L19.
  - It returns `{style, side}`, sets the CSS var `--anchored-max-height` and flips `top`/`bottom`. Panels consume the var via `max-h-(--anchored-max-height)` (ChatInput L414, L472, L547, L579, L666; ConversationList L277; DropdownMenu L92).
- `AcademicDiscoveryFiltersSection` (`features/sources/components/`): used inside the Filters drop-up (`ChatInput` L549, L608). It also exports `buildAcademicDiscoveryApiFilters` and `DiscoveryAcademicFilterState`, which `ChatPanel` imports at L17-20. It is a hand-rolled UI (~72 class-bearing elements) that must be migrated together with the drop-up.

---

## 2. Hand-rolled UI patterns that should become shadcn

### 2a. Custom modals (`fixed inset-0`)
- `ConfigureChatModal.tsx` L131-300.
  - Wrapper `fixed inset-0 z-120` plus a `bg-black/60 backdrop-blur-sm` scrim div with `onClick={onClose}` (L132).
  - Panel `max-w-xl max-h-[90vh] flex-col`, with header (L139-152), scrolling body (L154-279) and footer (L282-298).
  - No `role="dialog"` and no focus trap. Replace with `Dialog` (`size wide`/`padding none` variants or the default) plus `DialogHeader`/`DialogFooter`.
  - Radix Dialog sits at z-100 (`dialog.tsx` overlay/content).
- `ExternalSourcesModal.tsx` L77-209. Same structure: scrim L78-82, `role="dialog"` L85, header L91-109, select-all bar L111-122, scroll list L124-183, footer L185-207.
- Both modals are controlled by an `isOpen` prop and return `null` when closed (L119 / L72-74), so Dialog's `open`/`onOpenChange` maps directly.
- `ChatPanel.tsx` L732-754: the history "dialog". `role="dialog" aria-label="Thread history"`, `absolute top-full right-0 z-50 w-80`, with the inline style `maxHeight: min(480px, calc(100vh - 100px))` at L737. Becomes a `Popover` with `ScrollArea`.
- `ConfirmDialog` (shared) is portaled with `z-300`. It is used for thread delete, and `ChatPanel` renders `<ConfirmDialogComponent />` at L1049 although `confirm` is never called in `ChatPanel` (L188 destructures only the component). Replace with `AlertDialog`.

### 2b. `createPortal` popovers / drop-ups / menus
- `ChatInput.tsx` L130-159 `ComposerDropUp`: `createPortal(..., document.body)`, `useAnchoredPosition(anchorRef, panelRef, open, {side:"top", align})`, inline `style={{...style, zIndex:200}}`, and `data-side`.
  - Used 5 times:
    - Mode (L410-444, `w-60`, listbox).
    - Corpus (L468-524, `w-80`, listbox).
    - Filters for literature mode (L543-554, `w-76`, wraps `AcademicDiscoveryFiltersSection`).
    - Filters for chat / deep research (L575-613, `w-76`, checkbox list).
    - Model (L661-711, `min-w-54 max-w-72`, `align="right"`, listbox).
  - All are drop-ups (side `top`), flipping to the bottom when there is no room.
  - Candidates: `DropdownMenu` (radio / checkbox items) or `Popover` (`side="top"`, collision flip is built into Radix), or `Select`.
  - Content with icons plus descriptions (corpus) and embedded forms (filters) fits `Popover` best.
- `ConversationList.tsx` L270-314: single shared `role="menu"` portaled menu (`fixed z-200`, `data-thread-submenu-root`). Items are Pin/Unpin, Rename, Delete, each a raw `<button role="menuitem">`. Becomes a per-row `DropdownMenu`, which removes the `data-thread-menu-trigger` / `data-thread-submenu-root` hacks.
- `ChatPanel.tsx` L772-823 uses the shared `DropdownMenu` ("Chat options" trigger, items Configure chat / Export chat / Save to note / separator / Pin or Unpin chat). It uses raw `<button role="menuitem" ...>` children and a manual `<div className="my-1 border-t">` separator. Migrate to shadcn `DropdownMenu` + `DropdownMenuItem` + `DropdownMenuSeparator`.
- `shared/ui/DropdownMenu.tsx` closes itself on menu click via `closest('[role="menuitem"]')`.

### 2c. Manual tooltip positioning, `ChatPanel` + `ReferenceTooltip` (exact ranges)
State (L123-127):
- `hoveredRefId: number|null`
- `hoveredMessageId: string|null`
- `tooltipPosition: "top"|"bottom"`
- `tooltipStyle: {top?,left?}`
- `isTooltipHovered`

Refs: `messagesContainerRef` L292, `tooltipRef` L293, `hideTooltipTimeoutRef` L294.

Handlers:
- `closeTooltip` L370-375.
- `handleRefEnter` L377-379, which clears the hide timer.
- `handleRefLeave` L381-389: 150 ms timer; hides only if `!isTooltipHovered`, which is a captured dep.
- `handleRefHover` L391-411:
  - Reads `event.currentTarget.getBoundingClientRect()` and `messagesContainerRef.current.getBoundingClientRect()`.
  - Picks `"top"` if space above is greater than space below.
  - Stores container-relative `{left: center X, top: refTop-2 | refTop+height+2}`.
- `handleRefClick` L413-426:
  - Calls `preventDefault` and `stopPropagation`.
  - Toggles off if the same ref and message are already open, otherwise calls `handleRefHover(event as MouseEvent)`.
- Click-outside effect L428-441:
  - Listens on `document` for `mousedown` and `touchstart`.
  - Ignores clicks inside `tooltipRef` and clicks on `span[title^="Reference"]`.
- `refHandlers` memo L443-446: `{onRefHover, onRefLeave, onRefClick}`.
- `tooltipContent` useMemo L636-662:
  - Looks up `messages.find(id)`. The reference is `refsArray[hoveredRefId-1]`, falling back to `r.id === hoveredRefId`.
  - Hard-coded `tooltipWidth = 384` and a `256` height offset.
  - `x` is clamped to the container with a 16 px margin.
  - `y = containerTop + tooltipStyle.top - 256 - 2` (top) or `containerTop + tooltipStyle.top` (bottom).
  - Deps: `[hoveredRefId, hoveredMessageId, messages, tooltipStyle, tooltipPosition]`. It is **not** recomputed on scroll or resize.
- `handleOpenReferenceInSources` L664-679.

Render, L938-988: `<ReferenceTooltip>` inside `messagesContainerRef`. Props passed:
- `hoveredRefId={hoveredRefId!}`
- `tooltipRef={tooltipRef}`
- `reference={tooltipContent.ref}`
- `position={{x: tooltipContent.x, y: tooltipContent.y}}`
- `onOpenInSources`: an IIFE (L945-951) returning `() => handleOpenReferenceInSources(ref)` only if `ref.documentId?.trim()` exists, `onOpenNotebookSource` is set and `sources.some(s => s.id === docId)`.
- `onAddToNotebook`: an IIFE (L952-973) active only when `!ref.documentId && !!ref.sourceUrl` and `notebookId` is set. It calls `addExternalSourcesMutation({notebookId, sources:[{title: ref.sourceTitle, url: ref.sourceUrl, snippet: ref.content.slice(0,500), sourceType:"web"}]})`.
- `onMouseEnter`: sets `isTooltipHovered(true)` and clears the timer (L974-977).
- `onMouseLeave`: sets `isTooltipHovered(false)`, then a 100 ms timer (L978-986).

`MessageBubble` receives `refHandlers={refHandlers}` (L895). `renderMessageWithReferences` (`utils/messageRendering.tsx` L68-91) turns inline code starting `CITE:` into a `<span>` with:
- `onMouseEnter` → `onRefHover(refId, messageId, e)`
- `onMouseLeave` → `onRefLeave`
- `onClick` → `onRefClick`
- `onTouchStart` → `onRefClick`
- `title="Reference N"`, `style={{verticalAlign:"middle"}}`, `touch-manipulation`
- classes `w-5 h-5 rounded-xl bg-primary ...`

`ReferenceTooltip` root (L190-196) is `fixed z-50` with inline style `{left, top, pointerEvents:"auto"}`. Inside is the card `bg-popover border rounded-2xl shadow-xl p-4 sm:p-5 w-96 max-w-[calc(100vw-2rem)] h-80 animate-in fade-in zoom-in-95`.

Quirks to be aware of:
- The tooltip is 320 px tall (`h-80`) but the placement math subtracts 256, so a top-placed tooltip overlaps the citation by about 64 px.
- Because `onMouseLeave` captures the render-time `isTooltipHovered`, which is `true` while hovered, leaving the tooltip probably never hides it. It only closes by click-outside.
- On touch, both `onTouchStart` and the synthetic `onClick` call `onRefClick`, which toggles twice. `preventDefault` inside a React `touchstart` is passive and ineffective.
- Migration target: `Popover` with `PopoverAnchor`, or a `Tooltip`/hover-card pattern anchored to the citation span.
  - Radix handles collision and flip, so the manual math and `tooltipRef` click-outside effect go away.
  - Keep `title="Reference N"` or update `ChatPanel` L432 and the e2e `getByTitle`.
  - Wrapping every citation span in `PopoverTrigger asChild` is the likely route, but the Virtuoso virtualization unmounts off-screen rows.

### 2d. Click-outside / Escape listeners
- `ChatPanel.tsx` L194-220 (history popover): `mousedown` plus `keydown(Escape)` on `document`, with guards for `[data-thread-submenu-root]` and `[data-confirm-dialog-root]`. Radix Popover removes this.
- `ChatPanel.tsx` L428-441 (citation tooltip), see 2c.
- `ChatInput.tsx` L295-318: `mousedown` + `keydown(Escape)`, registered inside `setTimeout(0)`, over `menuInteractionRefs(openMenu)` (a function re-created every render, so the effect resubscribes each render).
- `ChatInput.tsx` L320-324: closes the corpus menu when `showResearchDatabases` turns false.
- `ConversationList.tsx` L86-99: closes the menu on any capture-phase `scroll` outside the menu and on `resize`.
- `ConversationList.tsx` L101-111: capture `pointerdown` outside, ignoring `[data-thread-menu-trigger]`.
- `shared/ui/DropdownMenu.tsx` L25-49 (shared).

### 2e. Raw `<button>`s that are buttons / icon buttons
- `ChatPanel.tsx`:
  - Header icon buttons L699 (title "Open Sources"), L708 (title "Open Studio", also `data-onboarding="studio-panel-toggle"`), L719 (History), L756 (New chat), L775 (Chat options trigger).
  - Menu items L785, L793, L801, L810.
  - All are `p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent`. These map to `Button variant="outline" size="icon-sm"` (or `icon`).
- `ChatInput.tsx`: Mode L385, Research databases L450, Filters L531 and L561, Model L621, Mic L736, Send/Stop L780.
  - The send button is a 32 px (`size-8`) `rounded-lg` icon button with variant colours: primary, destructive when streaming, and muted-bordered when `waitingOnRemoteGeneration`.
- `MessageBubble.tsx`: action icon buttons L180-195, sources pill L200-225, follow-up rows L322-348.
- `ConversationList.tsx`: rename check/X L166-179, row select L192, trigger L210.
- `ConfigureChatModal.tsx`: close L144, mode cards L175, length segments L262, Cancel L283, Save L290.
- `ExternalSourcesModal.tsx`: close L101, select-all link-button L112, Cancel L186, Add L194.
- `DeepResearchSourcesSection.tsx`: accordion header L103, per-source action buttons L178 and L195, plus `<a>` styled as an outline button L168.
- `LiteratureReviewMessage.tsx`: Retry L323, remove-column L420, Add column L435, Continue L461, `ResultCard` L495.
- `LiteratureReviewSteps.tsx`: step title toggle L134, drill-down pill buttons L309 and L356.
- `ResearchPlanMessage.tsx`: `ResultCard` L68, Cancel L279, Approve L287.
- `ReferenceTooltip.tsx`: L205 (header), L254 (Add to notebook).
- `ChatEmptyState.tsx` L114: suggestion chips.
- `AgentActivityPanel.tsx` L187: disclosure trigger.
- `QuoteBlocks.tsx` L18: remove quote.
- Candidates:
  - `Button` variants (default / outline / ghost / ghost-destructive / secondary / link, sizes icon / icon-sm).
  - Segmented controls (response length, mode) → `ToggleGroup`/`Tabs`.
  - Disclosures (AgentActivityPanel, DeepResearchSourcesSection, LiteratureReviewSteps) have no Collapsible/Accordion in `ui/`; add one or use `Button variant="link"`.

### 2f. Manually styled `<textarea>` / `<input>`
- `ChatInput.tsx` L367-376: the main composer `<textarea>`.
  - Classes: `bg-transparent border-none resize-none outline-none max-h-[160px] font-serif text-sm leading-snug`.
  - Auto-grow is done **imperatively**: `fitTextareaHeight` L267-273 sets `style.height = "0px"` then `min(scrollHeight,160)px`, run in `useLayoutEffect` L275-277 plus a `ResizeObserver` L281-293.
  - shadcn `Textarea` (`textarea.tsx`) already uses `field-sizing-content`. The `min-h-16`, border and shadow would need overriding via `InputGroup` / `InputGroupTextarea` (it exists in `ui/`).
  - `InputGroup` (size lg) with `InputGroupAddon` is the natural shell for textarea + toolbar.
- `ConfigureChatModal.tsx` L235-246: `<textarea>` `h-36 resize-none`, `readOnly` when locked, 10000-char slice. Maps to `Textarea` + `Field`/`Label`.
- `ConversationList.tsx` L156-164: inline rename `<input>` with no border/outline, focused and selected via an effect (L59-64). Maps to `Input`.
- `LiteratureReviewMessage.tsx` L397-411: column-name `<input type=text>` (borderless, strike-through when disabled).
- Native checkboxes at `ChatInput.tsx` L596, `ExternalSourcesModal.tsx` L139 and `LiteratureReviewMessage.tsx` L384, all styled with `accent-primary`.
- Native `<label>` wrappers at `ChatInput.tsx` L586 and `ExternalSourcesModal.tsx` L131.

### 2g. Custom badges / pills
- `AgentActivityPanel.tsx` L14-17 `SOURCE_BADGE_CLASS` and the link variant (uppercase 10px outline badge; an `<a>` when the source has `openUrl`).
- `DeepResearchSourcesSection.tsx` L34-37 `STATUS_CLASS` (Used in answer = primary tint, Searched only = muted), L148-155 (status and source-type pills). Map to `Badge`.
- `ExternalSourcesModal.tsx` L168-170: source-type pill.
- `ResearchPlanMessage.tsx` L23-24 `CHANNEL_PILL_CLASS`.
- `LiteratureReviewSteps.tsx` L39-43 `QUERY_PILL_CLASS` / `PILL_CLASS`. Map to a `Badge` or `Button variant="outline"`; drill-down pills are interactive.
- `MessageBubble.tsx` L199-225: "N sources" pill with a favicon stack.
- `ChatInput.tsx` mode and corpus buttons are `rounded-full` pill buttons (L394, L458).
- Citation pill, `messageRendering.tsx` L79: `w-5 h-5 rounded-xl bg-primary` span.
- `ResearchPlanMessage.tsx` L243-247: numbered index square.

### 2h. Custom cards
- `ResearchPlanMessage.tsx` L211 status card (`rounded-xl border bg-card`) and L56-82 `ResultCard`.
- `LiteratureReviewMessage.tsx` L370 `ColumnConfirmationCard`, L493-512 `ResultCard` (a second, different design from the one in `ResearchPlanMessage`), and L317 failed panel (→ `Alert` destructive).
- `DeepResearchSourcesSection.tsx` L102.
- `AgentActivityPanel.tsx` L239 (source box) and L296-322 (amber callout → `Alert` warning).
- `QuoteBlocks.tsx` L16.
- `ConfigureChatModal.tsx` L186: mode radio-cards.
- `ExternalSourcesModal.tsx` L131: selectable cards.
- `ReferenceTooltip.tsx` L197: popover card.
- Candidates: `Card` (default/elevated/interactive), `Alert`, `Badge`, `Empty` (ConversationList "No other threads" / "Loading…", L237-249), `Skeleton` (ChatEmptyState L104-110, ReferenceTooltip L248 pulse bar, `messageRendering.tsx` L22), `Spinner` (every `Loader2 animate-spin`: `ChatInput` L765 and L809, `DeepResearchSourcesSection` L71 and L185, `LiteratureReviewMessage` L330 and L469, `LiteratureReviewSteps` L106 and L192, `ResearchPlanMessage` L232 and L295, `messageStatus` L24), `Separator` (`ChatPanel` L809, `MessageBubble` L175, ChatEmptyState dividers L92-98), `Avatar`/`Tooltip`.

---

## 3. Raw palette colours (file:line, status)

All 14 baselined raw-colour tokens:
- **Warning (grounding-check failure callout)**, `components/AgentActivityPanel.tsx`:
  - L297: `border-amber-600/45 bg-amber-50/90 dark:border-amber-400/50 dark:bg-amber-950/45` (4 tokens).
  - L299: `text-amber-950 dark:text-amber-50`.
  - L301: `text-amber-800 dark:text-amber-300`.
  - L307: `text-amber-950 dark:text-amber-50`.
  - L311: `text-amber-900 dark:text-amber-100/95`.
  - Map to `bg-warning-muted`, `text-warning-muted-foreground`, `border-warning-border`, or the `Alert` warning variant.
- **Success (step completed)**, `components/LiteratureReviewSteps.tsx` L185: check icon `text-green-600 dark:text-green-500`. Map to `text-success` or `text-success-muted-foreground`.

Not counted by the linter but still raw:
- Scrim `bg-black/60 backdrop-blur-sm`: `ConfigureChatModal.tsx:132`, `ExternalSourcesModal.tsx:79`. Replaced by the Dialog overlay.
- Popover ring `ring-1 ring-black/5 dark:ring-white/10`: `ChatInput.tsx:472` and `:666`.

Already semantic (keep or tidy):
- Success:
  - `MessageBubble.tsx:141` `text-success-muted-foreground fill-success/30` (thumbs-up active).
  - `AgentActivityPanel.tsx:284` `text-success` (Done check).
  - `messageStatus.tsx:34` `text-success-muted-foreground` (completed).
- Destructive:
  - `MessageBubble.tsx:150` `text-destructive-muted-foreground fill-destructive/30` (thumbs-down active).
  - `ChatInput.tsx:725-726` (recording dot, `bg-destructive/45` and `bg-destructive`).
  - `ChatInput.tsx:785` (stop button, destructive).
  - `ConversationList.tsx:306` (Delete, `text-destructive`).
  - `LiteratureReviewMessage.tsx:317-318` (failed panel, `border-destructive/20 bg-destructive/5`, `text-destructive`) and `:423` (remove-column hover).
  - `ResearchPlanMessage.tsx:154` (`border-destructive/25`), `:178` (`text-destructive`).
  - `LiteratureReviewSteps.tsx:198-199` (failed step).
- Muted/primary tints for "state" pills: `DeepResearchSourcesSection.tsx:35-36`, `ChatInput` selected rows (`bg-primary/10`, `bg-primary/5`, `bg-primary/12`).
- Custom colour expression: `MessageBubble.tsx:366` `bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))]` for the user bubble.
- `ConfigureChatModal.tsx:199` `shadow-[inset_0_1px_0_0_oklch(1_0_0_/0.45)]`.
- No `#hex` / `rgb()` / `hsl()` anywhere in chat.

---

## 4. Inline `style={}`

| File:line | Value | Why |
|---|---|---|
| `ChatEmptyState.tsx:108` | `{width: \`${w}%\`}` | Skeleton widths 38/52/44/48 %. Replace with fixed `w-*` / `basis-*` classes. |
| `ChatInput.tsx:151` | `{...style, zIndex:200}` | `useAnchoredPosition` output: `position:fixed`, `left`, `top`/`bottom`, `maxWidth`, `--anchored-max-height`, plus a forced z-index. Disappears with Popover/DropdownMenu. |
| `ChatPanel.tsx:737` | `{maxHeight:"min(480px, calc(100vh - 100px))"}` | History popover height cap. Use `PopoverContent` + `ScrollArea` with Radix's `--radix-popover-content-available-height`. |
| `ChatPanel.tsx:867` | `{height:"100%"}` | Virtuoso list height. Virtuoso requires an explicit height; a `h-full` class on the `className` may work. |
| `ConversationList.tsx:278` | `threadMenuStyle` | Anchored position, same hook. |
| `LiteratureReviewSteps.tsx:125` | `{left:"50%", transform:"translateX(-50%)"}` | Centres the timeline connector line (replace with `left-1/2 -translate-x-1/2`). |
| `MessageBubble.tsx:211` | `{zIndex:index+1, marginLeft: index===0?0:-7}` | Overlapping favicon stack (dynamic per item). |
| `MessageBubble.tsx:269,273` | `animationDuration:"2s"`, `animationDelay:"0.5s"` | `animate-ping` timing. |
| `MessageBubble.tsx:288,292,296` | `animationDelay: 0/180/360ms`, `animationDuration:"1.1s"` | Staggered bouncing dots. |
| `ReferenceTooltip.tsx:193` | `{left, top, pointerEvents:"auto"}` | Manual tooltip position. |
| `utils/messageRendering.tsx:81` | `{verticalAlign:"middle"}` | Citation pill alignment (replace with `align-middle`, which is already in the className). |

Imperative styling outside JSX (not linted): `ChatInput.tsx:270-272` sets `textarea.style.height`, and `hooks/useComposerClearance.ts` sets CSS var `--chat-composer-clearance` on the container, which `ChatPanel.tsx:60` consumes as `h-[var(--chat-composer-clearance,18rem)] md:h-[var(--chat-composer-clearance,14rem)]`.

---

## 5. Arbitrary Tailwind values

- `AgentActivityPanel.tsx`:
  - L15 `text-[10px]`
  - L194 `transition-[color,opacity]`
  - L205 `transition-[color,transform]`
  - L217, L228, L241, L256, L288, L307, L311, L327 `text-[11px]`
  - L251 `grid-cols-[minmax(0,1fr)_auto_auto]`
  - L253 `text-[12px]`
- `ChatEmptyState.tsx` L14: `pb-[calc(12.5rem+env(safe-area-inset-bottom,0px))]`.
- `ChatInput.tsx`:
  - L148 `data-[side=bottom]:slide-in-from-top-2`
  - L370 `max-h-[160px]`
  - L418 `text-[10px]`
  - L458 `max-w-[min(13rem,100%)]`
  - L489 `grid-cols-[auto_auto_1fr] grid-rows-[auto_auto]`
  - L547, L579 `max-h-[min(65vh,480px,var(--anchored-max-height))]`
  - L630 `transition-[color,background-color,transform]`
  - L666 `max-h-[min(70vh,22rem,var(--anchored-max-height))]`
  - L671, L819 `text-[11px]`
  - L751 `active:scale-[0.98]`
  - Container-query variants (not arbitrary but critical): `@container/chat-input` L365, plus `@max-xs/`, `@max-md/`, `@max-lg/`, `@max-sm/`, `@max-xl/` and `@max-4xl/chat-input:*` at L252-258, L378-379, L394, L403, L461, L644.
- `ChatPanel.tsx`:
  - L60 `h-[var(--chat-composer-clearance,18rem)]` and `md:h-[var(--chat-composer-clearance,14rem)]`
  - L736 `max-w-[calc(100vw-2rem)]`
- `ConfigureChatModal.tsx`:
  - L135 `max-h-[90vh]`
  - L187 `transition-[border-color,background-color,box-shadow]`
  - L199 `shadow-[inset_0_1px_0_0_oklch(1_0_0_/0.45)]`
  - L203 `h-[1.15rem] w-[1.15rem]`
  - L206 `text-[0.9375rem]`
  - L209 `text-[13px]`
- `ConversationList.tsx`: L188 `min-h-[38px]`, L222 `transition-[opacity,background-color,color]`.
- `DeepResearchSourcesSection.tsx`: L149, L153 `text-[10px]`.
- `ExternalSourcesModal.tsx`: L88 `max-h-[90vh]`, L133 `transition-[...]`, L157 `text-[0.9375rem]`, L168 `text-[10px]`, L172 `text-[11px]`.
- `LiteratureReviewMessage.tsx`: L310, L372, L504 `text-[15px]`.
- `LiteratureReviewSteps.tsx`: L139 `text-[15px]`.
- `MessageBubble.tsx`:
  - L159 `transition-[transform,color,background-color]`
  - L160 `active:scale-[0.96]`
  - L191 `w-[17px] h-[17px]`
  - L203 `transition-[color,background-color]`
  - L285 `gap-[3px]`
  - L287, L291, L295 `w-[3px] h-[3px]`
  - L361 `max-w-[95%]`
  - L366 `bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))]`
- `QuoteBlocks.tsx`: L16 `text-[11px]`, L21 `transition-[...]`, L24 `stroke-[2.5]`.
- `ReferenceTooltip.tsx`:
  - L51 `text-[15px]`
  - L60, L69 `text-[13px]`
  - L82, L85 `text-[0.8em]`
  - L185 `text-[11px] tracking-[0.2em] leading-[14px]`
  - L197 `max-w-[calc(100vw-2rem)]`
  - L218, L234, L241 `[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]`; replace with `line-clamp-2`, which is already used elsewhere
  - L247 `[scrollbar-width:thin]`
  - L261 `transition-[...]`
- `ResearchPlanMessage.tsx`: L216 `text-[15px]`.
- Related non-arbitrary hazards the linter may flag as unknown or arbitrary: `w-76`, `min-w-54`, `max-h-(--anchored-max-height)` (v4 CSS-var shorthand), `z-120`, `z-200`, `chat-panel-graph-grid` (defined in `apps/web/src/index.css:921`; also used by auth and landing).

---

## 6. Selectors that tests rely on

**Playwright `e2e/` (chat)**

| Selector | Spec:line | Rendered by |
|---|---|---|
| `getByPlaceholder(/Ask a question about your sources/)` | `chat-existing.spec.ts:7,13`; `chat-input.spec.ts:49`; helper regex in `chat-assertions.ts:5-6`, used by `notebook.fixture.ts:58` | `ChatInput.tsx:260-265,369` (default placeholder "Ask a question about your sources...") |
| `getByPlaceholder(/Ask a complex research question/)` and the full deep-research placeholder in `CHAT_TEXTAREA_PLACEHOLDER` | `chat-input.spec.ts:42` (stale test); `chat-assertions.ts:5-6` | `ChatInput.tsx:263` ("Ask a complex research question with multi-step investigation...") |
| `getByPlaceholder(/Ask a question/)` | `chat-existing.spec.ts:26`; `e2e/notebooks/notebook.spec.ts:39` | `ChatInput` textarea |
| Literature-mode placeholder "Describe the topic, research question..." | (not tested) | `ChatInput.tsx:261-262` |
| `getByText(/select at least one source/i)` (toast) | `chat-existing.spec.ts:17` | `ChatPanel.tsx:513-518` via `toastError("Please select at least one source before asking a question")`; the Enter keypress path depends on `ChatInput.tsx:326-334` |
| `chatInput.press("Enter")` | `chat-existing.spec.ts:15,28` | `ChatInput.handleKeyDown` L326-334 |
| `locator('button[title*="(Enter)"]')` | `chat-assertions.ts:58` (`sendMessage`) | Send button title, `ChatInput.tsx:790-802`: "Send message (Enter)", "Start deep research (Enter)", "Start literature review (Enter)". The title only contains "(Enter)" when `value.trim()` is non-empty. |
| `locator('button[title="Research options"]')` | `chat-assertions.ts:13,24` | **Does not exist anymore** (stale) |
| `getByText("Deep Research")`, `getByRole("button",{name:/Deep Research/i})`, `getByText("Deep research")` | `chat-assertions.ts:16,25`, `chat-input.spec.ts:32,39` | Stale. Today "Deep Research" is a `role="option"` inside the Mode drop-up (`ChatInput.tsx:424-441`). |
| `getByRole("option",{name:"Deep Research",exact:true})` | `deep-research.spec.ts:19` | Mode drop-up option, `ChatInput.tsx:424-441`. Works only if the mode menu is opened first (missing helper). |
| `locator("label").filter({hasText:/^Web$/})`, `/^Notebook sources$/`, `${filterName}`; `webLabel.locator('input[type="checkbox"]')` + `toBeChecked()` | `chat-input.spec.ts:12,19`; `chat-assertions.ts:39,43,69` | `ChatInput.tsx:586-603`, filter labels `Notebook sources`, `Academic`, `Web`, `News`, `Finance` (L38-44), each a native `<label><input type=checkbox>`. A Radix Checkbox would break the `input[type=checkbox]` locator. |
| `locator("[data-message-id]")` with class filter `items-start`, then `.prose.max-w-none` | `chat-existing.spec.ts:34`; `chat-assertions.ts:92-96,102-106,128-135` | `data-message-id` on the root at `MessageBubble.tsx:358`. `items-start` comes from the assistant branch of the className at L357. `.prose.max-w-none` is the markdown wrapper at `messageRendering.tsx:25`. All three are load-bearing for `getLastAssistantMessageProse`, `waitForAssistantMessage` and `waitForStreamingComplete`. |
| `getByTitle(/^Reference \d+$/)` | `chat-with-sources.spec.ts:43` | Citation span `title={\`Reference ${refId}\`}`, `messageRendering.tsx:80` |
| `getByText("What is the capital of France?")` etc. (user bubble text) | `chat-basic.spec.ts:21`; `chat-existing.spec.ts:44`; `deep-research.spec.ts:46`; `expectUserMessage` L157-159 | User bubble, `MessageBubble.tsx:365-380` |
| Deep-research planning text: "Research plan", "Ready for review", "Loading plan", "sub-question", "Approve & Research", "Approve" (in `body.innerText`) | `deep-research.spec.ts:30-38` | `ResearchPlanMessage.tsx`: "Loading plan…" L233, `sub-question(s)` L276, "Approve & Research" L301, header "Research plan" L166. "Ready for review" does not exist (stale comment). |
| `[data-onboarding="chat-input"]` plus `anchor.locator("textarea")` | `e2e/onboarding/onboarding-ui.spec.ts:11-13`; `apps/web/src/features/onboarding/steps.ts:33` | `ChatInput.tsx:364` (shell div, which must contain the `<textarea>`) |
| `button[title="Open Studio"]` | `e2e/helpers/navigation.ts:54` | `ChatPanel.tsx:712`. Icon-only; the `title` is the only label. |
| `getByRole("button",{name:"Studio"})` | `navigation.ts:58` | Mobile tab. A non-exact substring match would also hit "Open Studio". Keep the accessible name of the `ChatPanel` button (or fix the helper). |
| `getByRole("button",{name:/^Sources$/})` | `navigation.ts:11,27` | Mobile tab; the "Open Sources" button at `ChatPanel.tsx:702` is excluded by the `^$` anchors. |
| Comment: "ChatEmptyState overlay can intercept pointer events" | `navigation.ts:17` | `ChatEmptyState.tsx` (`min-h-full pb-[...]`) |
| "Quiz me on this material" (chip text) | `e2e/helpers/studio-assertions.ts:43` (comment only) | `ChatEmptyState.tsx:6-11` (`STARTER_PROMPTS`) |

**Vitest (`apps/web/src/**/*.test.tsx`)**: no test renders `ChatPanel`, `ChatInput`, `MessageBubble`, `ReferenceTooltip`, `ConversationList`, `ConfigureChatModal`, `ExternalSourcesModal`, `AgentActivityPanel` or `ChatEmptyState`. The only chat-related selectors in tests:
- `LiteratureReviewSteps.test.tsx`:
  - `getByRole("button",{name:/Ranked 100 papers for your research question/i})` and `/Screened 30 papers: 15 included, 15 excluded/i`; the pills must stay `<button>` only when callbacks and `sessionId` exist, otherwise `queryByRole("button")` is null.
  - `getByText("Synthesizing answer")`; `queryByText("Report generation complete")` must be null.
- `QuoteBlocks.test.tsx`: `getByLabelText(/remove quote/i)`, `getByTestId("quote-count")` (test-defined), plus text matches.
- `TourTooltip.test.tsx:69,77,90` and `OnboardingFlow.integration.test.tsx:188` use a synthetic `data-onboarding="chat-input"` target and do not render the real input.

---

## 7. Existing unit tests in `features/chat`

- `components/LiteratureReviewSteps.test.tsx` (109 lines): drill-down pill click behaviour; hidden "Report generation complete" detail; non-clickable pills when callbacks are missing.
- `components/QuoteBlocks.test.tsx` (109): renders nothing when empty; renders, removes and truncates quote cards. Covers dead code.
- `contexts/SelectionQuoteContext.test.tsx` (246): `useSelectionQuotes` (add, dedupe, remove, clear, throws outside the provider) and `useSelectionTooltip`. Covers dead code.
- `useChatStreaming.test.tsx` (47): context hook throws outside the provider and returns the value inside it.
- `services/chatApi.test.ts` (199): `parseStreamBody` (markers `__DONE`, `__REFERENCES`, `__STATUS`, `__ERROR`, `__FOLLOWUPS`, `__CLARIFICATION`, `__RESEARCH_PLAN`, `__EXTERNAL_SOURCES`, `__TOOL_CALL`, `__GROUNDING`).
- `services/consumeStream.test.ts` (267): `consumePersistentTextStream` callbacks.
- `utils/aggregateRetrievalSources.test.ts` (253), `chatStreamHelpers.test.ts` (104), `citationMarkers.test.ts` (63, math-safe citation replacement), `composerPrefsStorage.test.ts` (83), `deepResearchSources.test.ts` (76), `deepResearchSteps.test.ts` (59), `exportChat.test.ts` (95), `literatureReportPreview.test.ts` (56), `literatureReviewStepDrilldown.test.ts` (21).
- Coverage gap: there are no render tests for the composer, panel, bubble, tooltip, modals or conversation list. Migration safety nets must come from new tests or e2e.
- `apps/web/src/shared/ui/DropdownMenu.test.tsx` and `anchoredPosition.test.ts` cover the shared pieces.

---

## 8. Structure and risky areas

### `ChatPanel.tsx` major sections
- L1-52: imports.
- L54-64: `MessageListFooter` spacer (`h-[var(--chat-composer-clearance...)]`) and `MESSAGE_LIST_COMPONENTS` for Virtuoso.
- L66-99: props and component start.
- L100-155: store, state and refs.
  - `useChatStreamingContext`, `useSourcesContext`.
  - Tooltip state L123-127 (see 2c).
  - `usePersistedComposerPrefs` L131-138.
  - `useSessionStorage("chat-academic-filters")` L141-142.
  - `historyOpen`, `isConfigModalOpen`.
  - `pinnedIds` from `localStorage["chat-pinned-ids"]` L148-155.
- L157-184: `channelsForChatSend` and `chatSourcePolicy` (a PubMed or arXiv corpus adds the `academic` channel; deep research gets `maxResultsPerChannel: 8`).
- L186-220: `historyContainerRef` and the history click-outside / Escape effect.
- L222-240: pin toggling.
- L242-287: research-plan approve / reject. Approve POSTs `${CONVEX_SITE_URL}/research/execute` with a Bearer token and then `consumeResearchExecuteStream`.
- L289-301: `chatInputDisabled`, refs, `useComposerClearance` L298.
- L303-366: export, save-to-note (optimistic placeholder L324-335), `handleSaveChatConfig`.
- L368-446: citation tooltip handlers.
- L448-489: `handleNewConversation`.
- L491-537: copy message, source validation, mode change.
- L539-618: `handleSendMessage` (literature-review branch vs chat/deep-research branch) and `handleSendChip`.
- L620-632: scroll-to-bottom effect.
- L634-679: tooltip placement and open-in-sources.
- L681-693: Literature-session polling and `isInputDisabled`.
- L695-825: `chatHeaderToolbar` (Open Sources / Open Studio icons, History popover L718-755, New chat L756-771, Chat options menu L772-823).
- L827-1059: JSX.
  - Root L829; header bar L831-839 ("Chat" title, h-14 sticky).
  - Messages area L842-990 (`ChatEmptyState` when empty, else Virtuoso L864-935 with item branches `ResearchPlanMessage` / `LiteratureReviewMessage` / `MessageBubble`); floating `ReferenceTooltip` L938-988.
  - Composer wrapper L993-1047 (absolute bottom, `pointer-events-none`, gradient band L998-1001, then `ChatInput` L1002-1046).
  - L1049 `ConfirmDialogComponent`; L1050-1057 `ConfigureChatModal`.

### `ChatInput.tsx` structure
- L38-90: constants (`SOURCE_FILTERS`, `COMPOSER_MODES`, `RESEARCH_DATABASES`).
- L92-159: props, types and `ComposerDropUp`.
- L161-358: state and effects: refs for four anchors and panels, `openMenu` single-state union (`none|mode|corpus|filters|model`), `useChatVoiceTranscription` L216-224, derived flags L226-258, placeholder L260-265, textarea-fit L267-293, click-outside L295-318, `handleKeyDown` L326-334, `toggleFilter` L336-345 (refuses to remove the last active channel).
- L360-822: JSX.
  - Outer `max-w-3xl xl:max-w-4xl 2xl:max-w-5xl` L361.
  - Shell L362-366: `@container/chat-input`, `pointer-events-auto`, `rounded-2xl border bg-card shadow-lg`, `data-onboarding="chat-input"`.
  - Textarea L367-376. Toolbar row L378, left cluster L379, right cluster L618.
  - Disclaimer L819-821: "SolomindLM can be inaccurate; please double check its responses." (Removed 2026-10: nothing renders below the composer.)

Toolbar controls in order:
1. **Mode** (drop-up). Label L391 `aria-label="Composer mode: {Chat|Deep Research|Literature Review}"`; icons MessageCircle / Telescope / FileText; ChevronDown; the text label is hidden under container query widths.
   - Selecting calls `onModeChange`, which in `ChatPanel` merges the default source filters per mode (L521-537).
   - Panel: `aria-label="Choose chat mode"`, header "Mode".
2. **Research databases** (drop-up), shown when `notebookId` is set and (literature mode, or chat/deep-research with the Academic channel on). `aria-label="Research databases"`; label is `dbMeta.title`.
   - Panel: "Research Databases:" with a radio-like list: All Papers (BookOpen, "Search from 200M+ research papers"), PubMed (BriefcaseMedical, "39M+ biomedical and life-science literature"), ArXiv (Atom, "Explore research preprints from arXiv").
3. **Filters** (drop-up), `aria-label="Filters"`, ListFilter icon.
   - In literature mode: only `AcademicDiscoveryFiltersSection`.
   - In chat / deep research: "Source channels" checklist (Notebook sources, Academic, Web, News, Finance) plus academic filters when Academic is on. The button is tinted primary when academic filters are active.
4. **Model** (drop-up, right-aligned), only if `onModelChange` is provided. `aria-label="Model: {name}"`, `title={name}`, `ModelBrandIcon`.
   - Name is `sr-only` at narrow container widths or when `hideModelButtonLabel` (≥3 toolbar controls).
   - Panel: `aria-label="Choose model"`, header "Model", list from `AVAILABLE_SMART_MODELS` with a check on the active one. Selecting persists to notebook `chatSettings.smartModel` via `handleSaveChatConfig({silentSuccess:true})`.
5. **Mic** (not a drop-up), shown when `onAppendTranscription` is provided.
   - `title` is "Dictate (microphone)", "Stop and transcribe" or "Transcribing…", with `aria-pressed`.
   - While recording it shows a pinging destructive dot and an elapsed timer (`aria-live="polite"`).
   - While transcribing it shows `Loader2` spinning.
   - Disabled when `disabled`, no `notebookId`, or transcribing.
6. **Send / Stop** (not a drop-up), `size-8` primary button.
   - States: Square, destructive, `title="Stop generating"` when streaming; `Monitor` pulse plus a "A response is generating in another tab or device..." title when waiting on a remote generation; `Loader2` when disabled; `Search` for deep research or literature review; `ArrowUp` for chat.
   - Disabled when `!isStreaming && (!value.trim() || disabled || !notebookId)`.

### Risky areas
- **Streaming render path.**
  - `MessageBubble` for `message.id === "__streaming__"` (L230) receives `isAssistantStreamActive` from `ChatPanel` (L892-894).
  - `renderMessageWithReferences` runs `stripReferencesSection` → `sanitizeMarkdown` → `replaceCitationMarkersOutsideMath`, then `MarkdownRendererLazy` with `mode="streaming"`, `parseIncompleteMarkdown`, `isAnimating`, `animated` (L26-30). That is Streamdown (`shared/components/MarkdownRenderer.tsx`, plugins in `MarkdownRenderer.utils`).
  - Citations arrive as inline code `CITE:n`, so the `inlineCode` override (L68-91) is the only thing that renders citation pills. `img/a/video/audio/iframe` are suppressed and `a` renders as a plain span.
  - Do not change the `.prose.max-w-none` wrapper (L25) or `data-message-id` / `items-start`; e2e streaming helpers key off them.
  - The `MessageBubble` memo comparator `JSON.stringify`s `agentTrace` and `externalSources` on every compare.
- **KaTeX.** `citationMarkers.ts` deliberately avoids touching `$…$` and `$$…$$`. The markdown plugins live in `shared/components/MarkdownRenderer.utils`, not under chat.
- **Scroll-to-bottom.**
  - `ChatPanel.tsx` L622-632 scrolls only when `messages.length` changes (100 ms timeout, Virtuoso `scrollToIndex` smooth, `align:"end"`). Streaming growth of the single `__streaming__` row is not auto-followed there.
  - `useComposerClearance.ts` writes the `--chat-composer-clearance` var and, if the list was at the bottom (8 px threshold), re-sticks it after a composer resize.
  - The scroller element is captured through Virtuoso's `scrollerRef` (L299-301, L931). Replacing the container with `ScrollArea` would break `scrollerRef`/Virtuoso's expectation of its own scroller.
  - Virtuoso props: `defaultItemHeight={150}`, `increaseViewportBy={{top:200,bottom:400}}`, `components={{Footer}}`, `data-testid` none.
- **Voice input.** `useChatVoiceTranscription` uses `MediaRecorder` (mime candidates webm/opus, webm, mp4), `getUserMedia`, a 90 s auto-stop and a 130 s chain timeout, uploads via `generateUploadUrl` and then the Convex action `chat.voiceTranscription.transcribeChatAudio`.
  - It has an explicit Strict-Mode `mountedRef` reset. The mic button's disabled / title / `aria-pressed` states are produced inline in `ChatInput`.
- **@mention popover.** None exists. There is no library and no code for it.
- **Drag/drop.** None.
- **Keyboard shortcuts.**
  - `ChatInput.tsx` L326-334: Enter without Shift sends, with no `isComposing` guard (IME risk).
  - Escape closes composer menus (L304), the history popover (`ChatPanel.tsx` L198) and cancels rename (`ConversationList` L161-162).
  - Radix will take over Escape and focus-return handling for migrated popovers.
- **Mobile / touch.**
  - Citation tap uses `onTouchStart` plus `onClick`, which double-toggles (see 2c).
  - The composer wrapper is `pointer-events-none` with the shell `pointer-events-auto` (`ChatPanel.tsx` L992-996), deliberately so taps beside the input reach message actions. Any new wrapper must keep this.
  - `MessageBubble` action buttons use larger `min-h-10 min-w-10 md:min-h-8` hit areas with `touch-manipulation`.
  - Container queries (`@max-*/chat-input`) replace viewport breakpoints in the composer.
  - `ChatEmptyState` has `pb-[calc(12.5rem+env(safe-area-inset-bottom...))]`.
  - The ChatPanel header buttons for Left/Right panels are hidden on mobile (`hidden md:flex`).
- **Anchoring and z-index stack.** Radix Popover and Dropdown are z-100; Dialog is z-100. Existing chat layers are z-50 (history, tooltip), z-120 (modals), z-200 (drop-ups, thread menu) and z-300 (ConfirmDialog). Check that new primitives sit above the app header (z-70) and the composer (z-20).
- **Nested layers.** The history popover contains a per-row menu and a delete confirm today; `[data-thread-submenu-root]` and `[data-confirm-dialog-root]` guards (`ChatPanel.tsx` L203-209) exist to keep the history popover open. With Radix `Popover` > `DropdownMenu` > `AlertDialog`, deleting a thread inside a Popover that then closes would unmount the AlertDialog; either render the `AlertDialog` outside the popover or keep controlled state in `ConversationList`'s parent.
- **Persistence.**
  - `localStorage["chat-pinned-ids"]` (`ChatPanel` L148-155 and L229), per-notebook composer prefs (`composerPrefsStorage`), `sessionStorage["chat-academic-filters"]` and `sessionStorage["solomind-chat-activity-open"]`. None depend on DOM.
- **Dead code / duplication.** Besides `QuoteBlocks` and `SelectionQuoteContext`, there are two different `ResultCard` components (`ResearchPlanMessage.tsx` L56-82 and `LiteratureReviewMessage.tsx` L493-512), the duplicated references-stripping regex in `ChatPanel.tsx` L494-496, and the unused `confirm` from `useConfirmDialog` in `ChatPanel`.

### Shadcn availability notes for the plan
- Available and relevant: `popover` (z-100, Portal built-in), `dropdown-menu`, `dialog` (variants `theme default|light`, `size default|wide`, `padding default|none`), `alert-dialog`, `tooltip` (`TooltipProvider` is nested in each `Tooltip`), `input-group`, `textarea` (`field-sizing-content`), `toggle-group`, `tabs`, `select`, `badge`, `card`, `alert`, `empty`, `skeleton`, `spinner`, `separator`, `scroll-area`, `button` (sizes include `icon`, `icon-sm`, `icon-lg`).
- Missing: `checkbox`, `radio-group`, `collapsible`/`accordion`, `hover-card`. These are needed for the filter checklists, the research-database picker, the disclosures, and arguably the citation hover.
- `components.json` is at `apps/web/components.json`. The lint note in `eslint.config.mjs` says new looks must be variants inside `src/shared/components/ui` (restyle-only allows layout classes).
