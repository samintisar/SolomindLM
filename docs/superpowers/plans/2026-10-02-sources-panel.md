# Sources Panel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Sources panel (list, rows, header, viewer, PDF viewer) on shadcn primitives in the soft layered style, with keyboard-usable rows, real checkboxes and menus, and 0 design-lint findings in those files.

**Architecture:** A new `Item` primitive (shadcn CLI) gets a `grouped` variant: one soft card holding the source rows. Each feature component is rewritten in place and keeps its props API, so `SourcesPanel` wiring barely changes. Behaviour-preserving tests come first. E2E selectors move from styling classes to roles in the same PR.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (Radix), vitest 4 + Testing Library (`userEvent`), Playwright 1.63, react-pdf.

**Spec:** `docs/superpowers/specs/2026-10-02-sources-panel-design.md`. Read it and `docs/design/principles.md` before any task.
**Issue:** #261 (part 1 of 3).
**Branch:** `feature/ds-migrate-sources-panel`, stacked on `feature/soft-layered-design` (#282).
**Worktree:** `C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb`.

## Ground rules for every task

- **Tools:** use Read/Edit/Write/Bash in the worktree. Serena is bound to another checkout, so don't use it.
- **Formatting:** after edits, run `bunx biome check --write <changed files>` from the repo root.
- **Commits:**
  - One commit per task, with a conventional message ending in a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Stage files by explicit path. Never use `git add -A` or `.`, and never a bare `git stash`.
- **Processes:** never kill processes by name. A Vite dev server on :5173 runs from this worktree; leave it running.
- **Data:** don't click anything in the app that deletes data or costs credits.
- **Tests:** run from `apps/web` with `bunx vitest run --config vitest.config.ts <paths>`. Radix jsdom shims are global.
- **Typecheck:** `bun run typecheck:web`.
- **Design lint:** `bun run lint:design` from the repo root must not increase. Only Task 10 runs `:update`.
- **House rules:**
  - Feature code puts only layout classes on ui components (`shadcn/no-restyle`).
  - No palette colours, arbitrary values, `dark:` utilities, or inline styles (except Task 7's one CSS variable).
  - Theme tokens: `bg-surface-raised`, `ring-hairline`, `bg-overlay`, `text-link`.
  - Content text is serif; controls are sans.
  - Errors must reach the user (`useToast()` from `@/shared/contexts/useToast`); no silent catches.
- **Tooltips:** use `ControlTooltip` from `apps/web/src/features/chat/components/ControlTooltip.tsx` only if it is already exported from a shared location. Otherwise use `Tooltip`, `TooltipTrigger asChild` and `TooltipContent` from `@/shared/components/ui/tooltip` directly. Feature code must not import from another feature.

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/shared/components/ui/item.tsx` | new (CLI) + `grouped` variant | grouped list rows |
| `apps/web/src/shared/components/ui/ui.smoke.test.tsx` | modify | Item contract |
| `apps/web/src/features/sources/hooks/useSourceManager.ts` (+ `.test.ts` new) | modify | rollback on failed delete/rename |
| `apps/web/src/features/sources/components/SourceListItem.tsx` (+ `.test.tsx` new) | rewrite | one row |
| `apps/web/src/features/sources/components/SourceList.tsx` (+ `.test.tsx` new) | rewrite | actions, search, count, list, empty |
| `apps/web/src/features/sources/components/SourcesPanel.tsx` | modify | shell: scroll body, divider |
| `apps/web/src/features/sources/components/SourcesPanelHeader.tsx` (+ test) | rewrite | one responsive header |
| `apps/web/src/features/sources/components/SourceViewer.tsx`, `YouTubeVideoPreview.tsx` (+ tests) | modify | viewer states, guide card, view switch |
| `apps/web/src/features/sources/components/PdfViewer.tsx` | modify | toolbar, outline, page height variable |
| `SourceGuide.tsx`, `SourceGuide.test.tsx`, `hooks/useSourceGuide.ts` | delete | dead UI (#252) |
| `e2e/helpers/source-assertions.ts`, `e2e/sources/source-list.spec.ts` | modify | role-based selectors |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | modify | `MIGRATED` + baseline |

---

## Task 1: `Item` primitive with a `grouped` variant

**Files:** create `apps/web/src/shared/components/ui/item.tsx` (CLI); modify `apps/web/src/shared/components/ui/ui.smoke.test.tsx`.

- [ ] **Step 1: Add the component.** From `apps/web`, run `bunx --bun shadcn@latest add item`.
  - Then fix the CLI side effects:
    - Rewrite `import { cn } from "cn"` (or similar) to `import { cn } from "@/shared/utils/cn"`.
    - Remove any bogus `cn` / `next-themes` entries the CLI added to `apps/web/package.json`.
    - Revert any unrelated file the CLI touched (check `git status`).
  - If the CLI added `separator` changes, keep the repo's existing `separator.tsx`.
- [ ] **Step 2: Write the failing smoke test** in `ui.smoke.test.tsx`. Import the Item parts.

```tsx
describe("item rows", () => {
  it("groups rows on one soft surface", () => {
    render(
      <ItemGroup variant="grouped" data-testid="group">
        <Item data-testid="row">
          <ItemContent>
            <ItemTitle>Row</ItemTitle>
            <ItemDescription>Meta</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
    );
    const group = screen.getByTestId("group");
    expect(group).toHaveAttribute("data-variant", "grouped");
    expect(group).toHaveClass("rounded-2xl", "bg-card", "ring-1", "ring-hairline", "overflow-hidden");
    expect(group.className).not.toMatch(/(^|\s)border(\s|$)/);
    expect(group.className).not.toContain("dark:");
    expect(screen.getByTestId("row")).toHaveAttribute("data-slot", "item");
  });
});
```

  Run it. It FAILS because there is no `variant` on `ItemGroup`.
- [ ] **Step 3: Add the variant.** In `item.tsx`, turn `ItemGroup` into a cva component. Keep the CLI's base classes and `role="list"`.
  - **Group variants:**

```tsx
const itemGroupVariants = cva("group/item-group flex flex-col", {
  variants: {
    variant: {
      default: "",
      // One in-flow surface; rows are separated by hairlines (docs/design/principles.md).
      grouped:
        "overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-hairline divide-y divide-border/60",
    },
  },
  defaultVariants: { variant: "default" },
});
```

  - **`ItemGroup`:** render `data-slot="item-group"`, `data-variant={variant ?? "default"}`, and `className={cn(itemGroupVariants({ variant }), className)}`.
  - **`Item` inside a grouped group:** check the CLI's `itemVariants`.
    - Remove any `border`, `border-border` or outline styling from the `default` variant. Leave the `outline` variant if one exists, but nothing in sources uses it.
    - Rows inside a grouped group must have no radius and no border of their own. Add `group-data-[variant=grouped]/item-group:rounded-none group-data-[variant=grouped]/item-group:border-0` to the item base.
  - **Row hover:** `hover:bg-muted/60` only where the CLI's `asChild` link-style hover lives, i.e. `[a]:hover:bg-muted/60`. Rows are not clickable themselves (see Task 3).
  - **Item separator:** if the CLI's `ItemSeparator` draws a `Separator`, leave it. Grouped lists use the `divide-y` instead.
- [ ] **Step 4: Run tests and checks.**
  - `bunx vitest run --config vitest.config.ts src/shared/components/ui` should PASS.
  - `bun run typecheck:web` should be clean.
  - `bun run lint:design` should print OK. `ui/**` has soft-surfaces off. If `item.tsx` trips `shadcn/no-arbitrary-values` on upstream idioms, add `"item"` to `UPSTREAM_ARBITRARY` in `apps/web/eslint.config.mjs`. That list is only for CLI components, and this is one.
- [ ] **Step 5: Commit.** `feat(web): Item primitive with a grouped list variant` (`Refs #261`). Stage `item.tsx`, `ui.smoke.test.tsx`, plus `eslint.config.mjs` and `package.json` only if changed.

---

## Task 2: Roll back failed delete and rename in `useSourceManager`

**Files:** modify `apps/web/src/features/sources/hooks/useSourceManager.ts`; create `apps/web/src/features/sources/hooks/useSourceManager.test.ts`.

Today, `handleDeleteSource` and `handleRenameSource` update local state before the mutation and only toast if it fails. The `documents` effect re-syncs only when the server data changes, so after a failure the UI keeps showing a change that never happened. Bulk delete (`handleDeleteSelectedSources`) waits for the mutation and doesn't touch local state, so it needs no rollback.

- [ ] **Step 1: Write the failing tests.**

```ts
import type { Doc } from "@convex/_generated/dataModel";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteDocument = vi.fn();
const updateDocument = vi.fn();
const removeMany = vi.fn();
const showError = vi.fn();

vi.mock("../services/documentsApi", () => ({
  useDeleteDocument: () => deleteDocument,
  useUpdateDocument: () => updateDocument,
  useRemoveManyDocuments: () => removeMany,
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: showError, success: vi.fn(), info: vi.fn() }),
}));

import { useSourceManager } from "./useSourceManager";

const doc = (id: string, fileName: string) =>
  ({ _id: id, fileName, fileType: "md", status: "completed", _creationTime: 0 }) as unknown as Doc<"documents">;

describe("useSourceManager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores a source when delete fails", async () => {
    deleteDocument.mockRejectedValueOnce(new Error("nope"));
    const documents = [doc("a", "A.md"), doc("b", "B.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    await act(() => result.current.handleDeleteSource("a"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["a", "b"]);
    expect(showError).toHaveBeenCalledWith("nope");
  });

  it("restores the old title when rename fails", async () => {
    updateDocument.mockRejectedValueOnce(new Error("denied"));
    const documents = [doc("a", "A.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    const before = result.current.sources[0].title;
    await act(() => result.current.handleRenameSource("a", "New name"));
    expect(result.current.sources[0].title).toBe(before);
    expect(showError).toHaveBeenCalledWith("denied");
  });

  it("keeps the delete when it succeeds", async () => {
    deleteDocument.mockResolvedValueOnce(undefined);
    const documents = [doc("a", "A.md"), doc("b", "B.md")];
    const { result } = renderHook(() => useSourceManager({ documents, notebookId: "n" }));
    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    await act(() => result.current.handleDeleteSource("a"));
    expect(result.current.sources.map((s) => s.id)).toEqual(["b"]);
  });
});
```

  Check how `documentToSource` (`@/shared/utils/documentToSource`) maps a document, and add any fields it requires to the `doc()` helper. Run the tests. The first two FAIL.
- [ ] **Step 2: Implement the rollback.** Use a ref that mirrors `sources`, so the handlers can snapshot without stale closures. Add these near the state:

```ts
const sourcesRef = useRef<Source[]>([]);
useEffect(() => {
  sourcesRef.current = sources;
}, [sources]);
```

  Then replace the two handlers:

```ts
const handleDeleteSource = useCallback(
  async (sourceId: string) => {
    const snapshot = sourcesRef.current;
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    try {
      await deleteDocumentMutation(sourceId);
    } catch (error) {
      console.error("Failed to delete source:", error);
      setSources(snapshot);
      showError(error instanceof Error ? error.message : "Failed to delete source");
    }
  },
  [deleteDocumentMutation, showError]
);

const handleRenameSource = useCallback(
  async (sourceId: string, newTitle: string) => {
    const previousTitle = sourcesRef.current.find((s) => s.id === sourceId)?.title;
    setSources((prev) => prev.map((s) => (s.id === sourceId ? { ...s, title: newTitle } : s)));
    try {
      await updateDocument(sourceId, { title: newTitle });
    } catch (error) {
      console.error("Failed to rename source:", error);
      if (previousTitle !== undefined) {
        setSources((prev) =>
          prev.map((s) => (s.id === sourceId ? { ...s, title: previousTitle } : s))
        );
      }
      showError(error instanceof Error ? error.message : "Failed to rename source");
    }
  },
  [updateDocument, showError]
);
```

  Delete restores the whole snapshot, which keeps the order and the selection. Rename restores only the title, so concurrent edits to other rows survive.
- [ ] **Step 3: Run tests and typecheck.** Run vitest on `src/features/sources/hooks` (PASS), then `bun run typecheck:web`.
- [ ] **Step 4: Commit.** `fix(sources): roll back a failed delete or rename` (`Refs #261`).

---

## Task 3: `SourceListItem` on Item, Checkbox and DropdownMenu

**Files:** rewrite `apps/web/src/features/sources/components/SourceListItem.tsx`; create `SourceListItem.test.tsx`.

The props interface stays exactly as it is today: `source`, `isRenaming`, `renameValue`, `onRenameChange`, `onRenameSubmit`, `onRenameCancel`, `onToggle`, `onView`, `onDelete`, `onRefreshSource`, `onMenuOpen`, `onStartRename`, `isMenuOpen`. Read the current file first, because the icon logic (`getIcon`), the paper hint (`paperMetaHint`), the remote-refresh condition (`remoteRefreshKind` or similar) and the exact meta line text must all be carried over unchanged.

- [ ] **Step 1: Write the failing tests.**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Source } from "@/shared/types";
import { SourceListItem } from "./SourceListItem";

const base: Source = { id: "s1", title: "SQL cheatsheet", type: "MD", date: "Jan 30", selected: true, status: "completed" };

function setup(overrides: Partial<React.ComponentProps<typeof SourceListItem>> = {}, source: Partial<Source> = {}) {
  const props = {
    source: { ...base, ...source },
    isRenaming: false,
    renameValue: "",
    onRenameChange: vi.fn(),
    onRenameSubmit: vi.fn(),
    onRenameCancel: vi.fn(),
    onToggle: vi.fn(),
    onView: vi.fn(),
    onDelete: vi.fn(),
    onRefreshSource: vi.fn(),
    onMenuOpen: vi.fn(),
    onStartRename: vi.fn(),
    isMenuOpen: false,
    ...overrides,
  };
  render(<SourceListItem {...props} />);
  return props;
}

describe("SourceListItem", () => {
  it("opens the source from its main button, by click and keyboard", async () => {
    const p = setup();
    const open = screen.getByRole("button", { name: /SQL cheatsheet/ });
    await userEvent.click(open);
    open.focus();
    await userEvent.keyboard("{Enter}");
    expect(p.onView).toHaveBeenCalledTimes(2);
    expect(p.onView).toHaveBeenCalledWith("s1");
  });

  it("can't be opened while processing, and says so", () => {
    setup({}, { status: "processing" });
    expect(screen.getByRole("button", { name: /SQL cheatsheet/ })).toBeDisabled();
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows Failed for failed sources", () => {
    setup({}, { status: "failed" });
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("toggles chat inclusion with a labelled checkbox", async () => {
    const p = setup();
    const box = screen.getByRole("checkbox", { name: "Include SQL cheatsheet in chat" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(p.onToggle).toHaveBeenCalledWith("s1");
    expect(p.onView).not.toHaveBeenCalled();
  });

  it("offers rename and delete in its menu", async () => {
    const p = setup({ isMenuOpen: true });
    expect(screen.getByRole("button", { name: "More options" })).toHaveAttribute("title", "More options");
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    expect(p.onStartRename).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("menuitem", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("deletes through the menu", async () => {
    const p = setup({ isMenuOpen: true });
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledWith("s1", "SQL cheatsheet");
  });

  it("renames inline: Enter submits trimmed, Escape cancels", async () => {
    const p = setup({ isRenaming: true, renameValue: "  New  " });
    const input = screen.getByRole("textbox", { name: "Rename source" });
    expect(input).toHaveFocus();
    await userEvent.type(input, "{Enter}");
    expect(p.onRenameSubmit).toHaveBeenCalledWith("s1", "New");
    await userEvent.type(input, "{Escape}");
    expect(p.onRenameCancel).toHaveBeenCalled();
  });
});
```

  Add one more test: a source that qualifies for remote refresh (copy the qualifying condition from the current file, e.g. a WEB source with a URL) shows a "Refresh" menu item, and clicking it calls `onRefreshSource("s1")`. Run the tests. They FAIL.
- [ ] **Step 2: Implement.** Keep `getIcon` and `paperMetaHint` from the old file, with the icon classes changed to `size-5`. Structure:

```tsx
<Item data-source-id={source.id} className="gap-2 px-2 py-1.5">
  {isRenaming ? (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-1">
      <ItemMedia variant="icon">{getIcon()}</ItemMedia>
      <Input
        autoFocus
        aria-label="Rename source"
        value={renameValue}
        onChange={(e) => onRenameChange(e.target.value)}
        onKeyDown={handleRenameKeyDown}
        onBlur={() => (renameValue.trim() ? onRenameSubmit(source.id, renameValue.trim()) : onRenameCancel())}
        className="h-8"
      />
    </div>
  ) : (
    <button
      type="button"
      onClick={() => onView(source.id)}
      disabled={status === "processing"}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-left outline-hidden hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <ItemMedia variant="icon">{getIcon()}</ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full">
          <span className="truncate">{source.title}</span>
          {status === "processing" && (
            <Badge variant="secondary">
              <Spinner aria-hidden />
              Processing
            </Badge>
          )}
          {status === "failed" && <Badge variant="destructive">Failed</Badge>}
        </ItemTitle>
        <ItemDescription className="truncate">{/* the old meta line text, unchanged, incl. paperHint */}</ItemDescription>
      </ItemContent>
    </button>
  )}
  <ItemActions className="gap-1">
    <Checkbox
      checked={source.selected}
      onCheckedChange={() => onToggle(source.id)}
      aria-label={`Include ${source.title} in chat`}
    />
    <DropdownMenu
      modal={false}
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (open !== isMenuOpen) onMenuOpen(source.id);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="More options" title="More options">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canRemoteRefresh && (
          <DropdownMenuItem onSelect={() => onRefreshSource(source.id)}>
            <RefreshCw />
            Refresh
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onStartRename(source.id)}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(source.id, source.title)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </ItemActions>
</Item>
```

  Notes:
  - **`canRemoteRefresh`** is the old file's condition for showing Refresh. Keep it exactly.
  - **Layout-only classes on ui components:** if `no-restyle` rejects a class on `Item`/`ItemTitle`/`ItemDescription`/`Input` (e.g. `px-2 py-1.5`, `h-8`), drop it, or add a `size="sm"` variant to `item.tsx` (the CLI ships `size`). Don't fight the linter at the call site.
  - **The open-button:** it's a plain `<button>` in feature code. That's allowed, and the soft-surfaces rule only bans borders on it. Its focus ring and radius are fine.
  - **Paper-hint `title`:** if the old row had a `title` carrying the paper hint, drop it, because the hint already shows in the description.
  - **What goes away:** the old `onClick` on the root div, the click-outside overlay, every `z-*` and `stopPropagation`, the `CheckSquare`/`Square` icons, and `Loader2`/`XCircle`.
- [ ] **Step 3: Run checks.**
  - Run vitest on `src/features/sources`; it should PASS.
  - Run `bunx eslint -c eslint.config.mjs src/features/sources/components/SourceListItem.tsx` from `apps/web`; expect 0 problems.
  - Run `bun run typecheck:web`.
- [ ] **Step 4: Commit.** `feat(sources): source rows on Item with a real checkbox and menu` (`Refs #261`).

