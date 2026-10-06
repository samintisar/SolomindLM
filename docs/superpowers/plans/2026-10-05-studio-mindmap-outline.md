# Mind Map as an Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mind Elixir canvas with a collapsible, accessible outline. Clicking a topic asks the notebook's chat about it, using the sources the map was built from, and the whole map copies out as Markdown.

**Architecture:**
- **Pure helpers** in `features/studio/components/mindmap/outline.ts`: tree cleaning, Markdown, prompts and ids.
- **`MindMapOutline.tsx`:** a WAI-ARIA tree with roving focus, CSS grid-row collapse and branch colour tokens.
- **`MindMapView.tsx`** composes the outline with the failed and empty states.
- **Sending:** `NotebookView` owns the send through `onAskInChat`, passed down `StudioPanel` → `ActiveNoteView` → `MindMapView`. The choice of sources is a pure function.
- **Backend:** Convex saves `metadata.documentIds` when a map is created, and keeps it through the job.
- **Removed:** Mind Elixir and mind map full screen.

**Tech Stack:** React 19.2, Tailwind v4 (`@theme inline` colour tokens, `@utility`), shadcn/ui (`Button`, `Tooltip`, `Alert`, `Empty`), Convex + `convex-test`, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-studio-mindmap-outline-design.md`. Mockups (not committed): `.superpowers/brainstorm/4174-1791238695/content/outline-style.html` (look A, "Notes") and `outline-count.html` (count A, "Right-hand column").

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-mindmap-outline`.
- **Before Task 5:** PR 6 (#368) must be merged. Then run `git fetch origin && git merge origin/main`, so that `views/MindMapView.tsx`, `mindmap/mindMapViewport.ts` and their tests are #368's versions. Tasks 1–4 don't touch those files and can start before.
- **One web test file:** `bun run test <path>`, from `apps/web`.
- **One Convex test file:** `bunx vitest run --config vitest.convex.config.ts <path>`, from the root.
- **Typecheck:** `bun run typecheck:web` and `bun run typecheck:convex`, from the root, one at a time.
- **Never kill processes by name.** No browser tools: the pane is shared with the user. Read `convex/_generated/ai/guidelines.md` before any Convex change.

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`, `docs/design/principles.md`):
- Primitives get layout classes only.
- No arbitrary `[...]` or `(...)` values, no `dark:`, and no palette colours.
- `style` may set custom properties only.
- No border on a raw `<button>`.
- Soft layered look: fill and shadow, not borders.

---

## File map

| File | Change |
|---|---|
| `convex/studio/mindmaps/index.ts` | `generateMindMap` stores `metadata: { documentIds }` |
| `convex/studio/jobMutations/mindmaps.ts` | `saveMindMapResults`, `updateMindMapStatus` and `markMindMapFailed` keep `metadata.documentIds` |
| `convex/studio/jobMutations/mindmaps.test.ts` | **new** (`convex-test`) |
| `apps/web/src/shared/types/index.ts` | `MindMapNote.metadata.documentIds?: string[]` |
| `apps/web/src/features/studio/services/notesApi.ts` | the mindmap case passes `documentIds` |
| `apps/web/src/features/studio/components/mindmap/outline.ts` (+ test) | **new**: `sanitizeNodeTree` (moved), `toMarkdown`, `askPrompt`, `branchColorVar`, `collectBranchIds` |
| `apps/web/src/features/notebooks/utils/askSources.ts` (+ test) | **new**: `resolveAskSources` |
| `apps/web/src/features/notebooks/components/views/NotebookView.tsx` | `handleAskInChat`, passed to both `StudioPanel`s |
| `apps/web/src/features/studio/components/StudioPanel.tsx`, `ActiveNoteView.tsx` | the `onAskInChat` prop; mind map full screen removed |
| `apps/web/src/index.css` | branch colour tokens, `--color-branch`, the `mindmap-*` utilities; `.mind-map-container` rules removed |
| `apps/web/src/features/studio/components/mindmap/MindMapOutline.tsx` (+ test) | **new** |
| `apps/web/src/features/studio/components/views/MindMapView.tsx` (+ test) | rewritten around `MindMapOutline` |
| `apps/web/src/features/studio/components/mindmap/mindMapViewport.ts` (+ test) | **deleted** (`sanitizeNodeTree` moves to `outline.ts`) |
| `apps/web/package.json`, `bun.lock`, `apps/web/src/App.tsx`, `apps/web/vite.config.ts` | `mind-elixir` removed |
| `e2e/studio/mindmap-generation.spec.ts` | an outline test behind `E2E_AI_ENABLED` |

---

### Task 1: Convex saves and keeps the map's sources

**Files:**
- Modify: `convex/studio/mindmaps/index.ts` (`generateMindMap`, the `createMindmap` call around line 163)
- Modify: `convex/studio/jobMutations/mindmaps.ts`
- Create: `convex/studio/jobMutations/mindmaps.test.ts`

**The rule:**
- When the map is created, `metadata` is `{ documentIds }`.
- Each job mutation that replaces `metadata` must carry `documentIds` forward from the stored row, unless the incoming metadata sets it.
- Add one helper in `jobMutations/mindmaps.ts`, and use it in the three mutations:

```ts
/** The job replaces `metadata` wholesale; the map's source list must survive every write. */
function keepDocumentIds(
  stored: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> {
  const documentIds = stored?.documentIds;
  return documentIds === undefined ? { ...next } : { documentIds, ...next };
}
```

**Using it:**
- **`saveMindMapResults`:** it already reads `mindmap`. Set `metadata: { ...keepDocumentIds(mindmap.metadata, args.metadata), completedAt: Date.now() }`.
- **`updateMindMapStatus`:** when `args.metadata` is set, read the row with `ctx.db.get(args.mindmapId)` and set `updates.metadata = keepDocumentIds(row?.metadata, args.metadata)`.
- **`markMindMapFailed`:** read the row the same way, then set `metadata: { ...keepDocumentIds(row?.metadata, args.metadata), ...errorMetadata }`.
- **`generateMindMap`:** `metadata: { documentIds }`.

`stuckJobs.ts` already spreads `row.metadata`, so it keeps `documentIds` without changes.

- [ ] **Step 1: Write the failing tests.**
  - Copy the setup from `convex/studio/jobMutations/audio.test.ts`: the module glob, then `preloadModules(modules, ["./studio/jobMutations/mindmaps.ts", "./studio/mindmaps/index.ts"])`.
  - Seed a user, a notebook (`{ userId, title, createdAt, updatedAt }`) and a mindmap row (`{ userId, notebookId, title: "Map", data: {}, status: "generating", metadata: { documentIds: ["d1", "d2"] }, createdAt, updatedAt }`). The ids are plain strings: `metadata` is `v.any()`.

```ts
test("saveMindMapResults keeps the map's sources", async () => {
  const { t, id } = await seedMindmap();
  await t.mutation(internal.studio.jobMutations.mindmaps.saveMindMapResults, {
    mindmapId: id,
    mindmap: { nodeData: { id: "root", topic: "Map", children: [] } },
    metadata: { title: "Map", nodeCount: 1 },
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"], nodeCount: 1 });
});

test("updateMindMapStatus keeps the map's sources when it replaces metadata", async () => {
  const { t, id } = await seedMindmap();
  await t.mutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
    mindmapId: id,
    status: "generating",
    metadata: { phase: "building", progress: 70 },
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"], phase: "building" });
});

test("markMindMapFailed keeps the map's sources", async () => {
  const { t, id } = await seedMindmap();
  await t.mutation(internal.studio.jobMutations.mindmaps.markMindMapFailed, {
    mindmapId: id,
    error: "boom",
    metadata: { phase: "finalizing" },
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.status).toBe("failed");
  expect(row?.metadata).toMatchObject({ documentIds: ["d1", "d2"] });
});

test("a row without sources stays without them", async () => {
  const { t, id } = await seedMindmap({ metadata: {} });
  await t.mutation(internal.studio.jobMutations.mindmaps.updateMindMapStatus, {
    mindmapId: id,
    status: "generating",
    metadata: { phase: "building" },
  });
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.metadata).not.toHaveProperty("documentIds");
});
```

  - **One more test, for `generateMindMap`:**
    - Insert a real `documents` row; copy the required fields from `convex/schema.ts` `documents`.
    - Call `api.studio.mindmaps.index.generateMindMap` as the owner (`t.withIdentity({ subject: userId, issuer: "test", tokenIdentifier: \`test|${userId}\` })`, as in `convex/studio/prompts/index.test.ts`).
    - Assert the new row's `metadata.documentIds` equals `[docId]`.
    - The mutation schedules the job. Don't run scheduled functions: no `t.finishAllScheduledFunctions`.
- [ ] **Step 2: Run the tests and make sure they fail.** `bunx vitest run --config vitest.convex.config.ts convex/studio/jobMutations/mindmaps.test.ts`
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the tests until they pass**, then `bun run typecheck:convex` and `bun run check:convex-codegen`. No new modules: a test file isn't a module.
- [ ] **Step 5: Commit.** `feat(studio): mind maps remember the sources they were built from` + blank line + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

### Task 2: Pure outline helpers

**Files:**
- Create: `apps/web/src/features/studio/components/mindmap/outline.ts`
- Test: `apps/web/src/features/studio/components/mindmap/outline.test.ts`

```ts
export interface OutlineNode {
  id: string;
  topic: string;
  children: OutlineNode[];
}

/** Five branch colours, cycled across the main branches (tokens in index.css). */
export const BRANCH_COLOR_COUNT = 5;

/** The CSS variable for main branch `index` (0-based), e.g. "var(--mindmap-branch-1)". */
export function branchColorVar(index: number): string {
  return `var(--mindmap-branch-${(index % BRANCH_COLOR_COUNT) + 1})`;
}

/** Fills in missing ids and topics, recursively. Non-object children become "Untitled" leaves. */
export function sanitizeNodeTree(node: unknown, fallbackTopic: string, isRoot = false): OutlineNode;

/** `# {title}` then the whole tree (open or not) as nested "- " bullets, two spaces per level. */
export function toMarkdown(title: string, root: OutlineNode): string;

/** "Discuss what these sources say about {topic}, in the context of {context}." */
export function askPrompt(topic: string, context: string): string;

/** Ids of every node that has children: what Expand all opens. */
export function collectBranchIds(root: OutlineNode): string[];
```

**Notes:**
- **`sanitizeNodeTree`:** move the body from `mindMapViewport.ts` on #368's branch. Read it with `git show origin/feature/studio-reading:apps/web/src/features/studio/components/mindmap/mindMapViewport.ts` (or from `main` once #368 has merged).
  - The return type is narrowed to `OutlineNode`: it keeps only `id`, `topic` and `children`, and drops other fields.
  - Ids that are missing or duplicated get a unique id. Use a counter inside the call (`let n = 0` in an outer function), not `Math.random`, so the ids are stable across renders.
  - Root id: `"root"` when missing.
- **`toMarkdown`:** the root itself isn't a bullet, because `title` is its heading. The children of the root are top-level bullets. Write topics as they are, with no escaping. It ends without a trailing newline.
- **`askPrompt`:** trim both inputs and keep their case.

- [ ] **Step 1: Write the failing tests.** Cover:
  - `branchColorVar(0)` is `"var(--mindmap-branch-1)"`, and `branchColorVar(5)` wraps back to `"…-1)"`;
  - `sanitizeNodeTree`:
    - a non-object root becomes `{ id: "root", topic: fallback, children: [] }`;
    - a blank topic becomes "Untitled";
    - extra fields are dropped;
    - two children with the same id get different ids;
    - repeated calls on the same input give the same ids;
  - `toMarkdown` on a three-level tree, which gives exactly:

```ts
expect(toMarkdown("Transformers", tree)).toBe(
  ["# Transformers", "", "- Attention", "  - Self-attention", "    - Queries", "- Training"].join("\n")
);
```

  - `askPrompt("Self-attention", "Attention")` gives `"Discuss what these sources say about Self-attention, in the context of Attention."`;
  - `collectBranchIds` returns only nodes with children, and includes the root if it has children.
- [ ] **Step 2: Run them and make sure they fail. Step 3: Implement. Step 4: Run them until they pass.** `bun run test src/features/studio/components/mindmap/outline.test.ts` (from `apps/web`)
- [ ] **Step 5: Commit.** `feat(studio): outline helpers for the mind map (markdown, prompts, tree cleaning)`

---

### Task 3: Choosing the sources, and wiring `onAskInChat`

**Files:**
- Create: `apps/web/src/features/notebooks/utils/askSources.ts` (+ `askSources.test.ts`)
- Modify: `apps/web/src/features/notebooks/components/views/NotebookView.tsx`
- Modify: `apps/web/src/features/studio/components/StudioPanel.tsx` and `ActiveNoteView.tsx` (adding the prop only; Task 6 removes full screen)
- Modify: `apps/web/src/shared/types/index.ts` and `apps/web/src/features/studio/services/notesApi.ts`

**`resolveAskSources`:**

```ts
interface AskSource { _id?: string; id?: string; status?: string; selected?: boolean }

/**
 * Which sources a Studio "ask in chat" uses. The map's own sources that still exist and are
 * processed win (sent as an override); otherwise the current selection (no override); otherwise
 * none, and the caller asks the user to select a source.
 */
export function resolveAskSources(
  sources: AskSource[],
  preferredIds: string[] | undefined
): { kind: "override"; documentIds: string[] } | { kind: "selection" } | { kind: "none" };
```

- Check how `sources` items are keyed in `NotebookView` (`useSourcesContext`): `_id` or `id`. Match it, and drop the other field from `AskSource` if it's unused.
- A source counts when `status === "completed"`. The override keeps the order of `preferredIds`.

**`NotebookView`:** add the handler next to `handleDiscussSourceTopic`, using the same values (`urlNotebookId`, `isChatStreaming`, `remoteGenerationBlocksSend`, `sources`, `toastError`, `setMobileActiveTab` and `onSendMessage`):

```tsx
const handleAskInChat = useCallback(
  (prompt: string, documentIds?: string[]) => {
    if (!urlNotebookId || isChatStreaming || remoteGenerationBlocksSend) return;
    const choice = resolveAskSources(sources, documentIds);
    if (choice.kind === "none") {
      toastError("Please select at least one source before asking a question");
      return;
    }
    setMobileActiveTab("chat");
    onSendMessage(
      prompt,
      undefined,
      { channels: ["notebook"] },
      choice.kind === "override" ? { documentIdsOverride: choice.documentIds } : undefined
    );
  },
  [isChatStreaming, onSendMessage, remoteGenerationBlocksSend, sources, toastError, urlNotebookId]
);
```

- Pass `onAskInChat={handleAskInChat}` to both `<StudioPanel>` renders: the desktop one in `renderRightPanel` and the mobile one in `mobileRightPanel`. Add it to both dependency arrays.
- `StudioPanelProps` gains `onAskInChat?: (prompt: string, documentIds?: string[]) => void`, which it forwards to `<ActiveNoteView onAskInChat={onAskInChat} />`.
- `ActiveNoteViewProps` gains the same prop and passes it to `<MindMapView onAskInChat={onAskInChat} />`.
  - Until Task 6 rewrites `MindMapView`, add `onAskInChat?` to its props interface and leave it unused, so the typecheck passes.

**Types and mapping:**
- `MindMapNote.metadata` becomes `{ error?: string; documentIds?: string[] } & StudioGenerationMetadata & Record<string, unknown>`.
- In `notesApi.ts`'s `case "mindmap"` metadata, add:

```ts
documentIds: Array.isArray(dbNote.metadata?.documentIds)
  ? dbNote.metadata.documentIds.filter((id: unknown): id is string => typeof id === "string")
  : undefined,
```

- [ ] **Step 1: Write the failing tests** for `resolveAskSources`:
  - preferred ids that are all completed → an override in the preferred order;
  - preferred ids with one deleted and one still processing → an override with only the completed one;
  - no preferred ids, with a selected completed source → `selection`;
  - preferred ids all gone, with a selected completed source → `selection`;
  - nothing usable → `none`;
  - an empty preferred array → treated like none preferred.
- [ ] **Step 2: Run them and make sure they fail. Step 3: Implement it all. Step 4: Run them until they pass,** then `bun run typecheck:web` and `bun run test src/features/studio src/features/notebooks`.
- [ ] **Step 5: Commit.** `feat(studio): Studio can ask the notebook chat, using a map's own sources`

---

### Task 4: Branch colour tokens and outline utilities

**Files:**
- Modify: `apps/web/src/index.css`

**Add the five branch tokens:**
- Set them in the light `:root` block and the `.dark` block, next to the `--studio-*` tokens. Read how those are declared and mirror it.
- **Light:** `oklch(0.6 0.13 30)`, `oklch(0.58 0.11 150)`, `oklch(0.56 0.12 250)`, `oklch(0.62 0.12 75)` and `oklch(0.58 0.13 320)`.
- **Dark:** raise the lightness to about 0.72 and keep the chroma and hue, e.g. `oklch(0.72 0.12 30)`.
- They're named `--mindmap-branch-1` … `--mindmap-branch-5`.

**Register the branch colour:** in the `@theme inline` block, add `--color-branch: var(--branch);`. The outline sets `--branch` on each main branch with `style`, and `bg-branch`, `bg-branch/12` and `text-branch` then work as normal colour utilities.

**Add three utilities, following the existing `@utility` blocks such as `studio-segment` and `reader-fade`:**

```css
/* Mind map outline: an open branch's children slide open by animating the grid row to 1fr. */
@utility mindmap-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.4s var(--ease-out-soft, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 0.3s;
  &[data-state="open"] {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  & > * {
    overflow: hidden;
    min-height: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

/* The soft guide line down an open branch, in the branch colour. */
@utility mindmap-guide {
  box-shadow: inset 1.5px 0 0 color-mix(in oklch, var(--branch) 32%, transparent);
}

/* A row's brief flash after it asks the chat. */
@utility mindmap-flash {
  animation: mindmap-flash 1.2s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes mindmap-flash {
  from {
    background-color: color-mix(in oklch, var(--branch) 22%, transparent);
  }
}
```

- If `index.css` defines the house ease-out curve as a variable, use it instead of the fallback. Search for `ease-out` or `--ease` near the other utilities.
- **Remove the `.mind-map-container` rules** (around lines 1135–1169 on #368's version). If #368 isn't merged yet, do this removal in Task 6 instead.

- [ ] **Step 1: Make the edits. Step 2: Check them:**
  - `bun run lint` and `bun run typecheck:web`;
  - `bun run build`, from `apps/web`, or `bunx vite build`, to confirm Tailwind accepts the utilities. Check that no build error mentions `mindmap-` or `branch`.
- [ ] **Step 3: Commit.** `feat(studio): branch colour tokens and outline utilities for the mind map`

---

### Task 5: `MindMapOutline` (requires #368 merged and `origin/main` merged in)

**Files:**
- Create: `apps/web/src/features/studio/components/mindmap/MindMapOutline.tsx`
- Test: `apps/web/src/features/studio/components/mindmap/MindMapOutline.test.tsx`

**Props:**

```ts
interface MindMapOutlineProps {
  title: string;
  root: OutlineNode;
  /** Absent outside a notebook: topics are then plain text. */
  onAsk?: (prompt: string) => void;
  /** True while the chat is answering or sending is blocked. */
  askDisabled?: boolean;
}
```

**Structure** (the mockup is `outline-style.html` option A, and `outline-count.html` option A for the counts):
- **Header:** `sticky top-0 z-10 flex items-center gap-2 bg-card px-4 py-3`.
  - The title is `<h2 className="flex-1 truncate font-display text-lg">`.
  - Then `Button variant="ghost" size="sm"` **Expand all** and **Collapse all**.
  - Then a `Button variant="ghost" size="icon-sm" aria-label="Copy as Markdown"`, with a `Copy` icon that switches to `Check` and the label "Copied" for 1.5 s.
- **Tree:** `<div role="tree" aria-label={title} className="px-2 pb-6">` holds one treeitem per child of the root. The root itself is the header title.
- **Each item:** `<div role="treeitem" aria-level={depth} aria-expanded={hasChildren ? open : undefined} aria-setsize aria-posinset tabIndex={focused ? 0 : -1} data-node-id={id}>`, containing:
  1. **A row:** `flex min-h-8 items-center gap-1.5 rounded-lg px-1.5 hover:bg-muted/40`, plus a focus-visible ring on the item: `outline-hidden focus-visible:ring-2 focus-visible:ring-ring`. Inside the row:
     - **The arrow toggle:**
       - It's a `<button type="button" tabIndex={-1} aria-label={open ? "Collapse {topic}" : "Expand {topic}"}>`.
       - It has no border: `grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground`.
       - It holds a `ChevronRight` with `transition-transform duration-300 ease-out` and `rotate-90` when open, plus `motion-reduce:transition-none`.
       - Leaves get a `size-6` spacer instead.
     - **On main branches only (depth 1):** a `size-2 rounded-full bg-branch` dot.
     - **The topic:**
       - When `onAsk` is set, it's a `<button type="button" tabIndex={-1}>` with `rounded-md px-1 font-serif hover:bg-branch/12 disabled:cursor-default disabled:hover:bg-transparent`, plus `text-base font-semibold` at depth 1 and `text-sm` deeper.
       - When `askDisabled`, the button is `disabled` and wrapped in `Tooltip` → `TooltipTrigger asChild` → `<span className="inline-flex">`, with `TooltipContent` "Wait for the chat to finish answering". This is the `SourcesPanelHeader.tsx:169-182` pattern.
       - Without `onAsk`, it's a plain `<span>`.
     - **The count:** `ml-auto pr-1 font-sans text-xs tabular-nums text-muted-foreground transition-opacity` with `opacity-0` when open. It's the number of direct children, and is `aria-hidden` (the treeitem's name doesn't need it; `aria-expanded` covers state).
  2. **If it has children:** `<div role="group" className="mindmap-collapse ml-4 pl-2.5 mindmap-guide" data-state={open ? "open" : "closed"}><div>{children}</div></div>`.
     - Render the children only once the branch has been opened (keep a `seen` set), so 300-node maps don't mount everything at first. After that, keep them mounted, so closing animates.
- **Branch colour:** set `style={{ "--branch": branchColorVar(i) } as React.CSSProperties}` on each depth-1 item, so all its descendants inherit it.

**State:**
- `open: Set<string>`, starting empty, so only the main branches show.
- `focusedId`, starting as the first main branch's id.
- `seen: Set<string>`.
- `flashId`, cleared after 1.2 s, which adds `mindmap-flash` to that row.
- **Expand all:** `setOpen(new Set(collectBranchIds(root)))`, and add those ids to `seen`.
- **Collapse all:** an empty set. If the focused item is now hidden, move focus to its depth-1 ancestor.

**Asking:**
- `ask(node, parentTopic)`: if `!onAsk || askDisabled`, do nothing.
- Otherwise call `onAsk(askPrompt(node.topic, parentTopic))`, where `parentTopic` is the parent's topic, or `title` for depth 1, then set `flashId = node.id`.
- **Clicking the topic** calls `ask`. **Clicking the arrow** toggles the branch only, and calls `event.stopPropagation()`.

**Keyboard** (on the tree element, with `onKeyDown` delegated to the focused treeitem). Build `visible`, a flat list of the currently visible items in order (depth-first, descending only into open ids), each with `{ node, depth, parentId }`.
- `ArrowDown` and `ArrowUp` move to the next or previous visible item.
- `ArrowRight`: on a closed branch it opens it; on an open branch it moves to its first child; on a leaf it does nothing.
- `ArrowLeft`: on an open branch it closes it; otherwise it moves to the parent, unless the parent is the root.
- `Home` and `End` go to the first and last visible items.
- `Enter` asks.
- `*` opens all siblings of the focused item.
- After moving, call `focus()` on `[data-node-id="…"]` through a refs map, and `preventDefault` on handled keys.
- **Focus follows clicks:** clicking a row's topic or arrow sets `focusedId` to that row.

**Copy as Markdown:**

```ts
const copy = async () => {
  try {
    await navigator.clipboard.writeText(toMarkdown(title, root));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  } catch {
    toastError("Couldn't copy the mind map");
  }
};
```

- `toastError` comes from `useToast()` in `@/shared/contexts/useToast` (`const { error: toastError } = useToast()`).
- Clear the timer on unmount.

- [ ] **Step 1: Write the failing tests.**
  - **Setup:**
    - Use a six-branch fixture, so the colour wraps, with one branch three levels deep.
    - Mock `@/shared/contexts/useToast` the way other tests do (`grep -rn "vi.mock(\"@/shared/contexts/useToast\"" apps/web/src | head -3`).
    - Stub `navigator.clipboard.writeText` with `vi.fn().mockResolvedValue(undefined)`, using `Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })`.
  - **Tests:**
    - Only the main branches show at first. Each shows its child count, and `role="treeitem"` has `aria-level="1"` and `aria-expanded="false"`.
    - Clicking "Expand Attention" shows its children, and the count gets `opacity-0`.
    - Expand all shows every topic; Collapse all hides them again.
    - Clicking a topic calls `onAsk` with the depth-1 prompt (context = title) and the nested prompt (context = parent topic). The arrow doesn't call `onAsk`.
    - With `askDisabled`, clicking the topic doesn't call `onAsk`, and the topic button is disabled.
    - Without `onAsk`, topics aren't buttons.
    - Keyboard: focus the first item, then:
      - `ArrowDown` → the second item;
      - `ArrowRight` opens it, and `ArrowRight` again → its first child;
      - `ArrowLeft` → the parent, and `ArrowLeft` again closes it;
      - `End` and `Home`;
      - `Enter` asks.
    - Only one item has `tabIndex=0` at a time.
    - Copy writes exactly `toMarkdown(title, root)` and the button's name becomes "Copied". A rejected `writeText` calls the toast error.
    - The depth-1 items carry `--branch: var(--mindmap-branch-N)`, and the sixth wraps to 1.
- [ ] **Step 2: Run them and make sure they fail. Step 3: Implement. Step 4: Run them until they pass,** then:
  - `bunx eslint --max-warnings 0 src/features/studio/components/mindmap/MindMapOutline.tsx`, from `apps/web` (0 findings). Add the `mindmap` folder to `MIGRATED` in Task 6.
  - `bun run typecheck:web`.
- [ ] **Step 5: Commit.** `feat(studio): mind map outline, an accessible tree that reads like notes`

---

### Task 6: `MindMapView` on the outline; full screen and Mind Elixir removed

**Files:**
- Rewrite: `apps/web/src/features/studio/components/views/MindMapView.tsx` (+ `MindMapView.test.tsx`)
- Modify: `apps/web/src/features/studio/components/ActiveNoteView.tsx` and `StudioPanel.tsx`
- Delete: `apps/web/src/features/studio/components/mindmap/mindMapViewport.ts` and `mindMapViewport.test.ts`
- Modify: `apps/web/src/App.tsx` (remove `import "mind-elixir/style.css";`), `apps/web/vite.config.ts` (remove the `mind-elixir` manualChunks rule), `apps/web/src/index.css` (the `.mind-map-container` rules, if Task 4 couldn't), and `apps/web/eslint.config.mjs` (add `"src/features/studio/components/mindmap/**/*.tsx"` to `MIGRATED`)
- Run: `bun remove mind-elixir`, from `apps/web`. It updates `package.json` and `bun.lock`; never hand-edit `bun.lock`.

**`MindMapView`:**
- **Props:** `{ note: MindMapNote; onBack?: () => void; onAskInChat?: (prompt: string, documentIds?: string[]) => void }`. `isExpanded` and `onToggleExpanded` are gone.
- **Busy state:** `const { isChatStreaming, remoteGenerationBlocksSend } = useChatStreamingContext();`, from `@/features/chat/useChatStreaming`.
  - That hook throws outside its provider. `MindMapView` is only rendered inside the notebook, which has the provider, but tests must mock it, as `ChatPanel.header.test.tsx` does.
- **Layout:**
  - The outer element is `flex h-full flex-col bg-card duration-300 ease-out animate-in fade-in slide-in-from-right-4`.
  - The mobile back bar is kept, as in the #368 version ("Back to Studio").
  - The body is a `min-h-0 flex-1 overflow-y-auto` wrapper holding `<MindMapOutline title={note.title} root={root} onAsk={onAskInChat ? (p) => onAskInChat(p, note.metadata?.documentIds) : undefined} askDisabled={isChatStreaming || remoteGenerationBlocksSend} />`.
  - `root = useMemo(() => sanitizeNodeTree(note.mindMapData?.nodeData, note.title?.trim() || "Mind Map", true), [note.mindMapData, note.title])`.
- **States:**
  - **failed:** keep #368's `Alert`, using the hardened `errorMessage`, plus `Empty`;
  - **no `mindMapData`:** `Empty`, "No mind map data available";
  - **a root with no children:** `Empty`, "This mind map has no topics".
- **`ActiveNoteView` and `StudioPanel`:** remove `isMindMapExpanded`, `onToggleMindMap` and their state, and pass only `note`, `onBack={undefined}` and `onAskInChat`.

- [ ] **Step 1: Rewrite `MindMapView.test.tsx`.** It no longer mocks `mind-elixir`; it mocks `useChatStreamingContext`. Cover:
  - a completed note renders the outline with its main branches;
  - clicking a topic calls `onAskInChat` with the prompt and `note.metadata.documentIds`;
  - while `isChatStreaming` is true, a click doesn't call it;
  - failed → an alert (keep #368's malformed-error test);
  - no data → "No mind map data available";
  - an empty root → "This mind map has no topics";
  - "Back to Studio" calls `onBack`.
- [ ] **Step 2: Run it and make sure it fails. Step 3: Implement, delete the files, remove the dependency, and update `MIGRATED`.**
- [ ] **Step 4: Gates:**
  - From `apps/web`: `bun run test src/features/studio`, and `bunx eslint --max-warnings 0 src/features/studio/components/views/MindMapView.tsx src/features/studio/components/mindmap`.
  - From the root:
    - `bun run typecheck:web`;
    - `bun run lint`;
    - `bun run lint:design`, then `:update` if the counts dropped;
    - `bun run knip`: nothing should be left over from Mind Elixir or the viewport helpers;
    - `git grep -n "mind-elixir\|mind-map-container\|isMindMapExpanded"`, which should find nothing.
- [ ] **Step 5: Commit.** `feat(studio): the mind map becomes an outline; Mind Elixir and full screen removed`

---

### Task 7: e2e behind the AI gate

**Files:**
- Modify: `e2e/studio/mindmap-generation.spec.ts`

- Add `test("opens a generated mind map as an outline", …)` in the same `E2E_AI_ENABLED`-gated block as the completion test there, reusing its setup.
- **Steps:**
  1. After completion, click `firstStudioNoteCard`.
  2. Expect a visible `getByRole("tree")`. Use `.filter({ visible: true })`, since the notebook mounts two Studio panels.
  3. Take its first `treeitem`, and click the button whose name starts with "Expand".
  4. Expect a `treeitem` with `aria-level="2"` to be visible.
- Don't click a topic: that would send a chat message.
- Run `bunx playwright test --list e2e/studio/mindmap-generation.spec.ts` and confirm the new test is listed. Don't run it for real.
- Commit: `test(e2e): a generated mind map opens as an outline`

---

### Task 8: Gates, visual check and PR (controller)

- **Gates:**
  - `bun run typecheck:web`, `bun run typecheck:convex`;
  - `bun run lint`, `bun run lint:design`, `bun run knip`, `bun run check:convex-codegen`;
  - `bun run test:web`;
  - `bunx vitest run --config vitest.convex.config.ts convex/studio`;
  - `bunx playwright test --list`.
- **Visual check:**
  - Use your own background tab on the dev server (this worktree's port; see CLAUDE.md "Dev server ports").
  - Check a real mind map at 1440px and 375px, in light and dark, with reduced motion on and off.
  - Check the opening state, the arrows, Expand all and Collapse all, copying, and the keyboard.
  - Don't click a topic without the user's go-ahead, because it sends a chat message.
- **PR:** "feat(studio): the mind map becomes an outline you can ask about". Its body links the spec and plan, and says `Part of #264`.
