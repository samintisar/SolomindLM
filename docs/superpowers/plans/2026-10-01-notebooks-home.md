# Notebooks Home Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the notebooks home (`apps/web/src/features/notebooks`) on the shadcn design system with denser cards, distinct folders (#226), real dialogs and premium motion, ending at 0 design-lint findings (#259).

**Architecture:** Pure helpers (`notebookIcons.ts`, `notebookMeta.ts`) hold the #226 icon rules and card meta text and are unit-tested. Presentational pieces live in `components/home/` (header, view controls, grid, skeleton, empty state) and `components/cards/` (notebook card, folder card, shared actions menu). `HomePage`/`FolderView` keep their data and handler logic and swap in those pieces. Dialogs move onto Radix `Dialog` through a shared `CoverCustomizeDialog`. New looks are `cva` variants in `src/shared/components/ui` (Card `interactive`, Toggle `swatch`, Button `ghost-destructive`, DialogContent `size`/`padding`).

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (radix), `tw-animate-css`, `motion/react` (`LazyMotion strict`, `m.*` only), vitest + Testing Library, Playwright e2e, `@shadcn/lint` ratchet.

**Spec:** `docs/superpowers/specs/2026-10-01-notebooks-home-design.md`
**Branch:** `feature/ds-migrate-notebooks` (stacked on `feature/ds-migrate-auth` / #227).

## Ground rules for every task

- Work only in this worktree: `C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb`. Don't touch other worktrees or the main checkout. Serena is bound to the main checkout, so use Read/Edit/Write here.
- Import `cn` from `@/shared/utils/cn`. Never use palette colours (`bg-blue-500`) or `--vintage-*` except through `coverFillClass()`. Never use `motion.*`, only `m.*`. No arbitrary values (`w-[300px]`), no inline `style`.
- Call sites of `@/shared/components/ui/*` components may add **layout classes only** (position, size, flex/grid, margin, gap). A different look means a new `cva` variant in the ui file.
- After editing, run `bunx biome format --write <changed files>`. Serena/Windows edits can leave CRLF, which Biome flags.
- Never kill processes by name (`taskkill /IM bun.exe` kills other sessions' servers). Kill by PID only.
- Commit after each task with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands run from `apps/web` unless they start with `bun run` (repo root).

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/features/notebooks/notebookIcons.ts` (+ `.test.ts`) | new | Icon registry, picker lists, #226 fallback rules |
| `src/features/notebooks/notebookMeta.ts` (+ `.test.ts`) | new | "16 sources · Sep 12" / "6 notebooks" text |
| `src/shared/components/ui/card.tsx` | modify | `interactive` variant |
| `src/shared/components/ui/toggle.tsx` | modify | `swatch` variant |
| `src/shared/components/ui/button.tsx` | modify | `ghost-destructive` variant |
| `src/shared/components/ui/dialog.tsx` | modify | `size` + `padding` variants |
| `src/shared/components/ui/button-group.tsx` | new (shadcn CLI) | Split button |
| `src/shared/components/motion/{features.ts,LayoutItem.tsx,index.ts}` | modify/new | `domMax` for layout animation, `LayoutItem`, `AnimatePresence` export |
| `src/features/notebooks/useNotebookContext.ts`, `src/App.tsx` | modify | `notebooksLoading` flag |
| `src/features/notebooks/components/cards/CardActionsMenu.tsx` (+ test) | new | Dropdown of card actions |
| `src/features/notebooks/components/cards/NotebookCard.tsx` (+ test) | rewrite | Grid card, list row, featured |
| `src/features/notebooks/components/cards/FolderCard.tsx` (+ test) | rewrite | Folder grid card / list row |
| `src/features/notebooks/components/home/CardGrid.tsx` | new | Grid/list container, stagger + layout animation |
| `src/features/notebooks/components/home/GridSkeleton.tsx` | new | Loading cards |
| `src/features/notebooks/components/home/ViewControls.tsx` | new | Grid/list toggle + sort select |
| `src/features/notebooks/components/home/CreateMenuButton.tsx` | new | New notebook + New folder split button |
| `src/features/notebooks/components/home/HomeHeader.tsx` (+ test) | new | Title, tabs, controls, create |
| `src/features/notebooks/components/home/HomeEmptyState.tsx` | new | First-notebook empty state |
| `src/features/notebooks/components/ListHeader.tsx` | rewrite | List column labels |
| `src/features/notebooks/components/views/{RecentSection,FeaturedSection,FolderView}.tsx` | rewrite | Sections built from the pieces |
| `src/features/notebooks/components/HomePage.tsx` | rewrite (render) | Wire header + sections, drop menu state |
| `src/features/notebooks/hooks/{useNotebookHandlers,useFolderHandlers,useNotebookSorting,useNotebookCRUD}.ts` | modify | Drop menu/sort-open state; Book default |
| `src/features/notebooks/services/notebooksApi.ts`, `convex/notebooks/index.ts` | modify | Book default |
| `src/features/notebooks/components/modals/CoverCustomizeDialog.tsx` (+ test) | new | Shared create/customize dialog |
| `src/features/notebooks/components/modals/{CustomizeNotebookModal,CustomizeFolderModal,MoveToFolderModal,ShareNotebookModal}.tsx` | rewrite | Dialog-based |
| `src/features/notebooks/components/views/NotebookPanelSeparator.tsx` | modify | Lint fixes |
| `e2e/notebooks/notebook.spec.ts`, `e2e/fixtures/notebook.fixture.ts`, `e2e/onboarding/onboarding-ui.spec.ts` | modify | Role-based selectors |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | modify | Add folder to `MIGRATED`, lower baseline |

---

### Task 1: Icon rules (#226)

**Files:**
- Create: `apps/web/src/features/notebooks/notebookIcons.ts`
- Test: `apps/web/src/features/notebooks/notebookIcons.test.ts`
- Modify: `apps/web/src/features/notebooks/hooks/useNotebookCRUD.ts:45`, `apps/web/src/features/notebooks/hooks/useNotebookCRUD.test.ts:81`, `apps/web/src/features/notebooks/services/notebooksApi.ts:39`, `convex/notebooks/index.ts:36,187`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/notebooks/notebookIcons.test.ts
import { Book, Folder, Globe } from "lucide-react";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_NOTEBOOK_ICON,
  FOLDER_ICON_NAMES,
  folderIcon,
  folderIconName,
  NOTEBOOK_ICON_NAMES,
  notebookIcon,
  notebookIconName,
} from "./notebookIcons";

describe("notebook icons (#226)", () => {
  test("the notebook picker never offers the folder icon", () => {
    expect(NOTEBOOK_ICON_NAMES).not.toContain("Folder");
    expect(FOLDER_ICON_NAMES).toContain("Folder");
  });

  test("notebooks default to Book", () => {
    expect(DEFAULT_NOTEBOOK_ICON).toBe("Book");
  });

  test.each([undefined, null, "", "Folder", "NotAnIcon"])(
    "notebook icon %s renders as Book",
    (icon) => {
      expect(notebookIconName(icon)).toBe("Book");
      expect(notebookIcon(icon)).toBe(Book);
    }
  );

  test("a chosen notebook icon is kept", () => {
    expect(notebookIconName("Globe")).toBe("Globe");
    expect(notebookIcon("Globe")).toBe(Globe);
  });

  test("folders keep the folder icon as their default", () => {
    expect(folderIconName(undefined)).toBe("Folder");
    expect(folderIconName("NotAnIcon")).toBe("Folder");
    expect(folderIcon("Folder")).toBe(Folder);
    expect(folderIconName("Globe")).toBe("Globe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --config vitest.config.ts src/features/notebooks/notebookIcons.test.ts`
Expected: FAIL, `Failed to resolve import "./notebookIcons"`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/notebooks/notebookIcons.ts
import {
  BarChart3,
  Book,
  Brain,
  FileText,
  Folder,
  Globe,
  GraduationCap,
  Lightbulb,
  type LucideIcon,
  Monitor,
  Search,
} from "lucide-react";

/** Icon names are persisted in Convex (`notebooks.icon`, `folders.icon`); never rename a key. */
export const COVER_ICONS: Record<string, LucideIcon> = {
  Folder,
  Book,
  BarChart: BarChart3,
  Monitor,
  Search,
  Brain,
  Globe,
  FileText,
  GraduationCap,
  Lightbulb,
};

export const DEFAULT_NOTEBOOK_ICON = "Book";
export const DEFAULT_FOLDER_ICON = "Folder";

/** The notebook picker never offers "Folder", so notebooks can't be mistaken for folders (#226). */
export const NOTEBOOK_ICON_NAMES = [
  "Book",
  "BarChart",
  "Monitor",
  "Search",
  "Brain",
  "Globe",
  "FileText",
  "GraduationCap",
  "Lightbulb",
] as const;

export const FOLDER_ICON_NAMES = ["Folder", ...NOTEBOOK_ICON_NAMES] as const;

const isKnown = (icon: string): boolean => Object.hasOwn(COVER_ICONS, icon);

/** "Folder" was the old notebook default; it, and missing/unknown names, render as Book. */
export function notebookIconName(icon?: string | null): string {
  if (!icon || icon === "Folder" || !isKnown(icon)) return DEFAULT_NOTEBOOK_ICON;
  return icon;
}

export function folderIconName(icon?: string | null): string {
  return icon && isKnown(icon) ? icon : DEFAULT_FOLDER_ICON;
}

export const notebookIcon = (icon?: string | null): LucideIcon => COVER_ICONS[notebookIconName(icon)];
export const folderIcon = (icon?: string | null): LucideIcon => COVER_ICONS[folderIconName(icon)];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --config vitest.config.ts src/features/notebooks/notebookIcons.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Switch the notebook defaults to Book**

- `useNotebookCRUD.ts:45`: `icon: "Folder",` → `icon: DEFAULT_NOTEBOOK_ICON,` and add `import { DEFAULT_NOTEBOOK_ICON } from "../notebookIcons";`.
- `useNotebookCRUD.test.ts:81`: `icon: "Folder",` → `icon: "Book",`.
- `notebooksApi.ts:39`: `icon: args.icon || "Folder",` → `icon: args.icon || DEFAULT_NOTEBOOK_ICON,` (same import, path `../notebookIcons`).
- `convex/notebooks/index.ts:36` (`toNotebookDTO`) and `:187` (create return): `?? "Folder"` → `?? "Book"`. Leave `convex/folders/*` and `useFolderCRUD.ts` on `"Folder"`, since that's the folder default.

- [ ] **Step 6: Verify**

Run: `bunx vitest run --config vitest.config.ts src/features/notebooks` → PASS.
Run (repo root): `bun run typecheck:convex && bun run typecheck:web` → clean.
Run (repo root): `bun run test:convex -- convex/notebooks` → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/notebooks/notebookIcons.ts apps/web/src/features/notebooks/notebookIcons.test.ts apps/web/src/features/notebooks/hooks/useNotebookCRUD.ts apps/web/src/features/notebooks/hooks/useNotebookCRUD.test.ts apps/web/src/features/notebooks/services/notebooksApi.ts convex/notebooks/index.ts
git commit -m "feat(notebooks): default notebooks to the book icon (#226)"
```

---

### Task 2: Card meta text

**Files:**
- Create: `apps/web/src/features/notebooks/notebookMeta.ts`
- Test: `apps/web/src/features/notebooks/notebookMeta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/notebooks/notebookMeta.test.ts
import { describe, expect, test } from "vitest";
import { folderMeta, formatShortDate, notebookMeta } from "./notebookMeta";

// Noon local time keeps the calendar day stable across time zones.
const NOW = new Date(2026, 9, 1, 12);
const SEP_12 = new Date(2026, 8, 12, 12).getTime();
const LAST_YEAR = new Date(2025, 2, 3, 12).getTime();

describe("formatShortDate", () => {
  test("omits the year for this year", () => {
    expect(formatShortDate(SEP_12, NOW)).toBe("Sep 12");
  });
  test("includes the year for earlier years", () => {
    expect(formatShortDate(LAST_YEAR, NOW)).toBe("Mar 3, 2025");
  });
  test.each([undefined, "", "not a date"])("returns null for %s", (value) => {
    expect(formatShortDate(value, NOW)).toBeNull();
  });
});

describe("notebookMeta", () => {
  test("sources and created date", () => {
    expect(notebookMeta({ sourceCount: 16, created_at: SEP_12 }, NOW)).toBe("16 sources · Sep 12");
  });
  test("singular source", () => {
    expect(notebookMeta({ sourceCount: 1, created_at: SEP_12 }, NOW)).toBe("1 source · Sep 12");
  });
  test("no date when created_at is missing", () => {
    expect(notebookMeta({ sourceCount: 0 }, NOW)).toBe("0 sources");
  });
});

describe("folderMeta", () => {
  test("pluralizes notebooks", () => {
    expect(folderMeta({ notebookCount: 6 })).toBe("6 notebooks");
    expect(folderMeta({ notebookCount: 1 })).toBe("1 notebook");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run --config vitest.config.ts src/features/notebooks/notebookMeta.test.ts`
Expected: FAIL, unresolved import.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/notebooks/notebookMeta.ts
import type { FolderItem, NotebookItem } from "@/shared/types/index";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Sep 12" this year, "Mar 3, 2025" otherwise; null for missing or invalid input. */
export function formatShortDate(
  value: string | number | null | undefined,
  now: Date = new Date()
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * Created date, not "edited": `notebooks.updatedAt` only moves on rename/customize/move, so an
 * "edited" label would be wrong after adding sources or chatting.
 */
export function notebookMeta(
  notebook: Pick<NotebookItem, "sourceCount" | "created_at">,
  now?: Date
): string {
  const parts = [count(notebook.sourceCount ?? 0, "source", "sources")];
  const date = formatShortDate(notebook.created_at, now);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export const folderMeta = (folder: Pick<FolderItem, "notebookCount">): string =>
  count(folder.notebookCount ?? 0, "notebook", "notebooks");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run --config vitest.config.ts src/features/notebooks/notebookMeta.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/notebooks/notebookMeta.ts apps/web/src/features/notebooks/notebookMeta.test.ts
git commit -m "feat(notebooks): card meta text helpers"
```

---

### Task 3: Design-system variants, button group, motion layout support

**Files:**
- Modify: `apps/web/src/shared/components/ui/card.tsx`, `toggle.tsx`, `button.tsx`, `dialog.tsx`
- Create (CLI): `apps/web/src/shared/components/ui/button-group.tsx`
- Modify: `apps/web/src/shared/components/motion/features.ts`, `index.ts`; Create: `LayoutItem.tsx`
- Test: `apps/web/src/shared/components/ui/ui.smoke.test.tsx` (extend)

- [ ] **Step 1: Card `interactive` variant.** In `card.tsx` `cardVariants.variants.variant`, add:

```ts
        // Clickable cards: the inner <button> carries focus; the card shows the ring, lifts on hover.
        interactive:
          "relative gap-0 overflow-hidden py-0 shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-99 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background motion-reduce:transform-none",
```

- [ ] **Step 2: Toggle `swatch` variant.** In `toggle.tsx` `toggleVariants.variants.variant`, add:

```ts
        // Colour swatch picker: the colour is a child <span>; selection is a ring, not a fill.
        swatch:
          "rounded-full bg-transparent p-1 hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:ring-2 data-[state=on]:ring-ring",
```

- [ ] **Step 3: Button `ghost-destructive` variant.** In `button.tsx` `variant`, after `ghost`, add:

```ts
        "ghost-destructive":
          "rounded-lg text-destructive hover:bg-destructive-muted hover:text-destructive-muted-foreground active:bg-destructive-muted",
```

- [ ] **Step 4: DialogContent `size` and `padding` variants.** In `dialog.tsx` `dialogContentVariants.variants`, add next to `theme`:

```ts
      size: { default: "", wide: "flex max-h-svh flex-col sm:max-w-3xl" },
      padding: { default: "", none: "gap-0 p-0" },
```

with `defaultVariants: { theme: "default", size: "default", padding: "default" }`. Accept `size` and `padding` props in `DialogContent` (destructure them next to `theme`) and pass them as `dialogContentVariants({ theme, size, padding })`.

- [ ] **Step 5: Add the shadcn button group.** From `apps/web`:

```bash
bunx --bun shadcn@latest add button-group
```

Then fix the CLI's usual damage: in `src/shared/components/ui/button-group.tsx`, change `import { cn } from "cn"` to `import { cn } from "@/shared/utils/cn"`. Run `git diff apps/web/package.json package.json bun.lock`, and if the CLI added `cn` or `next-themes`, remove them (`bun remove cn next-themes` from `apps/web`). Don't commit unrelated lockfile churn. If `bun run lint:design` reports `no-arbitrary-values` in `button-group.tsx` from upstream markup, add `"button-group"` to `UPSTREAM_ARBITRARY` in `apps/web/eslint.config.mjs`.

- [ ] **Step 6: Motion: lazy `domMax` + `LayoutItem`.** Layout animation needs `domMax` (the lazy chunk stays out of the entry bundle).

```ts
// apps/web/src/shared/components/motion/features.ts
import { domMax } from "motion/react";

// Loaded via dynamic import from MotionProvider so animation features stay out of the entry chunk.
// domMax (not domAnimation) because the notebooks grid uses layout animations.
export default domMax;
```

```tsx
// apps/web/src/shared/components/motion/LayoutItem.tsx
import { type HTMLMotionProps, m } from "motion/react";
import { DURATION } from "./tokens";

/**
 * Grid/list item that glides when siblings reorder and fades out when removed (inside
 * <AnimatePresence>). No `initial`: entrance is CSS, so items never wait on the lazy chunk.
 */
export function LayoutItem(props: HTMLMotionProps<"div">) {
  return (
    <m.div
      layout="position"
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: DURATION.slow }}
      {...props}
    />
  );
}
```

```ts
// apps/web/src/shared/components/motion/index.ts
export { AnimatePresence } from "motion/react";
export { LayoutItem } from "./LayoutItem";
export { MotionProvider } from "./MotionProvider";
```

- [ ] **Step 7: Smoke-test the variants.** In `src/shared/components/ui/ui.smoke.test.tsx`, add a test that renders `<Card variant="interactive" />`, `<Button variant="ghost-destructive">x</Button>`, and a `ToggleGroup type="single"` with `<ToggleGroupItem value="a" variant="swatch" aria-label="a" />`, and asserts each renders, e.g. `expect(container.querySelector('[data-variant="interactive"]')).not.toBeNull()` and `getByRole("button", { name: "x" })`. Follow the file's existing imports and patterns.

- [ ] **Step 8: Verify**

Run: `bunx vitest run --config vitest.config.ts src/shared/components` → PASS.
Run (repo root): `bun run typecheck:web && bun run lint:design` → typecheck clean; design lint `OK` (it may report decreases; that's fine).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/shared/components apps/web/eslint.config.mjs apps/web/package.json
git commit -m "feat(web): interactive card, swatch toggle, button group and layout motion"
```

---

### Task 4: Loading flag in the notebook context

**Files:**
- Modify: `apps/web/src/features/notebooks/useNotebookContext.ts`, `apps/web/src/App.tsx`

- [ ] **Step 1:** In `NotebookContextType`, under `// Derived data`, add:

```ts
  /** True until the notebooks and folders queries have returned. */
  notebooksLoading: boolean;
```

- [ ] **Step 2:** In `App.tsx`, `notebooks = useNotebooks()` and `folders = useFolders()` are `undefined` while loading (line ~105). In every object literal typed as `NotebookContextType` (search for `recentNotebooks,` around lines 246 and 275), add:

```ts
      notebooksLoading: notebooks === undefined || folders === undefined,
```

and add `notebooks`/`folders` to that `useMemo`'s dependency list if the object is memoized.

- [ ] **Step 3:** Run (repo root) `bun run typecheck:web`. Fix any test files that build a `NotebookContextType` by adding `notebooksLoading: false`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/notebooks/useNotebookContext.ts apps/web/src/App.tsx
git commit -m "feat(notebooks): expose notebooks loading state in context"
```

---

### Task 5: Card actions menu

**Files:**
- Create: `apps/web/src/features/notebooks/components/cards/CardActionsMenu.tsx`
- Test: `apps/web/src/features/notebooks/components/cards/CardActionsMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// CardActionsMenu.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings2, Trash2 } from "lucide-react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { CardActionsMenu } from "./CardActionsMenu";

// jsdom lacks the layout APIs Radix menus touch.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("CardActionsMenu", () => {
  test("opens from a labelled trigger and runs the chosen action", async () => {
    const onCustomize = vi.fn();
    const onDelete = vi.fn();
    render(
      <CardActionsMenu
        label="Notebook actions"
        actions={[
          { label: "Customize", icon: Settings2, onSelect: onCustomize },
          { label: "Delete", icon: Trash2, onSelect: onDelete, destructive: true },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Notebook actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onCustomize).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it** — `bunx vitest run --config vitest.config.ts src/features/notebooks/components/cards/CardActionsMenu.test.tsx` → FAIL (missing module).

- [ ] **Step 3: Implement**

```tsx
// CardActionsMenu.tsx
import { type LucideIcon, MoreVertical } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export interface CardAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * `modal={false}`: these items open Radix dialogs; a modal menu closing into a modal dialog can
 * leave `pointer-events: none` stuck on <body>.
 */
export function CardActionsMenu({ label, actions }: { label: string; actions: CardAction[] }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map(({ label: itemLabel, icon: Icon, onSelect, destructive }) => (
          <Fragment key={itemLabel}>
            {destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={destructive ? "destructive" : "default"} onSelect={onSelect}>
              <Icon />
              {itemLabel}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run it** → PASS. **Step 5: Commit** — `git commit -m "feat(notebooks): shared card actions menu"` (add both files).

---

### Task 6: Grid helpers (CardGrid, GridSkeleton, ListHeader)

**Files:**
- Create: `apps/web/src/features/notebooks/components/home/CardGrid.tsx`, `GridSkeleton.tsx`
- Rewrite: `apps/web/src/features/notebooks/components/ListHeader.tsx`

- [ ] **Step 1: CardGrid**

```tsx
// components/home/CardGrid.tsx
import type { ReactNode } from "react";
import { AnimatePresence, LayoutItem } from "@/shared/components/motion";
import { cn } from "@/shared/utils/cn";

export type ViewMode = "grid" | "list";

export const GRID_CLASS =
  "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";
const LIST_CLASS = "flex flex-col gap-2";

// Static list so Tailwind sees every class; ~40ms steps for the first 12 cards only.
const STAGGER = [
  "delay-0",
  "delay-40",
  "delay-80",
  "delay-120",
  "delay-160",
  "delay-200",
  "delay-240",
  "delay-280",
  "delay-320",
  "delay-360",
  "delay-400",
  "delay-440",
] as const;
const ENTER = "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-320 ease-out";

/** `initial={false}`: the first paint uses the CSS entrance; motion only handles reorders/exits. */
export function CardGrid({ viewMode, children }: { viewMode: ViewMode; children: ReactNode }) {
  return (
    <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </div>
  );
}

/**
 * The CSS entrance sits on an inner element: CSS animations override inline styles, so on the
 * same node they would mask motion's layout transform for the first ~760ms.
 */
export function CardGridItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <LayoutItem className="h-full">
      <div className={cn("h-full", ENTER, STAGGER[index])}>{children}</div>
    </LayoutItem>
  );
}
```

(The caller passes `key` to `CardGridItem`. `STAGGER[index]` is `undefined` past 12, which `cn` drops.)

- [ ] **Step 2: GridSkeleton**

```tsx
// components/home/GridSkeleton.tsx
import { Skeleton } from "@/shared/components/ui/skeleton";
import { GRID_CLASS } from "./CardGrid";

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-busy="true" aria-label="Loading notebooks">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card">
          <Skeleton className="h-20 w-full" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: ListHeader**

```tsx
// components/ListHeader.tsx
/** Column labels for list view; offsets match the row's 36px icon chip + 12px gap. */
export function ListHeader() {
  return (
    <div className="hidden items-center gap-3 border-b px-3 pb-2 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="flex-1 pl-12">Title</span>
      <span className="w-40 text-right">Details</span>
      <span className="w-8" aria-hidden />
    </div>
  );
}
```

Update its importers: `ListHeader` was a `React.FC` const; the named export is unchanged, so imports keep working.

- [ ] **Step 4: Verify** — repo root `bun run typecheck:web` clean. **Step 5: Commit** — `git commit -m "feat(notebooks): animated card grid, skeleton and list header"`.

---

### Task 7: Notebook card

**Files:**
- Rewrite: `apps/web/src/features/notebooks/components/cards/NotebookCard.tsx`
- Test: `apps/web/src/features/notebooks/components/cards/NotebookCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// NotebookCard.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "./NotebookCard";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const nb: NotebookItem = {
  id: "n1",
  title: "Cell Biology",
  date: "Sep 12, 2026",
  sourceCount: 16,
  icon: "Folder",
  created_at: new Date(2026, 8, 12, 12).getTime(),
};

describe("NotebookCard", () => {
  test("opens on click and shows sources", async () => {
    const onSelect = vi.fn();
    render(<NotebookCard notebook={nb} viewMode="grid" onSelectNotebook={onSelect} />);
    expect(screen.getByText(/16 sources/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cell Biology/ }));
    expect(onSelect).toHaveBeenCalledWith(nb);
  });

  test("actions menu is separate from the open button", async () => {
    const onSelect = vi.fn();
    const onCustomize = vi.fn();
    render(
      <NotebookCard
        notebook={nb}
        viewMode="grid"
        onSelectNotebook={onSelect}
        onOpenCustomize={onCustomize}
        onOpenMoveToFolder={vi.fn()}
        onDeleteNotebook={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Notebook actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Customize" }));
    expect(onCustomize).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("featured and shared notebooks have no actions menu", () => {
    const { rerender } = render(
      <NotebookCard notebook={nb} viewMode="grid" onSelectNotebook={vi.fn()} featured />
    );
    expect(screen.queryByRole("button", { name: "Notebook actions" })).toBeNull();
    expect(screen.getByText("Featured")).toBeInTheDocument();
    rerender(
      <NotebookCard
        notebook={{ ...nb, isSharedNotebook: true }}
        viewMode="list"
        onSelectNotebook={vi.fn()}
        onOpenCustomize={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Notebook actions" })).toBeNull();
    expect(screen.getByText("Shared")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it** → FAIL (props/labels don't exist yet).

- [ ] **Step 3: Rewrite `NotebookCard.tsx`**

```tsx
import { FolderOpen, Settings2, Trash2, Users } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import type { NotebookItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { cn } from "@/shared/utils/cn";
import { notebookIcon } from "@/shared/notebook/notebookIcons";
import { notebookMeta } from "../../notebookMeta";
import { type CardAction, CardActionsMenu } from "./CardActionsMenu";

interface NotebookCardProps {
  notebook: NotebookItem;
  viewMode: "grid" | "list";
  onSelectNotebook: (notebook: NotebookItem) => void;
  onOpenCustomize?: () => void;
  onOpenMoveToFolder?: () => void;
  onDeleteNotebook?: (id: string) => void;
  /** Featured/demo notebooks: "Featured" badge, no actions. */
  featured?: boolean;
}

function useNotebookActions({
  notebook,
  onOpenCustomize,
  onOpenMoveToFolder,
  onDeleteNotebook,
}: NotebookCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const actions: CardAction[] = [];
  if (onOpenCustomize) actions.push({ label: "Customize", icon: Settings2, onSelect: onOpenCustomize });
  if (onOpenMoveToFolder)
    actions.push({ label: "Move to folder", icon: FolderOpen, onSelect: onOpenMoveToFolder });
  if (onDeleteNotebook)
    actions.push({
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onSelect: async () => {
        const ok = await confirm(
          "Delete Notebook",
          `Are you sure you want to delete "${notebook.title}"? This action cannot be undone.`,
          { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
        );
        if (ok) onDeleteNotebook(notebook.id);
      },
    });
  return { actions, ConfirmDialogComponent };
}

function CornerSlot({ props, actions }: { props: NotebookCardProps; actions: CardAction[] }) {
  if (props.featured) return <Badge variant="secondary">Featured</Badge>;
  if (props.notebook.isSharedNotebook)
    return (
      <Badge variant="secondary">
        <Users aria-hidden />
        Shared
      </Badge>
    );
  if (actions.length === 0) return null;
  return <CardActionsMenu label="Notebook actions" actions={actions} />;
}

export function NotebookCard(props: NotebookCardProps) {
  const { notebook, viewMode, onSelectNotebook } = props;
  const { actions, ConfirmDialogComponent } = useNotebookActions(props);
  const Icon = notebookIcon(notebook.icon);
  const fill = coverFillClass(notebook.coverColor);
  const meta = notebookMeta(notebook);
  const open = () => onSelectNotebook(notebook);

  if (viewMode === "list") {
    return (
      <>
        <Card variant="interactive" className="flex-row items-center">
          <button
            type="button"
            onClick={open}
            className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none"
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", fill)}>
              <Icon aria-hidden className={cn("size-4", COVER_ICON_CLASS)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-sm font-medium text-card-foreground">
                {notebook.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground sm:hidden">{meta}</span>
            </span>
            <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {meta}
            </span>
          </button>
          <div className="flex w-8 shrink-0 justify-center pr-2">
            <CornerSlot props={props} actions={actions} />
          </div>
        </Card>
        <ConfirmDialogComponent />
      </>
    );
  }

  return (
    <>
      <Card variant="interactive" className="h-full">
        <button type="button" onClick={open} className="flex h-full flex-col text-left outline-none">
          <span className={cn("flex h-20 w-full items-end p-3", fill)}>
            <Icon aria-hidden className={cn("size-8", COVER_ICON_CLASS)} />
          </span>
          <span className="flex flex-1 flex-col gap-1 p-3">
            <span className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-card-foreground">
              {notebook.title}
            </span>
            <span className="text-xs text-muted-foreground">{meta}</span>
          </span>
        </button>
        <div className="absolute top-2 right-2">
          <CornerSlot props={props} actions={actions} />
        </div>
      </Card>
      <ConfirmDialogComponent />
    </>
  );
}
```

Callers previously passed `isMenuOpen`, `onToggleMenu`, `onCloseMenu`, `isInFolder` and `showAuthor`. Remove those at the call sites in Tasks 10 and 11; Radix owns the open state now.

- [ ] **Step 4: Run it** → PASS. **Step 5: Commit** — `git commit -m "feat(notebooks): denser notebook card with actions menu"`. Typecheck may fail at old call sites until Tasks 10–11. If so, commit anyway; the pre-commit hook doesn't typecheck, and the branch is green again after Task 11.

---

### Task 8: Folder card

**Files:**
- Rewrite: `apps/web/src/features/notebooks/components/cards/FolderCard.tsx`
- Test: `apps/web/src/features/notebooks/components/cards/FolderCard.test.tsx`

- [ ] **Step 1: Write the failing test** (same `beforeAll` Radix shims as Task 7):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { FolderItem } from "@/shared/types/index";
import { FolderCard } from "./FolderCard";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const folder: FolderItem = { id: "f1", name: "Biology", notebookCount: 6, created_at: 0, updated_at: 0 };

describe("FolderCard", () => {
  test.each(["grid", "list"] as const)("%s: opens and reads as a folder", async (viewMode) => {
    const onSelect = vi.fn();
    render(
      <FolderCard
        folder={folder}
        viewMode={viewMode}
        onSelectFolder={onSelect}
        onOpenFolderCustomize={vi.fn()}
        onDeleteFolder={vi.fn()}
      />
    );
    expect(screen.getAllByText("6 notebooks").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Biology/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Folder actions" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Rewrite `FolderCard.tsx`**

```tsx
import { Settings2, Trash2 } from "lucide-react";
import { Card } from "@/shared/components/ui/card";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import type { FolderItem } from "@/shared/types/index";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { cn } from "@/shared/utils/cn";
import { folderIcon } from "@/shared/notebook/notebookIcons";
import { folderMeta } from "../../notebookMeta";
import { CardActionsMenu } from "./CardActionsMenu";

interface FolderCardProps {
  folder: FolderItem;
  viewMode: "grid" | "list";
  onSelectFolder: () => void;
  onOpenFolderCustomize: () => void;
  onDeleteFolder: (id: string) => void;
}

export function FolderCard({
  folder,
  viewMode,
  onSelectFolder,
  onOpenFolderCustomize,
  onDeleteFolder,
}: FolderCardProps) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const Icon = folderIcon(folder.icon);
  const fill = coverFillClass(folder.color);
  const meta = folderMeta(folder);
  const menu = (
    <CardActionsMenu
      label="Folder actions"
      actions={[
        { label: "Customize", icon: Settings2, onSelect: onOpenFolderCustomize },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          onSelect: async () => {
            const ok = await confirm(
              "Delete Folder",
              `Are you sure you want to delete "${folder.name}"? This will also remove all notebooks inside this folder.`,
              { confirmText: "Delete", cancelText: "Cancel", variant: "danger" }
            );
            if (ok) onDeleteFolder(folder.id);
          },
        },
      ]}
    />
  );

  if (viewMode === "list") {
    return (
      <>
        <Card variant="interactive" className="flex-row items-center">
          <button
            type="button"
            onClick={onSelectFolder}
            className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left outline-none"
          >
            {/* Icon chip with a folder tab */}
            <span className="relative flex size-9 shrink-0 items-center justify-center">
              <span aria-hidden className={cn("absolute -top-1 left-0.5 h-1.5 w-4 rounded-t-sm", fill)} />
              <span className={cn("flex size-9 items-center justify-center rounded-md rounded-tl-none", fill)}>
                <Icon aria-hidden className={cn("size-4", COVER_ICON_CLASS)} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-sm font-medium text-card-foreground">
                {folder.name}
              </span>
              <span className="block text-xs text-muted-foreground sm:hidden">{meta}</span>
            </span>
            <span className="hidden w-40 shrink-0 text-right text-xs text-muted-foreground sm:block">
              {meta}
            </span>
          </button>
          <div className="flex w-8 shrink-0 justify-center pr-2">{menu}</div>
        </Card>
        <ConfirmDialogComponent />
      </>
    );
  }

  return (
    <>
      <div className="relative h-full">
        {/* Folder silhouette: a tab above the top-left edge and a sheet peeking out underneath. */}
        <span aria-hidden className={cn("absolute -top-2 left-4 h-3 w-14 rounded-t-md", fill)} />
        <span aria-hidden className="absolute inset-x-2 -bottom-1.5 top-3 rounded-xl border bg-card shadow-sm" />
        <Card variant="interactive" className="h-full">
          <button
            type="button"
            onClick={onSelectFolder}
            className="flex h-full flex-col text-left outline-none"
          >
            <span className="relative flex h-20 w-full items-end p-3">
              <span aria-hidden className={cn("absolute inset-0 opacity-60", fill)} />
              <Icon aria-hidden className={cn("relative size-8", COVER_ICON_CLASS)} />
            </span>
            <span className="flex flex-1 flex-col gap-1 p-3">
              <span className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-card-foreground">
                {folder.name}
              </span>
              <span className="text-xs text-muted-foreground">{meta}</span>
            </span>
          </button>
          <div className="absolute top-2 right-2">{menu}</div>
        </Card>
      </div>
      <ConfirmDialogComponent />
    </>
  );
}
```

- [ ] **Step 4: Run it** → PASS. **Step 5: Commit** — `git commit -m "feat(notebooks): folder card with folder silhouette (#226)"`.

---

### Task 9: Home header (view controls, create split button)

**Files:**
- Create: `components/home/ViewControls.tsx`, `CreateMenuButton.tsx`, `HomeHeader.tsx`, `HomeEmptyState.tsx`
- Modify: `apps/web/src/features/notebooks/hooks/useNotebookSorting.ts`
- Test: `components/home/HomeHeader.test.tsx`

- [ ] **Step 1: Simplify `useNotebookSorting`.** Remove `isSortMenuOpen`, `setIsSortMenuOpen` and `toggleSortMenu` (state, return type and return object). Export the type: `export type SortOption = "date" | "title";`. Keep `getSortedNotebooks` unchanged. Run `rg "isSortMenuOpen|toggleSortMenu" apps/web/src`. Only `HomePage`/`FolderView` use them, and they're rewritten in Tasks 10–11.

- [ ] **Step 2: Write the failing test**

```tsx
// HomeHeader.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { HomeHeader } from "./HomeHeader";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

function setup() {
  const props = {
    tab: "all" as const,
    onTabChange: vi.fn(),
    viewMode: "grid" as const,
    onViewModeChange: vi.fn(),
    sortOption: "date" as const,
    onSortChange: vi.fn(),
    onCreateNotebook: vi.fn(),
    onCreateFolder: vi.fn(),
  };
  render(<HomeHeader {...props} />);
  return props;
}

describe("HomeHeader", () => {
  test("New notebook creates a notebook and is the onboarding target", async () => {
    const props = setup();
    const button = screen.getByRole("button", { name: "New notebook" });
    expect(button).toHaveAttribute("data-onboarding", "create-notebook-button");
    await userEvent.click(button);
    expect(props.onCreateNotebook).toHaveBeenCalledOnce();
  });

  test("New folder lives in the create menu", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "More create options" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "New folder" }));
    expect(props.onCreateFolder).toHaveBeenCalledOnce();
  });

  test("tabs and view toggle report changes", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("tab", { name: "My notebooks" }));
    expect(props.onTabChange).toHaveBeenCalledWith("mine");
    await userEvent.click(screen.getByRole("radio", { name: "List view" }));
    expect(props.onViewModeChange).toHaveBeenCalledWith("list");
  });
});
```

- [ ] **Step 3: Run it** → FAIL.

- [ ] **Step 4: Implement**

```tsx
// components/home/ViewControls.tsx
import { LayoutGrid, List } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import type { SortOption } from "../../hooks/useNotebookSorting";
import type { ViewMode } from "./CardGrid";

interface ViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}

export function ViewControls({ viewMode, onViewModeChange, sortOption, onSortChange }: ViewControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={viewMode}
        onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
        aria-label="View"
      >
        <ToggleGroupItem value="grid" aria-label="Grid view">
          <LayoutGrid />
        </ToggleGroupItem>
        <ToggleGroupItem value="list" aria-label="List view">
          <List />
        </ToggleGroupItem>
      </ToggleGroup>
      <Select value={sortOption} onValueChange={(value) => onSortChange(value as SortOption)}>
        <SelectTrigger size="sm" aria-label="Sort notebooks" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="date">Most recent</SelectItem>
          <SelectItem value="title">Title (A–Z)</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

```tsx
// components/home/CreateMenuButton.tsx
import { ChevronDown, FolderPlus, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup } from "@/shared/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/** Primary create action; folders are secondary, so they live in the attached menu. */
export function CreateMenuButton({
  onCreateNotebook,
  onCreateFolder,
}: {
  onCreateNotebook: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <ButtonGroup>
      <Button data-onboarding="create-notebook-button" onClick={onCreateNotebook}>
        <Plus />
        New notebook
      </Button>
      {/* modal={false}: the item opens a dialog (see CardActionsMenu). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" aria-label="More create options">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onCreateFolder}>
            <FolderPlus />
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
```

(If `button-group.tsx` exports a `ButtonGroupSeparator`, put one between the two buttons.)

```tsx
// components/home/HomeHeader.tsx
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { SortOption } from "../../hooks/useNotebookSorting";
import type { ViewMode } from "./CardGrid";
import { CreateMenuButton } from "./CreateMenuButton";
import { ViewControls } from "./ViewControls";

export type HomeTab = "all" | "mine" | "featured";

interface HomeHeaderProps {
  tab: HomeTab;
  onTabChange: (tab: HomeTab) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
  onCreateNotebook: () => void;
  onCreateFolder: () => void;
}

export function HomeHeader(props: HomeHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Your notebooks
        </h1>
        <CreateMenuButton
          onCreateNotebook={props.onCreateNotebook}
          onCreateFolder={props.onCreateFolder}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={props.tab} onValueChange={(value) => props.onTabChange(value as HomeTab)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">My notebooks</TabsTrigger>
            <TabsTrigger value="featured">Featured</TabsTrigger>
          </TabsList>
        </Tabs>
        <ViewControls
          viewMode={props.viewMode}
          onViewModeChange={props.onViewModeChange}
          sortOption={props.sortOption}
          onSortChange={props.onSortChange}
        />
      </div>
    </header>
  );
}
```

```tsx
// components/home/HomeEmptyState.tsx
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";

export function HomeEmptyState({ onCreateNotebook }: { onCreateNotebook: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyTitle>Create your first notebook</EmptyTitle>
        <EmptyDescription>
          Add PDFs, links or notes, then chat with them and turn them into flashcards, quizzes and
          reports.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreateNotebook}>
          <Plus />
          New notebook
        </Button>
      </EmptyContent>
    </Empty>
  );
}
```

(Check `empty.tsx` for `EmptyMedia`'s variant names; use the icon variant it defines.)

- [ ] **Step 5: Run it** → PASS. **Step 6: Commit** — `git commit -m "feat(notebooks): home header with tabs, view controls and create menu"`.

---

### Task 10: Home page and sections

**Files:**
- Rewrite: `components/views/RecentSection.tsx`, `components/views/FeaturedSection.tsx`, render part of `components/HomePage.tsx`
- Modify: `hooks/useNotebookHandlers.ts`, `hooks/useFolderHandlers.ts`

- [ ] **Step 1: Drop menu state from the handler hooks.**
  - `useNotebookHandlers.ts`: remove `activeMenuId`/`setActiveMenuId` (the state, both interface fields, the return entries, and the `setActiveMenuId(null)` calls inside `openCustomize`/`openMoveToFolder`).
  - `useFolderHandlers.ts`: the same for `folderActiveMenuId`/`setFolderActiveMenuId`.

- [ ] **Step 2: RecentSection**

```tsx
// components/views/RecentSection.tsx
import type { FolderItem, NotebookItem } from "@/shared/types/index";
import { FolderCard } from "../cards/FolderCard";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { GridSkeleton } from "../home/GridSkeleton";
import { HomeEmptyState } from "../home/HomeEmptyState";
import { ListHeader } from "../ListHeader";

interface RecentSectionProps {
  recentNotebooks: NotebookItem[];
  folders: FolderItem[];
  viewMode: ViewMode;
  isLoading: boolean;
  onCreateNotebook: () => void;
  onSelectNotebook: (notebook: NotebookItem) => void;
  onSelectFolder: (folderId: string) => void;
  onOpenCustomize: (id: string) => void;
  onOpenMoveToFolder: (id: string) => void;
  onDeleteNotebook: (id: string) => void;
  onOpenFolderCustomize: (id: string) => void;
  onDeleteFolder: (id: string) => void;
}

export function RecentSection(props: RecentSectionProps) {
  const { folders, viewMode } = props;
  // Notebooks inside a folder show in that folder, not on the home grid.
  const notebooks = props.recentNotebooks.filter((nb) => !nb.folderId);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-foreground">My notebooks</h2>
      {props.isLoading ? (
        <GridSkeleton />
      ) : folders.length === 0 && notebooks.length === 0 ? (
        <HomeEmptyState onCreateNotebook={props.onCreateNotebook} />
      ) : (
        <>
          {viewMode === "list" && <ListHeader />}
          <CardGrid viewMode={viewMode}>
            {folders.map((folder, i) => (
              <CardGridItem key={`folder-${folder.id}`} index={i}>
                <FolderCard
                  folder={folder}
                  viewMode={viewMode}
                  onSelectFolder={() => props.onSelectFolder(folder.id)}
                  onOpenFolderCustomize={() => props.onOpenFolderCustomize(folder.id)}
                  onDeleteFolder={props.onDeleteFolder}
                />
              </CardGridItem>
            ))}
            {notebooks.map((nb, i) => (
              <CardGridItem key={nb.id} index={folders.length + i}>
                <NotebookCard
                  notebook={nb}
                  viewMode={viewMode}
                  onSelectNotebook={props.onSelectNotebook}
                  onOpenCustomize={() => props.onOpenCustomize(nb.id)}
                  onOpenMoveToFolder={() => props.onOpenMoveToFolder(nb.id)}
                  onDeleteNotebook={props.onDeleteNotebook}
                />
              </CardGridItem>
            ))}
          </CardGrid>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: FeaturedSection**

```tsx
// components/views/FeaturedSection.tsx
import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { ListHeader } from "../ListHeader";

interface FeaturedSectionProps {
  featuredNotebooks: NotebookItem[];
  viewMode: ViewMode;
  onSelectNotebook: (notebook: NotebookItem) => void;
  /** On the Featured tab, say so instead of rendering nothing. */
  showEmpty?: boolean;
}

export function FeaturedSection({ featuredNotebooks, viewMode, onSelectNotebook, showEmpty }: FeaturedSectionProps) {
  if (featuredNotebooks.length === 0) {
    return showEmpty ? (
      <p className="py-12 text-center font-sans text-sm text-muted-foreground">
        No featured notebooks yet.
      </p>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-foreground">Featured notebooks</h2>
      {viewMode === "list" && <ListHeader />}
      <CardGrid viewMode={viewMode}>
        {featuredNotebooks.map((nb, i) => (
          <CardGridItem key={nb.id} index={i}>
            <NotebookCard notebook={nb} viewMode={viewMode} onSelectNotebook={onSelectNotebook} featured />
          </CardGridItem>
        ))}
      </CardGrid>
    </section>
  );
}
```

- [ ] **Step 4: HomePage.** Keep everything from the top of the component through `handleUpdateFolderFromModal` (create/update handlers, `useLimitErrorToast`, auth guards), with these changes:
  - Delete the `HomePageProps` interface and render `export const HomePage: React.FC = () => {`. `App.tsx` renders `<HomePage />` without props.
  - Delete the stray `useUpdateNotebook();` / `useUpdateFolder();` calls and their imports.
  - Replace `activeTab` state with `const [tab, setTab] = useState<HomeTab>("all");`, and type `viewMode` as `useState<ViewMode>("grid")`.
  - Replace the sorting destructure with `const { sortOption, setSortOption, getSortedNotebooks } = useNotebookSorting();`.
  - Delete the click-outside `useEffect` and the `activeMenuId`/`folderActiveMenuId` destructuring.
  - Read `notebooksLoading` from `ctx`.

  Replace the returned JSX's outer wrapper and content (everything before `{/* CUSTOMIZE NOTEBOOK MODAL */}`) with:

```tsx
    <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 font-serif sm:px-6 md:px-10 md:pt-10">
      <div className="mx-auto flex max-w-400 flex-col gap-8">
        <HomeHeader
          tab={tab}
          onTabChange={setTab}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortOption={sortOption}
          onSortChange={setSortOption}
          onCreateNotebook={handleCreateNotebookClick}
          onCreateFolder={handleCreateFolderClick}
        />
        {tab !== "mine" && (
          <FeaturedSection
            featuredNotebooks={sortedFeaturedNotebooks}
            viewMode={viewMode}
            onSelectNotebook={onSelectNotebook}
            showEmpty={tab === "featured"}
          />
        )}
        {tab !== "featured" && (
          <RecentSection
            recentNotebooks={sortedRecentNotebooks}
            folders={folders}
            viewMode={viewMode}
            isLoading={ctx.notebooksLoading}
            onCreateNotebook={handleCreateNotebookClick}
            onSelectNotebook={onSelectNotebook}
            onSelectFolder={onSelectFolder}
            onOpenCustomize={notebookHandlers.openCustomize}
            onOpenMoveToFolder={notebookHandlers.openMoveToFolder}
            onDeleteNotebook={deleteNotebookHandler}
            onOpenFolderCustomize={folderHandlers.openFolderCustomize}
            onDeleteFolder={onDeleteFolder ?? ((_id: string) => undefined)}
          />
        )}
      </div>
```

  Keep the three modal blocks and the closing `</div>` as they are. New imports: `HomeHeader, type HomeTab` from `./home/HomeHeader`, and `type ViewMode` from `./home/CardGrid`. Drop the now-unused lucide imports.

- [ ] **Step 5: Verify** — repo root `bun run typecheck:web` (FolderView errors remain until Task 11). Run `bunx vitest run --config vitest.config.ts src/features/notebooks` → PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(notebooks): rebuild the home page on the design system"`.

---

### Task 11: Folder view

**Files:**
- Rewrite: `apps/web/src/features/notebooks/components/views/FolderView.tsx`

- [ ] **Step 1:** Keep the data and handler logic: the `ctx` reads, `useFolderNotebooks`, `useCreateNotebook`, the `folder` memo, `useNotebookHandlers`, `handleDeleteNotebook`, `handleMoveNotebook`, and the modal blocks with their create/update logic. Change:
  - the sorting destructure to `const { sortOption, setSortOption, getSortedNotebooks } = useNotebookSorting();`
  - `viewMode` state to `useState<ViewMode>(initialViewMode)`
  - delete `useUpdateNotebook();`
  - **loading** → render the page shell (below) with `<GridSkeleton />` in place of the grid (no more `PageSkeleton`)
  - **not found** →

```tsx
      <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 sm:px-6 md:px-10 md:pt-10">
        <div className="mx-auto flex max-w-400 flex-col gap-6">
          <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
            <ArrowLeft />
            Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>Folder not found</AlertDescription>
          </Alert>
        </div>
      </div>
```

  - **main render** (replace everything before `{/* CUSTOMIZE NOTEBOOK MODAL */}`):

```tsx
    <div className="flex-1 overflow-y-auto bg-background px-4 pt-6 pb-20 font-serif sm:px-6 md:px-10 md:pt-10">
      <div className="mx-auto flex max-w-400 flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft />
                Back
              </Button>
              <h1 className="truncate font-display text-2xl font-bold text-foreground">{folder.name}</h1>
            </div>
            <Button onClick={notebookHandlers.openCreateNotebook}>
              <Plus />
              New notebook
            </Button>
          </div>
          <div className="flex justify-end">
            <ViewControls
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              sortOption={sortOption}
              onSortChange={setSortOption}
            />
          </div>
        </header>

        {sortedNotebooks.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>This folder is empty</EmptyTitle>
              <EmptyDescription>Create a notebook here, or move one in from the home page.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {viewMode === "list" && <ListHeader />}
            <CardGrid viewMode={viewMode}>
              {sortedNotebooks.map((nb, i) => (
                <CardGridItem key={nb.id} index={i}>
                  <NotebookCard
                    notebook={nb}
                    viewMode={viewMode}
                    onSelectNotebook={onSelectNotebook}
                    onOpenCustomize={() => notebookHandlers.openCustomize(nb.id)}
                    onOpenMoveToFolder={() => notebookHandlers.openMoveToFolder(nb.id)}
                    onDeleteNotebook={handleDeleteNotebook}
                  />
                </CardGridItem>
              ))}
            </CardGrid>
          </>
        )}
      </div>
```

  For the loading state, return the same outer two divs with just a simple header (the Back button) and `<GridSkeleton />`. Imports: `Alert, AlertDescription`, `Button`, `Empty, EmptyDescription, EmptyHeader, EmptyTitle`, `CardGrid, CardGridItem, type ViewMode`, `GridSkeleton`, `ViewControls`, `ListHeader`. Lucide imports: `ArrowLeft`, `Plus`. Remove `PageSkeleton` and the other lucide imports.

- [ ] **Step 2: Verify** — repo root `bun run typecheck:web` clean. Run `bunx vitest run --config vitest.config.ts src/features/notebooks` → PASS. Run `rg "Create new notebook" apps/web/src` → no hits outside tests.

- [ ] **Step 3: Commit** — `git commit -m "feat(notebooks): rebuild the folder view on the design system"`.

---

### Task 12: Customize dialogs

**Files:**
- Create: `components/modals/CoverCustomizeDialog.tsx`, `CoverCustomizeDialog.test.tsx`
- Rewrite: `components/modals/CustomizeNotebookModal.tsx`, `CustomizeFolderModal.tsx`

- [ ] **Step 1: Write the failing test** (same Radix `beforeAll` shims as Task 7):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

describe("CoverCustomizeDialog", () => {
  test("create notebook: no folder icon, saves trimmed name", async () => {
    const onSave = vi.fn();
    render(<CoverCustomizeDialog kind="notebook" onClose={vi.fn()} onSave={onSave} />);
    expect(screen.getByRole("heading", { name: "Create notebook" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Folder icon" })).toBeNull();
    const create = screen.getByRole("button", { name: "Create" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("Notebook title"), "  Physics  ");
    await userEvent.click(screen.getByRole("radio", { name: "Globe icon" }));
    await userEvent.click(create);
    expect(onSave).toHaveBeenCalledWith({ name: "Physics", color: "bg-vintage-brown-300", icon: "Globe" });
  });

  test("editing a notebook stored with the folder icon shows Book selected", () => {
    render(
      <CoverCustomizeDialog
        kind="notebook"
        initial={{ name: "Old", color: "bg-vintage-blue-300", icon: "Folder" }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Customize notebook" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Book icon" })).toHaveAttribute("data-state", "on");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("folders can pick the folder icon", () => {
    render(<CoverCustomizeDialog kind="folder" onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Folder icon" })).toHaveAttribute("data-state", "on");
    expect(screen.getByPlaceholderText("Folder name")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement `CoverCustomizeDialog.tsx`**

```tsx
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { COVER_COLORS, COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import { cn } from "@/shared/utils/cn";
import {
  COVER_ICONS,
  FOLDER_ICON_NAMES,
  folderIconName,
  NOTEBOOK_ICON_NAMES,
  notebookIconName,
} from "@/shared/notebook/notebookIcons";

export interface CoverValues {
  name: string;
  color: string;
  icon: string;
}

const COPY = {
  notebook: { create: "Create notebook", edit: "Customize notebook", label: "Title", placeholder: "Notebook title" },
  folder: { create: "Create folder", edit: "Customize folder", label: "Name", placeholder: "Folder name" },
} as const;

const swatchName = (cls: string) => cls.replace("bg-vintage-", "").replace("-", " ");

interface CoverCustomizeDialogProps {
  kind: "notebook" | "folder";
  /** Omit to create. */
  initial?: CoverValues;
  onClose: () => void;
  onSave: (values: CoverValues) => void | Promise<void>;
}

export function CoverCustomizeDialog({ kind, initial, onClose, onSave }: CoverCustomizeDialogProps) {
  const copy = COPY[kind];
  const isCreate = !initial;
  const iconNames = kind === "notebook" ? NOTEBOOK_ICON_NAMES : FOLDER_ICON_NAMES;
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(coverFillClass(initial?.color));
  const [icon, setIcon] = useState(
    kind === "notebook" ? notebookIconName(initial?.icon) : folderIconName(initial?.icon)
  );
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const PreviewIcon = COVER_ICONS[icon];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color, icon });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{isCreate ? copy.create : copy.edit}</DialogTitle>
            <DialogDescription>Pick a name, colour and icon.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center" aria-hidden>
            <div className="flex w-40 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className={cn("flex h-16 items-end p-2.5", color)}>
                <PreviewIcon className={cn("size-7", COVER_ICON_CLASS)} />
              </div>
              <div className="truncate p-2.5 font-sans text-sm font-semibold text-card-foreground">
                {name.trim() || copy.placeholder}
              </div>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor={nameId}>{copy.label}</FieldLabel>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.placeholder}
              autoFocus
            />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Colour</FieldLegend>
            <ToggleGroup
              type="single"
              variant="swatch"
              size="sm"
              spacing={1}
              value={color}
              onValueChange={(value) => value && setColor(value)}
              className="flex-wrap"
            >
              {COVER_COLORS.map((swatch) => (
                <ToggleGroupItem key={swatch} value={swatch} aria-label={`Colour ${swatchName(swatch)}`}>
                  <span aria-hidden className={cn("size-full rounded-full", swatch)} />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">Icon</FieldLegend>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={1}
              value={icon}
              onValueChange={(value) => value && setIcon(value)}
              className="flex-wrap"
            >
              {iconNames.map((iconName) => {
                const Icon = COVER_ICONS[iconName];
                return (
                  <ToggleGroupItem key={iconName} value={iconName} aria-label={`${iconName} icon`}>
                    <Icon />
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </FieldSet>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {isCreate ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Check `field.tsx` `FieldLegend` for a `variant` prop. If it has none, drop `variant="label"`. Radix ToggleGroup items with `type="single"` have role `radio`, which the test relies on.

- [ ] **Step 4: Thin wrappers.** These keep the call sites' props unchanged.

```tsx
// CustomizeNotebookModal.tsx
import type { NotebookItem } from "@/shared/types/index";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

interface CustomizeNotebookModalProps {
  notebook?: NotebookItem;
  onClose: () => void;
  onSave: (data: { title: string; coverColor: string; icon: string }) => void | Promise<void>;
}

export function CustomizeNotebookModal({ notebook, onClose, onSave }: CustomizeNotebookModalProps) {
  return (
    <CoverCustomizeDialog
      kind="notebook"
      initial={
        notebook && { name: notebook.title, color: notebook.coverColor ?? "", icon: notebook.icon ?? "" }
      }
      onClose={onClose}
      onSave={({ name, color, icon }) => onSave({ title: name, coverColor: color, icon })}
    />
  );
}
```

```tsx
// CustomizeFolderModal.tsx
import type { FolderItem } from "@/shared/types/index";
import { CoverCustomizeDialog } from "./CoverCustomizeDialog";

interface CustomizeFolderModalProps {
  folder?: FolderItem;
  onClose: () => void;
  onSave: (data: { name: string; color: string; icon: string }) => void | Promise<void>;
}

export function CustomizeFolderModal({ folder, onClose, onSave }: CustomizeFolderModalProps) {
  return (
    <CoverCustomizeDialog
      kind="folder"
      initial={folder && { name: folder.name, color: folder.color ?? "", icon: folder.icon ?? "" }}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
```

`modals/index.ts` re-exports by name. Keep the export names, and if it used `export { X } from` with a `React.FC` const, the function exports still match.

- [ ] **Step 5: Run it** → PASS, plus repo root `bun run typecheck:web`. **Step 6: Commit** — `git commit -m "feat(notebooks): customize dialogs on Dialog with swatch and icon pickers"`.

---

### Task 13: Move-to-folder dialog

**Files:**
- Rewrite: `apps/web/src/features/notebooks/components/modals/MoveToFolderModal.tsx`

- [ ] **Step 1: Rewrite** (props unchanged):

```tsx
import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { COVER_ICON_CLASS, coverFillClass } from "@/shared/notebook/coverColor";
import type { FolderItem } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { folderIcon } from "@/shared/notebook/notebookIcons";
import { folderMeta } from "../../notebookMeta";

interface MoveToFolderModalProps {
  notebookId: string;
  folders: FolderItem[];
  onClose: () => void;
  onMove: (notebookId: string, folderId: string | null) => void;
}

const ROW =
  "flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MoveToFolderModal({ notebookId, folders, onClose, onMove }: MoveToFolderModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>Choose where this notebook lives.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 flex max-h-96 flex-col gap-1 overflow-y-auto">
          <button type="button" className={ROW} onClick={() => onMove(notebookId, null)}>
            <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
              <FolderOpen aria-hidden className="size-5 text-muted-foreground" />
            </span>
            <span>
              <span className="block font-sans text-sm font-semibold text-foreground">No folder</span>
              <span className="block text-xs text-muted-foreground">Show on the home page</span>
            </span>
          </button>
          {folders.map((folder) => {
            const Icon = folderIcon(folder.icon);
            return (
              <button key={folder.id} type="button" className={ROW} onClick={() => onMove(notebookId, folder.id)}>
                <span className={cn("flex size-10 items-center justify-center rounded-lg", coverFillClass(folder.color))}>
                  <Icon aria-hidden className={cn("size-5", COVER_ICON_CLASS)} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-sans text-sm font-semibold text-foreground">{folder.name}</span>
                  <span className="block text-xs text-muted-foreground">{folderMeta(folder)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Cancel is the Dialog's built-in close button and Esc.)

- [ ] **Step 2: Verify** — `bun run typecheck:web`. **Step 3: Commit** — `git commit -m "feat(notebooks): move-to-folder dialog"`.

---

### Task 14: Share dialog

**Files:**
- Rewrite (markup only): `apps/web/src/features/notebooks/components/modals/ShareNotebookModal.tsx`

- [ ] **Step 1:** Keep all logic (hooks, `handleCreate`, `handleCopy`, `handleRevoke`, state, `formatLinkTimestamp`, every user-facing string). Change the markup:
  - **Outer:** replace the `fixed inset-0 …` wrapper, backdrop and inner `role="dialog"` div with `<Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent size="wide" padding="none">…</DialogContent></Dialog>`. Delete the custom close button (`DialogContent` renders one).
  - **Header:** `<DialogHeader className="border-b p-6"><DialogTitle className="flex items-center gap-3"><Share2 aria-hidden className="size-5 text-primary" />Share notebook</DialogTitle><DialogDescription className="sr-only">Create cowork or duplicate links for this notebook.</DialogDescription></DialogHeader>`. If `design-lint` flags `className` on `DialogTitle`, wrap the icon and text in a `<span className="flex items-center gap-3">` inside it.
  - **Body:** keep `<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">` and the two `<section>`s and their text as they are, but:
    - Duplicate button: `variant="outline" className="w-full"`, with no colour overrides.
    - Spinners: `<Loader2 className="h-4 w-4 animate-spin" />` → `<Spinner aria-hidden />` from `@/shared/components/ui/spinner`.
  - **`LinkUrlRow`:**
    - URL text `text-[11px]` → `text-xs`.
    - Copy button: `size="sm" className="w-full shrink-0 sm:w-auto"`, dropping `h-9 gap-1.5 px-4`.
  - **Active links:**
    - Count chip → `<Badge variant="secondary">{activeLinks.length}</Badge>`.
    - Kind chip → `<Badge variant={l.kind === "collaborate" ? "default" : "outline"}>{…}</Badge>`.
    - Revoke button: `variant="ghost-destructive" size="sm" className="w-full sm:w-auto sm:shrink-0"`, dropping the colour and justify overrides, with `<Spinner aria-hidden />` while revoking.
  - Remove the `X` import.

- [ ] **Step 2: Verify** — repo root `bun run typecheck:web`. From `apps/web`: `bunx eslint -c eslint.config.mjs src/features/notebooks/components/modals/ShareNotebookModal.tsx` → 0 findings.

- [ ] **Step 3: Commit** — `git commit -m "feat(notebooks): share dialog on Dialog"`.

---

### Task 15: Panel separator lint

**Files:**
- Modify: `apps/web/src/features/notebooks/components/views/NotebookPanelSeparator.tsx`

- [ ] **Step 1:**

```tsx
// The linter treats any `Separator` as the shadcn ui component; alias the panels primitive.
import { Separator as PanelResizeHandle } from "react-resizable-panels";

const separatorClassName =
  "z-50 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-primary/50 pointer-coarse:w-0.5 pointer-coarse:bg-border/80";
```

Render `<PanelResizeHandle …/>` with the same props.

- [ ] **Step 2: Verify** — from `apps/web`: `bunx eslint -c eslint.config.mjs src/features/notebooks` → 0 findings. If any remain, fix them in the file they point to, following the rules above. Then run `bun run typecheck:web`.

- [ ] **Step 3: Commit** — `git commit -m "fix(notebooks): panel separator lint"`.

---

### Task 16: E2E selectors

**Files:**
- Modify: `e2e/notebooks/notebook.spec.ts`, `e2e/fixtures/notebook.fixture.ts`, `e2e/onboarding/onboarding-ui.spec.ts`

- [ ] **Step 1:**
  - Replace every `page.getByText("Create new notebook").first()` with `page.getByRole("button", { name: "New notebook" }).first()`. That's `notebook.spec.ts:8,48`, `notebook.fixture.ts:26` and `onboarding-ui.spec.ts:29`.
  - In `notebook.spec.ts`, replace the parent-locator plus `[class*="kebab"]` lookup (lines ~53–61) with:

```ts
    const card = page.locator('[data-slot="card"]', { hasText: beforeName });
    await card.getByRole("button", { name: "Notebook actions" }).click();
    await page.getByRole("menuitem", { name: "Customize" }).click();
```

  - Line ~33's `page.locator('[class*="notebook"]')` → `page.locator('[data-slot="card"]')`. Read the surrounding test and keep its intent.
  - `e2e/helpers/notebook-cleanup.ts`: the teardown helper still uses the old markup, and its caller swallows failures, so teardown would silently stop deleting. Make these swaps:
    - `getByRole("button", { name: "All" })` → `getByRole("tab", { name: "All" })`
    - `.kebab-menu button` → the card's `getByRole("button", { name: "Notebook actions" })` inside `page.locator('[data-slot="card"]', …)`
    - `div.bg-popover` items → `getByRole("menuitem", { name: "Delete" })`, then confirm in the `alertdialog` (button "Delete").
  - Run `rg -n "Create new notebook|kebab|bg-popover|name: \"All\"" e2e` and fix any other stale selector it finds.
  - `apps/web/src/features/onboarding/steps.ts`: the `createNotebook` step's `side: "right"` → `"bottom"`. The anchor is now at the page's top-right.

- [ ] **Step 2:** From the repo root, run `bunx playwright test --list e2e/notebooks e2e/onboarding` to confirm the specs still parse. The full run needs E2E credentials and a backend, so it isn't run here.

- [ ] **Step 3: Commit** — `git commit -m "test(e2e): role-based selectors for the notebooks home"`.

---

### Task 17: Enforce, lower baseline, verify

**Files:**
- Modify: `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json`

- [ ] **Step 1:** Add `"src/features/notebooks/**/*.tsx",` to `MIGRATED` (after `onboarding`).
- [ ] **Step 2:** Repo root: `bun run lint:design`. Expected: `features/notebooks` drops to 0 and `OK`. Then `bun run lint:design:update`.
- [ ] **Step 3: Full gates** (repo root, one at a time):

```bash
bun run typecheck:web
bun run typecheck:convex
bun run lint -- --diagnostic-level=error
bun run lint:design
bun run test:web
bun run test:convex
```

Expected: all clean/passing. Note `test:convex` timing flakes in the PR if they don't reproduce on rerun.

- [ ] **Step 4: Commit** — `git commit -m "chore(web): enforce design lint on notebooks"`.

- [ ] **Step 5: Visual check (controller, not subagent).** In the in-app browser (signed in), check `/home` at 390×844, 768×1024 and 1440×900:
  - grid
  - list
  - the folder view
  - each dialog open, then closed with Esc.

  Confirm:
  - two cards per row on phone, with the first card above the fold
  - the folder silhouette
  - the stagger on load
  - a sort change glides.

  Never click Delete or Logout on the user's account.