---

## Task 4: `SourceList` actions, search, count, grouped rows, empty state; `SourcesPanel` shell

**Files:** rewrite `apps/web/src/features/sources/components/SourceList.tsx`; create `SourceList.test.tsx`; modify `SourcesPanel.tsx`.

The props interface stays unchanged (see the current file: `sources`, `filteredSources`, `searchQuery`, `onSearchChange`, `onToggleAll`, …, `canRefreshAll`, `isRefreshing`).

- [ ] **Step 1: Write the failing tests.** Render with a `props()` helper that fills every prop with `vi.fn()` or a default.

```tsx
it("disables bulk actions when they can't run", () => {
  render(<SourceList {...props({ selectedCount: 0, canRefreshAll: false })} />);
  expect(screen.getByRole("button", { name: /Delete selected/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Refresh all/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /Add source/i })).toHaveAttribute("data-onboarding", "add-source-button");
  expect(screen.getByRole("button", { name: /Add source/i })).toHaveAttribute("title", "Add Source");
});

it("shows the selection count and toggles all", async () => {
  const p = props({ selectedCount: 2, sources: three, filteredSources: three, allSelected: false });
  render(<SourceList {...p} />);
  expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Select all" }));
  expect(p.onToggleAll).toHaveBeenCalled();
});

it("renders rows in one grouped list", () => {
  render(<SourceList {...props({ sources: three, filteredSources: three })} />);
  const group = screen.getByRole("list");
  expect(group).toHaveAttribute("data-variant", "grouped");
  expect(screen.getAllByRole("checkbox")).toHaveLength(3);
});

it("invites adding a first source when empty", async () => {
  const p = props({ sources: [], filteredSources: [] });
  render(<SourceList {...p} />);
  expect(screen.getByText("Add your first source")).toBeInTheDocument();
});
```

  - `three` is an array of 3 `Source` fixtures.
  - Keep the old empty-state copy for the no-search-results case. Read the current file: it probably distinguishes "no sources" from "no matches".
  - Run the tests. They FAIL.
