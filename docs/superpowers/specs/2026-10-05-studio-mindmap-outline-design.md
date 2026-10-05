# Mind map as an outline (Studio redesign follow-up)

**Status:** approved in brainstorming on 2026-10-05.
**Issue:** a follow-up to #264, after PR 6 (#368), which shipped a stopgap for #171 on Mind Elixir.
**Mockups:** in the visual companion screens in `.superpowers/brainstorm/4174-1791238695/content/` (not committed):
- `mindmap-shape.html`: shape C, "Outline";
- `outline-style.html`: look A, "Notes";
- `outline-count.html`: count placement A, "Right-hand column".

## Goal

Replace the Mind Elixir canvas with a collapsible outline that is better than NotebookLM's mind map:
- it reads like notes;
- it works the same on desktop and phone (NotebookLM has no mobile mind map);
- clicking a topic asks the notebook's chat about it, using the sources the map was built from;
- the whole map copies out as Markdown.

## Decisions

| Question | Decision |
|---|---|
| Shape | **Outline only.** No canvas, pan, zoom or full screen. The same view on every screen size. |
| Look | **Notes:** serif text, a coloured dot on each main branch, and a soft guide line in the branch colour down each open branch. |
| Subtopic count | **Right-hand column:** small plain figures at the row's right edge. It fades out once the branch is open. |
| Opening state | **Main branches only.** Expand all and Collapse all are in the header. |
| Clicking a topic | **Asks the chat** right away. The arrow button is the only thing that opens and closes a branch. |
| Sources for the answer | **The map's own sources.** Older maps, and maps whose sources were all deleted, fall back to the current selection. |
| Export | **Copy as Markdown**, which always copies the full tree. |
| Approach | **Our own outline component**, following the WAI-ARIA tree pattern. No new dependency. |

## Design

### Look

- **Header** (sticky at the top of the view):
  - the map title in `font-display`;
  - then `Button`s: **Expand all**, **Collapse all**, and **Copy as Markdown** (an icon button labelled "Copy as Markdown"). After copying, the copy button briefly reads "Copied".
  - The mobile back button keeps the name "Back to Studio".
- **Rows:**
  - **The arrow button.** A toggle sits at the left of each topic with children, and a spacer of the same width sits on leaf rows. The arrow points right when closed and turns to point down when open.
  - **Main branches** have a coloured dot and the topic in Lora at 15px, weight 600. Deeper topics use Lora at 14px.
  - **The count** of hidden subtopics sits at the right edge of the row, `ml-auto`, in small sans `tabular-nums` and `text-muted-foreground`. It fades out while the branch is open.
  - **Open branches** indent their children and draw a guide line in the branch colour at about 32% strength.
- **Branch colours:** the main branches cycle through five branch colours, defined as tokens in `index.css` for light and dark. Each colour is set on its branch as `--branch`, a custom property (allowed by the design lint), and the dot, guide line and hover tint all read from it.
- **The root:** its topic is the header title. The outline lists only the root's children and their descendants.
- **Soft layered look:** no borders. Hover gives a row a muted fill, and the focused row gets a focus ring.

### Behaviour

- **Opening:** only the main branches show. Open and closed state lives in component state, so it lasts while the map is open and resets when it's reopened.
- **Open and close:**
  - The arrow button toggles one branch.
  - Expand all opens every branch, and Collapse all closes every branch.
  - Branches open and close by animating `grid-template-rows` from `0fr` to `1fr` with the house ease-out curve. Under reduced motion they snap open and closed.
- **Asking the chat:**
  - Clicking a topic's text, or pressing Enter on a focused row, calls `onAskInChat(prompt, documentIds)`.
  - **The prompt** for a main branch is "Discuss what these sources say about {topic}, in the context of {map title}." For a deeper topic it is "Discuss what these sources say about {topic}, in the context of {parent topic}." The root has no row to click.
  - **Confirmation:** the row flashes softly in its branch colour.
  - **While the chat is busy** (`isChatStreaming || remoteGenerationBlocksSend`, from `useChatStreamingContext`), topic text can't be clicked, and hovering it shows a tooltip, "Wait for the chat to finish answering". The arrows still work.
  - **Without a handler:** when there is no `onAskInChat` (anywhere outside the notebook), topics are plain text.
- **Keyboard** (WAI-ARIA tree pattern):
  - The outline is `role="tree"` and each row is `role="treeitem"`, with `aria-level`, `aria-expanded` (on rows with children), `aria-setsize` and `aria-posinset`. Child lists are `role="group"`.
  - It has one tab stop, a roving `tabIndex`.
  - **Up and Down** move between visible rows.
  - **Right** opens a closed branch, or moves to its first child if it's already open. **Left** closes an open branch, or moves to the parent.
  - **Home and End** go to the first and last visible rows.
  - **Enter** asks the chat.
  - **`*`** opens all siblings, as in the APG pattern.