- [ ] **Step 2: Implement.**
  - **Actions row:** `<div className="flex items-center gap-2 @container">`.
    - **Add source:** `<Button className="flex-1" onClick={onAddSource} title="Add Source" data-onboarding="add-source-button"><Plus />Add source</Button>`.
    - **Tray:** `<ButtonGroup variant="tray" aria-label="Source actions">`, holding three ghost `icon-sm` Buttons. Each has an aria-label and a tooltip:
      - Discover (`Telescope` or `Search` icon, same as today), calls `onDiscoverClick`;
      - "Refresh all": `RefreshCw`, which becomes `Spinner` while `isRefreshing`; disabled when `!canRefreshAll || isRefreshing`;
      - "Delete selected": `Trash2`; disabled when `selectedCount === 0`.
    - The buttons are icon-only inside the tray, so drop the old `@min-[300px]` label logic for them. The Add source label stays.
    - Keep `title` attributes that e2e uses. Grep `e2e/` for `title="Discover"` etc. before removing any.
  - **Search:** an `InputGroup` containing `<InputGroupAddon><Search /></InputGroupAddon>` and `<InputGroupInput type="search" aria-label="Search sources" placeholder="Search sources..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} />`.
  - **Count row:** `<div className="flex items-center justify-between font-sans text-xs text-muted-foreground"><span>{selectedCount} of {sources.length} selected</span><Button variant="ghost" size="xs" onClick={onToggleAll}>{allSelected ? "Deselect all" : "Select all"}</Button></div>`.
    - Show it only when `sources.length > 0`.
    - Use `size="sm"` if `xs` doesn't exist on this branch.
  - **Rows:** `<ItemGroup variant="grouped">{filteredSources.map((s) => <SourceListItem key={s.id} ... />)}</ItemGroup>`, passing the same props as today.
  - **Empty state (`sources.length === 0`):**

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FileText /></EmptyMedia>
    <EmptyTitle>Add your first source</EmptyTitle>
    <EmptyDescription>Upload files, paste links or import papers to ground your notebook.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button onClick={onAddSource}><Plus />Add source</Button>
  </EmptyContent>
</Empty>
```

    Check `empty.tsx` for the real part names, and adapt.
  - **No matches** (`sources.length > 0 && filteredSources.length === 0`): keep the old copy in a plain `<p className="py-6 text-center text-sm text-muted-foreground">`.
  - Replace `text-[13px]` with `text-xs` or `text-sm`.
- [ ] **Step 3: `SourcesPanel.tsx`.**
  - Line ~342 has `border-r-2`. Change it to `border-r border-border/60`, or remove it if the panel already sits in a resizable layout with its own handle; check `NotebookView.tsx`.
  - Leave the scroll body (`overflow-y-auto`, ~:364) as a native element. Replace any arbitrary classes with tokens.
  - Don't touch modal wiring.
- [ ] **Step 4: Run checks.**
  - Run vitest on `src/features/sources`; it should PASS.
  - Run eslint on `SourceList.tsx` and `SourcesPanel.tsx`; expect 0.
  - Run `bun run typecheck:web`.
- [ ] **Step 5: Commit.** `feat(sources): source list on a grouped Item list with an action tray` (`Refs #261`).

---

## Task 5: One responsive `SourcesPanelHeader`

**Files:** rewrite `apps/web/src/features/sources/components/SourcesPanelHeader.tsx`; modify `SourcesPanelHeader.test.tsx`.