- **Copy as Markdown:**
  - It writes `# {title}`, then the full tree (open or not) as a nested `- ` list with a two-space indent per level.
  - It writes with `navigator.clipboard.writeText`. If that throws, it shows an error toast through `useToast`.

### Data and backend

- **Saving the map's sources:**
  - `generateMindMap` (`convex/studio/mindmaps/index.ts`) stores `metadata: { documentIds }` when it creates the row.
  - The job mutations in `convex/studio/jobMutations/mindmaps.ts` replace `metadata` today: `saveMindMapResults`, `updateMindMapStatus` and `markMindMapFailed`. Each must carry the existing `metadata.documentIds` forward. Any job phase that writes `metadata` through another mutation must keep it too.
  - No schema change: `metadata` is `v.any()`.
- **Web types:**
  - `MindMapNote.metadata` gains `documentIds?: string[]`, and the notes mapping passes it through.
  - Tree cleaning keeps using `sanitizeNodeTree`, which moves into the new `features/studio/components/mindmap/` module.
- **Wiring:**
  - `NotebookView` owns `handleAskInChat(prompt: string, documentIds?: string[])`, modelled on `handleDiscussSourceTopic`:
    1. It returns early while streaming or blocked.
    2. It works out the override: the given ids that are still present in `sources` with `status === "completed"`.
    3. If none are left, it falls back to the selected completed sources. If there are none of those either, it shows the existing "Please select at least one source before asking a question" toast and returns.
    4. It calls `setMobileActiveTab("chat")`.
    5. It calls `onSendMessage(prompt, undefined, { channels: ["notebook"] }, { documentIdsOverride })`. The override is passed only when the map's own ids were used.
  - The handler is passed as an `onAskInChat` prop through `StudioPanel` (desktop and mobile instances), then `ActiveNoteView`, then `MindMapView`.

### Removed

- The `mind-elixir` package, with `bun remove` in `apps/web`, and `import "mind-elixir/style.css"` in `App.tsx`.
- The `.mind-map-container` rules in `apps/web/src/index.css`.
- Mind map full screen: `isMindMapExpanded` and `onToggleMindMap` in `StudioPanel` and `ActiveNoteView`, plus the `isExpanded` and `onToggleExpanded` props.
- The PR 6 viewport helpers (`openingScale`, `fitScale`, `stepScale`, `collapseLargeTree`, `countNodes` and the scale constants) and their tests. Only `sanitizeNodeTree` stays.
- Knip must report nothing left over.

### States

- **Failed:** `Alert variant="destructive"`, using the hardened `errorMessage` from #368.
- **Generating:** unchanged. The Studio panel's generating item handles it.
- **No data:** `Empty`, "No mind map data available".
- **A root with no children:** `Empty`, "This mind map has no topics".

## Error handling

- **Asking while the chat is busy:** disabled, with a tooltip. Not silently ignored.
- **The map's sources are gone:** fall back to the current selection. If nothing is selected, show the existing toast.
- **Clipboard failure:** an error toast. The button doesn't claim "Copied".
- **Malformed tree data:** `sanitizeNodeTree` fills in ids and topics. Non-object children become "Untitled" leaves.

## Testing

- **Unit tests (pure, written first):**
  - `toMarkdown(title, root)`, covering nesting, a two-space indent, and special characters left as they are;
  - `askPrompt(topic, parentTopic)`;
  - the source choice in `handleAskInChat`'s helper: the map's own ids filtered to completed sources, then the fallback, then none.
- **Component (`MindMapOutline`):**
  - It opens on main branches with counts, and a count is hidden once its branch is open.
  - The arrow toggles a branch, and Expand all and Collapse all work.
  - Clicking a topic calls `onAskInChat` with the prompt and `documentIds`. A click while busy does nothing and shows the tooltip label.
  - The keyboard pattern, and `role`, `aria-level` and `aria-expanded`.
  - Copy writes the Markdown and shows "Copied", and a rejected clipboard shows a toast.
  - Reduced motion.
- **`NotebookView`:** `handleAskInChat` switches the mobile tab to chat and passes `documentIdsOverride` only for the map's own sources.
- **`convex-test`:** `generateMindMap` stores `documentIds`, and `saveMindMapResults`, `updateMindMapStatus` and `markMindMapFailed` keep them.
- **e2e:** existing mind map specs keep their selectors. New, behind `E2E_AI_ENABLED`: open a generated mind map, open a branch, and see its subtopics.
- **Design lint:** 0 findings in the new files.
- **Visual check:** real mind maps on the dev server, at desktop and phone widths, in light and dark. Clicking a topic sends a real chat message (credits), so ask first.