Read the current file. It has a mobile block (`md:hidden`, ~:40) and a desktop block (`hidden md:flex`, ~:151) with near-identical markup. Keep the props interface.

- [ ] **Step 1: Write the failing tests** (add them to the existing file).

```tsx
it("has one labelled back button and one open link in viewer mode", () => {
  renderHeader({ /* viewer-mode props as the existing tests do */ });
  expect(screen.getAllByRole("button", { name: "Back to sources" })).toHaveLength(1);
  expect(screen.getAllByRole("link", { name: "Open source in new tab" })).toHaveLength(1);
});

it("renames the title: Enter submits, Escape reverts", async () => {
  const p = renderHeader({ /* viewer mode */ });
  await userEvent.click(screen.getByRole("button", { name: /Rename/ }));
  const input = screen.getByRole("textbox", { name: "Rename source" });
  await userEvent.clear(input);
  await userEvent.type(input, "New title{Enter}");
  expect(p.onRename).toHaveBeenCalledWith(/* id, */ "New title");
});
```

  Use the file's real render helper and prop names (e.g. `onRename`, `onBack`). Change the existing `getAllByRole("link", …)` assertions to expect exactly one link. Run the tests. They FAIL because of the duplicated markup.
- [ ] **Step 2: Implement one header.**
  - **List mode:** the title "Sources" plus `<Badge variant="secondary">{count}</Badge>`, and on desktop the close button (ghost `icon-sm`, `aria-label="Close sources panel"`, keeping any existing label).
  - **Viewer mode:**
    - **Back:** `<Button variant="ghost" size="icon-sm" aria-label="Back to sources">`.
    - **Title:** a ghost `Button` that shows the title and has `aria-label={`Rename ${title}`}`. It replaces the `span role=button`. On click it shows `<Input aria-label="Rename source" autoFocus …>`. Keep the old key rules: Enter submits if trimmed, Escape reverts and exits, blur submits or reverts.
    - **Actions:** `<ButtonGroup variant="tray" aria-label="Source actions">` holding:
      - `<Button asChild variant="ghost" size="icon-sm"><a href=… target="_blank" rel="noopener noreferrer" aria-label="Open source in new tab"><ExternalLink /></a></Button>`, rendered only when a URL exists;
      - copy and download as ghost `icon-sm` buttons, each with an aria-label and a tooltip. They stay disabled when `!canCopyOrDownload`.
  - **Breakpoints:** desktop-only bits use `hidden md:inline-flex`. Don't duplicate the subtree.
  - Remove every `active:scale-[0.97]` (the Button primitives already handle press feedback) and every `title` that only duplicated a label.
- [ ] **Step 3: Run checks.** Vitest on `src/features/sources`, eslint on the file (0), and typecheck.
- [ ] **Step 4: Commit.** `feat(sources): one responsive panel header with an action tray` (`Refs #261`).

---

## Task 6: `SourceViewer` and `YouTubeVideoPreview`

**Files:** modify `apps/web/src/features/sources/components/SourceViewer.tsx`, `YouTubeVideoPreview.tsx`, and `SourceViewer.test.tsx`.

Read the current file. The inline guide runs from ~:113 to :205, the error boxes are at ~:202, :217 and :240, the view toggle is at ~:254–281, and the `.catch(() => setPdfUrl(null))` is at ~:68.

- [ ] **Step 1: Check the markdown typography before touching it.**
  - Run `rg -n "prose" apps/web/src/index.css apps/web/src/shared/components/MarkdownRenderer*`.
  - Check whether `@tailwindcss/typography` is loaded: look for `@plugin "@tailwindcss/typography"` in `index.css`.
  - **If it isn't loaded:** the `prose prose-sm prose-stone dark:prose-invert prose-p:* prose-strong:*` classes produce no CSS. Remove them, but keep `prose max-w-none` if `index.css` defines `.prose` rules (chat depends on `.prose.max-w-none`).
  - **If it is loaded:** keep the classes the linter accepts and report it.
  - Record what you found in the commit message.
- [ ] **Step 2: Write or adjust the failing tests** in `SourceViewer.test.tsx`.
  - Existing tests must keep passing: "Source guide", "Generating source guide...", `data-testid="source-guide-summary"`, the topic button names, and the YouTube test ids and labels.
  - Add these tests:

```tsx
it("switches between the markdown and original PDF views", async () => {
  // render a completed PDF source as the existing PDF tests do
  const group = screen.getByRole("group", { name: "Source view" });
  await userEvent.click(within(group).getByRole("radio", { name: "Original PDF" }));
  expect(within(group).getByRole("radio", { name: "Original PDF" })).toHaveAttribute("data-state", "on");
});

it("shows a visible error and logs when the PDF link can't be fetched", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  // make the signed-URL mock reject, switch to the PDF view
  expect(await screen.findByText("Could not load PDF.")).toBeInTheDocument();
  expect(err).toHaveBeenCalled();
});
```

  Check `toggle-group.tsx` for the role it renders (`radio` for `type="single"` in Radix ToggleGroup) and adapt the queries. Run the tests. The new ones FAIL.
- [ ] **Step 3: Implement.**
  - **Guide:** wrap it in `<Card variant="flush">` with a `Collapsible` inside.
    - Trigger: `CollapsibleTrigger asChild` around `<Button variant="ghost" className="w-full justify-between">` labelled "Source guide", with a chevron that rotates through `group-data-[state=open]/trigger:rotate-180` (follow `AgentActivityPanel`'s pattern on the chat branch).
    - Content: `CollapsibleContent`. The summary keeps `data-testid="source-guide-summary"`.
    - Topic chips: `<Button variant="secondary" size="chip" onClick={() => onDiscussTopic(topic)}>`, keeping the accessible names.
    - Generating state: `<div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner aria-hidden />Generating source guide...</div>`, then two `Skeleton` lines (`h-3 w-4/5`, `h-3 w-3/5`).
    - Error: `<Alert variant="destructive"><AlertDescription>…</AlertDescription></Alert>`.
  - **States:** the failed, error and PDF-load-error boxes become `Alert variant="destructive"` (with `AlertTitle` where there's a heading). Loading uses `Spinner`. The pulse placeholder becomes `Skeleton`.
  - **View switch:** `<ToggleGroup type="single" variant="outline" aria-label="Source view" value={view} onValueChange={(v) => v && setView(v)}>`, with two `ToggleGroupItem`s labelled "Markdown" and "Original PDF".
  - **PDF URL:** `.catch((error) => { console.error("Failed to load PDF URL:", error); setPdfUrl(null); })`. The existing "Could not load PDF." message stays visible.
  - **Text sizes:** replace `text-[0.9375rem]` with `text-sm`, and `text-[11px] tracking-[0.16em]` with `text-xs`, uppercase only if it already is.
  - **Theme:** remove `dark:bg-secondary` and `dark:prose-invert`; use tokens.
  - **`YouTubeVideoPreview`:** wrap the iframe in `<Card variant="flush">`. The unavailable fallback becomes `Empty` with the existing copy and link. Keep both `data-testid`s and every aria-label.
- [ ] **Step 4: Run checks.** Vitest on `src/features/sources` (PASS), eslint on both files (0), and typecheck.
- [ ] **Step 5: Commit.** `feat(sources): viewer states, guide card and view switch on primitives` (`Refs #261`).

---

## Task 7: `PdfViewer` toolbar and outline

**Files:** modify `apps/web/src/features/sources/components/PdfViewer.tsx`; create `PdfViewer.test.tsx` (toolbar only; mock `react-pdf`).

- [ ] **Step 1: Write the failing toolbar test.** Mock `react-pdf` (`Document` renders children and calls `onLoadSuccess({ numPages: 3 })`; `Page` and `Outline` render stubs).

```tsx
it("labels every toolbar control", async () => {
  render(<PdfViewer url="blob:x" />);
  for (const name of ["Toggle outline", "Previous page", "Next page", "Zoom out", "Zoom in"]) {
    expect(await screen.findByRole("button", { name })).toBeInTheDocument();
  }
  expect(screen.getByRole("textbox", { name: "Page number" })).toBeInTheDocument();
});
```

  Use the component's real prop names, and keep any existing labels if they differ; the test then asserts those. Run it. It FAILS where labels are missing.
- [ ] **Step 2: Implement.**
  - **Toolbar:** `<ButtonGroup variant="tray" aria-label="PDF controls">`.
    - Outline toggle: `<Toggle size="sm" aria-label="Toggle outline" pressed={outlineOpen} onPressedChange={setOutlineOpen}>`.
    - Previous and next: ghost `icon-sm` buttons.
    - Page number: `Input` with `aria-label="Page number"` and class `w-12 text-center`, followed by `<span className="text-xs text-muted-foreground">/ {numPages}</span>`.
    - Zoom out and zoom in: ghost `icon-sm` buttons.
    - Each control gets a tooltip.
    - Token sizes replace `min-w-[2ch]` (use `min-w-6`) and `min-w-[3rem]` (use `min-w-12`).
  - **Page input:** keep its handlers exactly: digits only, Enter blurs, blur commits a clamped value.
  - **States:** the error box becomes `Alert variant="destructive"`; loading becomes `Spinner`.
  - **Outline aside:** token surfaces (`bg-card`, `border-r border-border/60`). The nested-list rule `[&_ul_ul]:border-l-2` becomes `[&_ul_ul]:border-l [&_ul_ul]:border-border/60`. Replace `text-[0.65rem]` with `text-xs`. Leave the `react-pdf__Outline` class alone (it's the library's hook). If `no-unknown-classes` flags it, move that selector's styles into `index.css` under a `@layer components` rule keyed on `.react-pdf__Outline`, and drop the class from JSX.
  - **Page height** (the one dynamic inline style, ~:34): replace `style={{ height: h, minHeight: h }}` with `style={{ "--pdf-page-h": `${h}px` } as React.CSSProperties}` plus `className="h-(--pdf-page-h) min-h-(--pdf-page-h)"`. If `no-inline-styles` still flags a CSS-variable-only style, keep it and report it. A truly dynamic value is the allowed exception, so document it in a comment.
  - **Scroll container (~:404):** keep its ref. Replace `[scrollbar-gutter:stable]` with a `@utility scrollbar-stable { scrollbar-gutter: stable; }` in `index.css`, if no such utility exists yet.
  - **Must not change:** the virtualization `IntersectionObserver`, the DPR cap, the zoom range, the current-page-from-scroll logic, and the `scrollend` guard with its 120 ms fallback.
- [ ] **Step 3: Run checks.** Vitest on `src/features/sources` (PASS), eslint on the file (0, or only the documented inline-variable exception), and typecheck.
- [ ] **Step 4: Commit.** `feat(sources): PDF viewer toolbar on a tray with labelled controls` (`Refs #261`).

---

## Task 8: Remove the dead Source Guide web UI (#252)

**Files:** delete `apps/web/src/features/sources/components/SourceGuide.tsx`, `SourceGuide.test.tsx`, and `apps/web/src/features/sources/hooks/useSourceGuide.ts`.

- [ ] **Step 1: Confirm nothing else imports them.** Run `rg -n "SourceGuide\b|useSourceGuide\b" apps/web/src --glob '!**/SourceGuide*' --glob '!**/useSourceGuide*'`. Only the `SourceGuide` *type* in `shared/types` and `useGenerateSourceGuide` should remain.
- [ ] **Step 2: Delete the files.** Use `git rm` on the three files. Then run typecheck, vitest on `src/features/sources`, and `bun run lint:design`; counts only drop.
- [ ] **Step 3: Commit.** `refactor(sources): remove the unused Source Guide component` (`Refs #252, #261`).
- [ ] **Step 4: Comment on #252.** Post: "The unused web UI (`SourceGuide.tsx`, `useSourceGuide.ts`, and its test) was removed in the sources panel migration (#261). The viewer's inline guide still uses `generateSourceGuide`. What's left here is the backend decision (`getSourceGuide`, which no web code queries any more, plus the schema field)." Use `gh issue comment 252 --body-file <file>`.

---

## Task 9: E2E selectors

**Files:** modify `e2e/helpers/source-assertions.ts` and `e2e/sources/source-list.spec.ts`. Check `e2e/helpers/navigation.ts` too.

- [ ] **Step 1: Rewrite the selectors.**
  - `getSourceCard(page, title)`: `page.locator('[data-slot="item"]', { hasText: title })`.
  - Checkbox: `page.getByRole("checkbox", { name: `Include ${title} in chat` })`. Assert with `toBeChecked()` / `not.toBeChecked()`.
  - Delete: open the row's menu (`card.getByRole("button", { name: "More options" })`), then `page.getByRole("menuitem", { name: "Delete" })`. Confirm in the `alertdialog`, which is unchanged.
  - Rename: the menu, then `getByRole("menuitem", { name: "Rename" })`, then `page.getByRole("textbox", { name: "Rename source" })`.
  - Processing and Failed text assertions keep working, because the badges carry the same words.
  - In `source-list.spec.ts`, replace `svg[class*='check']` with checkbox `toBeChecked()`, and `input.border-primary` with the textbox above.
  - `navigation.ts` (`[title="Add Source"]`) and onboarding (`[data-onboarding="add-source-button"]`) are unchanged. Verify both attributes are still on the Add source button.
- [ ] **Step 2: Verify.** `bunx playwright test --list e2e/sources e2e/notebooks` parses. Run `rg -n "rounded-lg|text-primary|border-primary|class\*=" e2e/helpers/source-assertions.ts e2e/sources`; it should find nothing related to sources. A live run needs credentials, so don't run it.
- [ ] **Step 3: Commit.** `test(e2e): source selectors by role` (`Refs #261`).

---

## Task 10: Enforce and lock the ratchet

**Files:** modify `apps/web/eslint.config.mjs` and `apps/web/design-lint-baseline.json`.

- [ ] **Step 1: Add the panel files to `MIGRATED`.**

```js
  "src/features/sources/components/{SourcesPanel,SourcesPanelHeader,SourceList,SourceListItem,SourceViewer,PdfViewer,YouTubeVideoPreview}.tsx",
```

- [ ] **Step 2: Check the panel files are clean.** From `apps/web`, run `bunx eslint -c eslint.config.mjs --max-warnings 0 src/features/sources/components/{SourcesPanel,SourcesPanelHeader,SourceList,SourceListItem,SourceViewer,PdfViewer,YouTubeVideoPreview}.tsx`. It should report 0, apart from the documented inline-variable exception if Task 7 kept one. In that case, record the exception in the PR.
- [ ] **Step 3: Run the gates,** one at a time:
  - `bun run typecheck:web`
  - `bun run typecheck:convex`
  - `bun run lint -- --diagnostic-level=error`
  - `bun run test:web`
  - `bun run lint:design` (it reports drops)

  Then `bun run lint:design:update`, then `bun run lint:design` again; it should print OK.
- [ ] **Step 4: Commit.** `chore(web): enforce design lint on the sources panel` (`Refs #261`).

---

## Task 11: Visual pass (controller, with the user)

This isn't a subagent task. The controller runs it in the in-app browser against :5173, signed in.

- [ ] **Step 1: Take screenshots** at 390×844 and 1440×900, in light and dark (the `.dark` class plus a dark colour scheme). Cover:
  - the list with selected, processing and failed rows;
  - a row menu open;
  - rename;
  - the empty state (only if a notebook has no sources; don't delete anything to get one);
  - a markdown source, with the guide expanded;
  - a PDF source, with the toolbar and the outline open;
  - a YouTube source.
- [ ] **Step 2: Show the user,** grouped by screen. Make tweaks in primitives or variants, never at call sites.
- [ ] **Step 3: Push and open the PR** after approval. Push `feature/ds-migrate-sources-panel` and open the PR with base `feature/soft-layered-design`, titled `feat(web): sources panel on the design system`, with `Refs #261`. The issue closes after parts 2 and 3. Bind it with ccd_pr.
