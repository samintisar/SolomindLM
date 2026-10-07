# Studio Literature Review (PR 8 of #264) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the literature review views onto the design system at 0 design-lint findings. `features/studio` then drops from 73 findings to 0, and `MIGRATED` swaps its per-file Studio globs for `src/features/studio/**/*.tsx`, which closes #264.

**Architecture:**
- **Two new primitives** in `shared/components/ui`:
  - **`Table`:** added with the shadcn CLI, then adapted to the soft-layered look.
    - Borders go on cells, not rows, under `border-separate border-spacing-0`, so sticky cells keep their hairlines.
    - A `sticky` header and `pinned` cells give the literature table its frozen header row and first column.
    - The scroll container is the table's own wrapper, so sticky positioning works.
  - **`Switch`:** for the column toggles in `ColumnManager`.
  - Both get `/dev/design` gallery entries.
- **Menus:** the three users of the legacy `shared/ui/DropdownMenu.tsx` move to the shadcn `DropdownMenu` (`DropdownMenuTrigger asChild` + `Button`, `DropdownMenuItem` with an icon). The legacy menu, its `anchoredPosition` helper, their tests and its ESLint override are deleted.
- **Controls:** hand-rolled toolbar buttons, checkboxes, the switch, inputs, empty states and spinners become `Button`, `Checkbox`, `Switch`, `Field` + `Input`/`Textarea`, `Empty` and `Spinner`. The three local `cn()` copies are replaced by `@/shared/utils/cn`.
- **Colours:** palette classes become tokens:
  - `muted-foreground` for neutrals;
  - `studio-literature` for the orange literature accents;
  - `destructive` for PDF and exclusion;
  - `success`/`info`/`destructive` for the PRISMA boxes and screening decisions.
- **Type:** `text-[15px]` → `text-sm` (15px on this scale); `text-[11px]`, `[12px]` and `[13px]` → `text-xs` (13px, the smallest step). The screening and table text gets slightly larger, which is the "roomier" ask.

**Tech Stack:** React 19.2, Tailwind v4, shadcn/ui on Radix (`Table` new, `Switch` new, `DropdownMenu`, `Checkbox`, `Badge`, `Tooltip`, `Button`, `Field`, `Input`, `Textarea`, `Empty`, `Spinner`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`, "### 8. Literature review".

**Working directory:** worktree `.worktrees/studio` (`C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb\.worktrees\studio`), branch `feature/studio-literature`, already created from `origin/main` at `9bcf49bf`.
- **One web test file:** `bun run test <path>`, run from `apps/web`.
- **Design lint for files:** `bunx eslint --max-warnings 0 <files>`, run from `apps/web`. During Tasks 2–8 the files are not in `MIGRATED` yet, so the output shows warnings, and **0 problems is the target for every file you touch**.
- **Typecheck:** `bun run typecheck:web`, run from the repo root.
- **Editing:**
  - Serena is bound to the main checkout, so edit with Edit/Write and confirm with `git status`.
  - The edit hook runs Biome on each file. If it reports formatting or CRLF, run `bunx biome format --write <files>`.
- **Never kill processes by name**, only by PID.
- **No browser tools and no Docker in Tasks 1–9.** The controller does snapshots and the visual check in Task 10.

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`, `docs/design/principles.md`):
- Primitives get layout and sizing classes only at call sites: `min-w-70`, `flex-1`, `w-full`, `sticky`-free, no colour or padding overrides. A new look is a variant in `shared/components/ui`.
- No arbitrary `[...]` values. Tailwind v4's numeric scale replaces them:
  - `min-w-[420px]` → `min-w-105`, `min-w-[280px]` → `min-w-70`, `min-w-[1100px]` → `min-w-275`, `min-w-[760px]` → `min-w-190`;
  - `z-[60]` → `z-60`, `z-[5]` → `z-5`;
  - `max-h-[280px]` → `max-h-70`;
  - `leading-[1.65]` → `leading-relaxed`.
- No palette colours, no `dark:`, no `shadow-[…]`, no `bg-black/…` or `bg-white…`, no `border-2`.
- `style` may only set custom properties (`--screening-cols`). A prop named `style` that isn't CSS also trips `no-inline-styles`, so rename it.
- A raw `<button>` gets no border. A raw `div`/`span`/`p` may carry any token classes.
- Hairlines (`border-border/50`, `border-hairline`) are fine where content meets content.
- Controls are sans (Button, Badge, Table headers); content (titles, abstracts, extraction text) inherits the serif body face.

---

## Contracts that must keep working

| What | Used by | Detail |
|---|---|---|
| `TableColumn` type | `LiteratureTableView`, `LiteratureTablePaperCell`, `utils/literatureTablePaper.ts`, `constants/literatureTableColumnCatalog.ts` | stays exported from `components/ColumnManager.tsx`, unchanged |
| `LiteratureTable`, `LiteratureTableViewProps` | `LiteratureStudioView` | unchanged |
| `LiteratureReportViewProps` | `LiteratureStudioView` | unchanged |
| `PrismaFlowDiagram`, `hasPrismaCounts`, `PrismaFlowCounts` | `LiteratureReportView`, `PrismaFlowDiagram.test.tsx` | unchanged; each box's label and value stay **sibling elements** (the test reads `.nextSibling`) and keep their texts ("PRISMA flow", "No database search", "Records identified", "From your notebook", "Included from search", "Studies included") |
| Paper cell | `LiteratureTablePaperCell.test.tsx` | button "Add to notebook"; text "Your paper"; title is not inside an `<a>` when the citation has no url; "Off-topic?" badge has an accessible description and a tooltip |
| Panel props | `features/notebooks/components/views/NotebookView.tsx` | `LiteraturePapersPanel`, `LiteratureScreeningPanel` and `LiteratureStudioView` props unchanged |
| Accessible names | e2e (none target these panels today), screen readers | "Back to Studio", "Close table", "Full screen table" / "Exit full screen", "Save table to Studio" / "Saving table", "Close column manager", "Close papers panel", "Close screening panel", "Copy with citations" / "Copied report", "Export report", "Save and edit document" / "Saving document", "Copy all citations", "Select all papers", `Select ${title}`, `Toggle ${column name}`, "View PDF", "Open paper" |
| Shell marker | none, but keep it | `data-literature-table-shell` on the table shell |

## File map

| File | Change |
|---|---|
| `apps/web/src/shared/components/ui/table.tsx` | **new**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| `apps/web/src/shared/components/ui/switch.tsx` | **new**: `Switch` |
| `apps/web/src/shared/components/ui/ui.smoke.test.tsx` | add Table and Switch smoke tests |
| `apps/web/src/dev/DesignGallery.tsx`, `DesignGallery.test.tsx`, `apps/web/e2e/design/gallery.spec.ts` | new "Tables" section; a Switch row in "Toggles" |
| `features/studio/utils/literatureTablePaper.ts` (+ test) | `getStudyTypePillStyle` → `studyTypeIcon(label)`; the pill class constants go |
| `features/studio/components/LiteratureTablePaperCell.tsx` (+ test) | tokens, `Checkbox`, `Badge`, `Button` |
| `features/studio/components/LiteratureTableExtractionCell.tsx` | `text-sm leading-relaxed` |
| `features/studio/components/views/LiteratureTableView.tsx` (+ new test) | `Table`, `Button`, `DropdownMenu`, `Checkbox`, `Empty`, `Spinner` |
| `features/studio/components/ColumnManager.tsx` (+ new test) | `Switch`, `Field`, `Input`, `Textarea`, `Button` |
| `features/studio/components/views/LiteratureReportView.tsx` (+ new test) | `DropdownMenu`, `Button`, `.prose`, `Empty`, `Skeleton`; `ReferencesSection` prop `style` → `citationStyle` |
| `features/studio/components/PrismaFlowDiagram.tsx` | token variants |
| `features/studio/components/LiteraturePapersPanel.tsx` (+ new test) | `DropdownMenu`, `Checkbox`, `Button`, `Empty`, `Spinner`, tokens |
| `features/studio/components/LiteratureScreeningPanel.tsx` (+ new test) | `--screening-cols`, `text-xs`, `Badge`, `Button`, `Empty`, `Spinner` |
| `features/studio/components/LiteratureStudioView.tsx` | `Spinner`, hairline instead of `border-l-2` |
| `apps/web/src/shared/ui/DropdownMenu.tsx`, `DropdownMenu.test.tsx`, `anchoredPosition.ts`, `anchoredPosition.test.ts` | **deleted** |
| `apps/web/eslint.config.mjs` | `MIGRATED` gets `src/features/studio/**/*.tsx` in place of the 30 Studio globs; the legacy-menu override goes |
| `apps/web/design-lint-baseline.json` | `features/studio` entry gone (0) |

---

### Task 1: `Table` and `Switch` primitives, with gallery entries

**Files:**
- Create: `apps/web/src/shared/components/ui/table.tsx`, `apps/web/src/shared/components/ui/switch.tsx`
- Modify: `apps/web/src/shared/components/ui/ui.smoke.test.tsx`, `apps/web/src/dev/DesignGallery.tsx`, `apps/web/src/dev/DesignGallery.test.tsx`, `apps/web/e2e/design/gallery.spec.ts`

- [ ] **Step 1: Add both with the CLI** from `apps/web`:

```bash
bunx --bun shadcn@latest add table switch
```

Then apply the usual fix-ups:
- `import { cn } from "cn"` (or `@/lib/utils`) → `import { cn } from "@/shared/utils/cn"`;
- revert any change the CLI made to `apps/web/package.json` or `components.json`: `git diff apps/web/package.json apps/web/components.json` must be empty;
- never edit `bun.lock`.

Check that `radix-ui` (already a dependency) supplies `Switch`; the CLI imports `{ Switch as SwitchPrimitive } from "radix-ui"`.

- [ ] **Step 2: Make `table.tsx` exactly this** (the house look; it replaces the CLI markup):

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Data table on the soft layered look. Borders sit on cells, not rows (`border-separate`), so a
 * `sticky` header and `pinned` first column keep their hairlines while scrolling. The wrapper is
 * the scroll container: give it a bounded height (`containerClassName="min-h-0 flex-1"`) for the
 * sticky header to stick.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)}
        {...props}
      />
    </div>
  );
}

const tableHeaderVariants = cva("", {
  variants: {
    sticky: { true: "sticky top-0 z-20", false: "" },
  },
  defaultVariants: { sticky: false },
});

function TableHeader({
  className,
  sticky,
  ...props
}: React.ComponentProps<"thead"> & VariantProps<typeof tableHeaderVariants>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(tableHeaderVariants({ sticky }), className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("transition-colors data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

const tableCellVariants = cva("border-r border-b border-hairline last:border-r-0", {
  variants: {
    /** Frozen first column: opaque, so scrolled cells pass under it. */
    pinned: {
      true: "sticky left-0 z-10 bg-card in-data-[state=selected]:bg-muted",
      false: "",
    },
  },
  defaultVariants: { pinned: false },
});

function TableHead({
  className,
  pinned,
  ...props
}: React.ComponentProps<"th"> & VariantProps<typeof tableCellVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        tableCellVariants({ pinned }),
        "h-12 bg-muted px-5 text-left align-middle font-sans text-xs font-semibold whitespace-nowrap text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  pinned,
  ...props
}: React.ComponentProps<"td"> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ pinned }), "px-5 py-4 align-top", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 font-sans text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
```

Notes:
- **Head cells:** a pinned head cell inside a sticky header gets `bg-muted` from `TableHead`. `tailwind-merge` keeps the later `bg-muted` over the variant's `bg-card`, so put the base classes **after** the variant, as written above.
- **No `TableFooter`:** nothing uses it, and Knip fails on unused exports.

- [ ] **Step 3: Make `switch.tsx` exactly this:**

```tsx
import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full shadow-xs transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-4.5 data-[state=checked]:bg-primary-foreground",
          "data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-surface-raised"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
```

- [ ] **Step 4: Smoke tests.** Read `ui.smoke.test.tsx` for its pattern, then add tests in the same style:

```tsx
describe("Table", () => {
  it("renders a pinned, sticky-header table inside its scroll container", () => {
    render(
      <Table containerClassName="h-40" aria-label="Papers">
        <TableHeader sticky>
          <TableRow>
            <TableHead pinned>Paper</TableHead>
            <TableHead>Method</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-state="selected">
            <TableCell pinned>Attention</TableCell>
            <TableCell>Survey</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    const table = screen.getByRole("table", { name: "Papers" });
    expect(table.parentElement).toHaveAttribute("data-slot", "table-container");
    expect(table.parentElement).toHaveClass("overflow-auto", "h-40");
    expect(screen.getByRole("columnheader", { name: "Paper" })).toHaveClass("sticky", "left-0", "bg-muted");
    expect(screen.getByRole("cell", { name: "Attention" })).toHaveClass("sticky", "bg-card");
    expect(table.querySelector("thead")).toHaveClass("sticky", "top-0");
  });
});

describe("Switch", () => {
  it("is a switch that toggles", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Show year" onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "Show year" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
```

Add imports for `Table…` and `Switch` (and `userEvent`/`vi` if the file doesn't import them yet).

Run: `bun run test src/shared/components/ui/ui.smoke.test.tsx`. Expected: PASS.

- [ ] **Step 5: Gallery.** In `apps/web/src/dev/DesignGallery.tsx`:
  - **Toggles:** at the end of `TogglesSection`, add a row with a checked and an unchecked switch, each with a `Label`:

```tsx
<div className="flex flex-wrap items-center gap-6">
  <div className="flex items-center gap-2">
    <Switch id="gallery-switch-on" defaultChecked />
    <Label htmlFor="gallery-switch-on">Year</Label>
  </div>
  <div className="flex items-center gap-2">
    <Switch id="gallery-switch-off" />
    <Label htmlFor="gallery-switch-off">Sample size</Label>
  </div>
</div>
```

  - **Tables:** add a `TablesSection` after `TogglesSection` and render it last in the default export:

```tsx
function TablesSection() {
  const rows = [
    { paper: "Attention Is All You Need", method: "Transformer architecture, trained on WMT 2014", selected: false },
    { paper: "BERT: Pre-training of Deep Bidirectional Transformers", method: "Masked language modelling", selected: true },
  ];
  return (
    <Section name="Tables">
      <Table containerClassName="max-h-64 rounded-xl" aria-label="Papers">
        <TableHeader sticky>
          <TableRow>
            <TableHead pinned className="min-w-60">Papers (2)</TableHead>
            <TableHead className="min-w-60">Method</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.paper} data-state={row.selected ? "selected" : undefined}>
              <TableCell pinned className="min-w-60">{row.paper}</TableCell>
              <TableCell className="min-w-60">{row.method}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}
```

  If `rounded-xl` on the container trips `no-restyle` (`containerClassName` may not be checked), drop it. Run `bunx eslint --max-warnings 0 src/dev/DesignGallery.tsx`.
  - Add `"Tables"` to the section-name list in `src/dev/DesignGallery.test.tsx` and to `SECTIONS` in `e2e/design/gallery.spec.ts`, in the same position as the render order.
  - **Snapshots:** don't refresh them. The controller refreshes `toggles-*` and adds `tables-*` in Task 10, with Docker.

- [ ] **Step 6: Verify.** Run `bun run test src/dev/DesignGallery.test.tsx src/shared/components/ui/ui.smoke.test.tsx` and `bunx eslint --max-warnings 0 src/shared/components/ui/table.tsx src/shared/components/ui/switch.tsx src/dev/DesignGallery.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 7: Commit.**

```bash
git add apps/web/src/shared/components/ui/table.tsx apps/web/src/shared/components/ui/switch.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx apps/web/src/dev apps/web/e2e/design/gallery.spec.ts
git commit -m "feat(ui): Table and Switch primitives on the soft layered look"
```

---

### Task 2: Paper and extraction cells

**Files:**
- Modify: `features/studio/utils/literatureTablePaper.ts`, `features/studio/utils/literatureTablePaper.test.ts`, `features/studio/components/LiteratureTablePaperCell.tsx`, `features/studio/components/LiteratureTablePaperCell.test.tsx`, `features/studio/components/LiteratureTableExtractionCell.tsx`

(All paths below are under `apps/web/src/`.)

- [ ] **Step 1: Failing util test.** In `literatureTablePaper.test.ts`, replace the `describe("getStudyTypePillStyle", …)` block with:

```ts
describe("studyTypeIcon", () => {
  it("maps review types to distinct icons", () => {
    expect(studyTypeIcon("Literature Review")).toBe("literature");
    expect(studyTypeIcon("Systematic Review")).toBe("systematic");
    expect(studyTypeIcon("Randomized controlled trial")).toBe("trial");
    expect(studyTypeIcon("Cohort study")).toBe("observational");
    expect(studyTypeIcon("Empirical study")).toBe("empirical");
    expect(studyTypeIcon("Position paper")).toBe("default");
  });
});
```

Update the import (`getStudyTypePillStyle` → `studyTypeIcon`). Run `bun run test src/features/studio/utils/literatureTablePaper.test.ts`. Expected: FAIL (`studyTypeIcon` is not exported).

- [ ] **Step 2: Implement.** In `literatureTablePaper.ts`, delete `STUDY_TYPE_PILL_CLASS`, `STUDY_TYPE_PILL_ICON_CLASS`, `StudyTypePillStyle` and `getStudyTypePillStyle`, and add:

```ts
/** The icon for a study-type badge; the badge's look comes from `Badge`. */
export function studyTypeIcon(label: string): StudyTypePillIcon {
  return STUDY_TYPE_ICON_MATCHERS.find((entry) => entry.match.test(label))?.kind ?? "default";
}
```

Run the test. Expected: PASS.

- [ ] **Step 3: Rewrite `LiteratureTablePaperCell.tsx`.** Behaviour and props are unchanged. Make these changes:
  - **`StudyTypePillIcon`:** takes `{ kind }` only and renders the icon with no class (Badge sizes its `svg` to `size-3`): `<PieChart aria-hidden />`, and so on.
  - **`StudyTypeBadge`:**

```tsx
function StudyTypeBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="max-w-full">
      <StudyTypePillIcon kind={studyTypeIcon(label)} />
      <span className="truncate">{label}</span>
    </Badge>
  );
}
```

  - **Rank chip:** `<span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-muted font-sans text-xs font-medium text-muted-foreground">`.
  - **Checkbox:** `<Checkbox checked={isSelected} onCheckedChange={onToggleSelect} aria-label={`Select ${title}`} className="mt-1" />`. The prop takes `(checked) => void`, and calling `onToggleSelect` with no argument is fine.
  - **Title link:** `className="block text-sm font-semibold leading-snug text-foreground hover:text-primary hover:underline"`. The plain-text title variants use `text-sm font-semibold leading-snug`.
  - **Meta and author lines, and `includeReason`:** `text-sm leading-relaxed text-muted-foreground`.
  - **Cite and Add to notebook:** `Button variant="ghost" size="xs"`, with the icon as a child:

```tsx
<div className="flex flex-wrap items-center gap-1 pt-1">
  <Button variant="ghost" size="xs" onClick={onCite} disabled={!citation}>
    <Quote aria-hidden />
    Cite
  </Button>
  {!isNotebookPaper && (
    <Button
      variant="ghost"
      size="xs"
      onClick={onAddToNotebook}
      disabled={isInNotebook || isAdding || !citation}
    >
      {isAdding ? <Spinner /> : <CirclePlus aria-hidden />}
      {isInNotebook ? "In notebook" : "Add to notebook"}
    </Button>
  )}
</div>
```

  - **Open-access icon:** `<span className="text-studio-literature" title="Open access">`.
  - **PDF link:** `Button variant="ghost" size="icon-sm" asChild` around the `<a>`, keeping `title="View PDF"` and `aria-label="View PDF"`, with `<FileText className="text-destructive" />` inside. A colour on an icon inside a Button is a child's class, which is allowed.
  - **Unchanged:** "Excluded from review" stays `text-xs font-medium text-destructive`, and the "Your paper" and "Off-topic?" badges keep their markup.

- [ ] **Step 4: Extraction cell.** `<p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">`. The list stays as it is.

- [ ] **Step 5: Extend the cell test.** Add this to `LiteratureTablePaperCell.test.tsx`, using the file's existing render helper and fixture (read it first):

```tsx
it("selects the paper from its checkbox", async () => {
  const user = userEvent.setup();
  const onToggleSelect = vi.fn();
  renderCell({ onToggleSelect }); // the existing helper; adapt to its signature
  await user.click(screen.getByRole("checkbox", { name: /^Select / }));
  expect(onToggleSelect).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 6: Verify.** Run `bun run test src/features/studio/components/LiteratureTablePaperCell.test.tsx src/features/studio/utils/literatureTablePaper.test.ts`, then `bunx eslint --max-warnings 0 src/features/studio/components/LiteratureTablePaperCell.tsx src/features/studio/components/LiteratureTableExtractionCell.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 7: Commit.** Message: `refactor(studio): literature table cells on Checkbox, Badge and tokens`.

---

### Task 3: `LiteratureTableView` on `Table`

**Files:**
- Modify: `apps/web/src/features/studio/components/views/LiteratureTableView.tsx`
- Create: `apps/web/src/features/studio/components/views/LiteratureTableView.test.tsx`

- [ ] **Step 1: Failing test.** Create `LiteratureTableView.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableColumn } from "../ColumnManager";
import { LiteratureTableView } from "./LiteratureTableView";

vi.mock("@/features/sources/services/documentsApi", () => ({
  useGetExistingPapers: () => ({ dois: [], titleHashes: [] }),
  useBulkUpload: () => vi.fn(),
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const COLUMNS: TableColumn[] = [
  { id: "title", name: "Title", type: "paper_title", isVisible: true, isSystem: true, order: 0 },
  { id: "method", name: "Method", type: "custom", isVisible: true, isSystem: false, order: 1 },
];
const TABLE = {
  title: "Transformers review",
  columns: COLUMNS,
  papers: [
    { citationId: "c1", rowData: { title: "Attention", method: "Self-attention" }, isIncluded: true },
    { citationId: "c2", rowData: { title: "BERT", method: "Masked LM" }, isIncluded: true },
  ],
};

function renderTable(props: Partial<React.ComponentProps<typeof LiteratureTableView>> = {}) {
  const onExport = vi.fn();
  render(
    <LiteratureTableView
      table={TABLE}
      notebookId={"n1" as never}
      onBack={vi.fn()}
      onExport={onExport}
      {...props}
    />
  );
  return { onExport };
}

beforeEach(() => vi.clearAllMocks());

describe("LiteratureTableView", () => {
  it("renders the papers in a table with a column per data column", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Papers \(2\)/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Method" })).toBeInTheDocument();
    expect(within(table).getByText("Self-attention")).toBeInTheDocument();
  });

  it("exports CSV and Excel from the Export menu", async () => {
    const user = userEvent.setup();
    const { onExport } = renderTable();
    await user.click(screen.getByRole("button", { name: "Export table" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV (.csv)" }));
    expect(onExport).toHaveBeenCalledWith("csv");
    await user.click(screen.getByRole("button", { name: "Export table" }));
    await user.click(await screen.findByRole("menuitem", { name: "Excel (.xlsx)" }));
    expect(onExport).toHaveBeenCalledWith("excel");
  });

  it("select all checks every paper and shows the bulk bar", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("checkbox", { name: "Select all papers" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 to notebook" })).toBeInTheDocument();
  });

  it("full screen opens over the page and Escape leaves it", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Full screen table" }));
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Full screen table" })).toBeInTheDocument()
    );
  });

  it("shows an empty state with Add Papers when there are no papers", async () => {
    const user = userEvent.setup();
    const onAddPapers = vi.fn();
    renderTable({ table: { ...TABLE, papers: [] }, onAddPapers });
    expect(screen.getByText("No papers in this table yet")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Add Papers/ }).at(-1) as HTMLElement);
    expect(onAddPapers).toHaveBeenCalled();
  });
});
```

Run `bun run test src/features/studio/components/views/LiteratureTableView.test.tsx`. Expected: the Export test FAILS, because the legacy trigger has no accessible name "Export table" and its items aren't Radix menu items. Others may pass. Check each failure is about the menu or the trigger name, not the fixture (fix the fixture if `getPaperTitle` needs a different shape: read `utils/literatureTablePaper.ts`).

- [ ] **Step 2: Rewrite the view.** Keep all state, callbacks, export helpers and props. Change only the markup:
  - **Imports:** drop the local `cn` and use `import { cn } from "@/shared/utils/cn"`. Import `Button`, `Checkbox`, `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `Empty`/`EmptyContent`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`, `Spinner`, and `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow`. Delete the `TABLE_*` constants, `TABLE_TOOLBAR_BTN` and `ExportMenuItem`. Remove the `Loader2` import if it is no longer used.
  - **Mobile back bar:** `<div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 bg-background/80 px-2 backdrop-blur-sm md:hidden">` with `<Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio"><ArrowLeft /></Button>` and the title span (`truncate text-sm font-semibold`).
  - **Toolbar row:** keep `@container/table-toolbar flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-card px-4 min-w-0 overflow-hidden` (`border-border` becomes a hairline). Keep the title `h1`. Make each toolbar control `Button variant="ghost" size="sm-adaptive"` (or `size="icon-sm"` for icon-only ones), keeping its `title`, `aria-*` and the responsive `hidden @min-[640px]/table-toolbar:inline` label spans.

    Container query thresholds like `@min-[640px]` are arbitrary values. Replace them with named container sizes: `@min-[420px]` → `@sm` (24rem ≈ 384px), `@min-[640px]` → `@xl` (36rem = 576px), `@min-[720px]` → `@2xl` (42rem = 672px), `@min-[860px]` → `@3xl` (48rem = 768px), `@min-[980px]` → `@4xl` (56rem = 896px). So `hidden @xl/table-toolbar:inline`. The labels appear slightly earlier, which is fine.

    The controls:
    - **Add Papers:** `<Button variant="ghost" size="sm-adaptive" onClick={onAddPapers} title="Add papers"><Plus /><span className="hidden @xl/table-toolbar:inline">Add Papers</span></Button>`. When the label is hidden, the button needs a name, so add `aria-label="Add papers"`.
    - **Manage Columns:** same pattern, plus `aria-pressed={columnManagerOpen}` and `aria-label="Manage columns"`. `ghost` fills on `aria-expanded`, not `aria-pressed`, so the open state needs the `ButtonGroup`/tray idiom or a `secondary` variant: use `variant={columnManagerOpen ? "secondary" : "ghost"}`.
    - **Save:** `aria-label={isSaving ? "Saving table" : "Save table to Studio"}`, `{isSaving ? <Spinner /> : <Save />}`.
    - **Export:**

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button
      variant="ghost"
      size="sm-adaptive"
      disabled={exportDisabled}
      title="Export table"
      aria-label="Export table"
    >
      <Download />
      <span className="hidden @4xl/table-toolbar:inline">Export</span>
      <ChevronDown className="hidden text-muted-foreground @4xl/table-toolbar:inline" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={handleExportCSV}>
      <Sheet />
      CSV (.csv)
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={handleExportExcel}>
      <Table2 />
      Excel (.xlsx)
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

    - **Full screen and Close:** `Button variant="ghost" size="icon-sm"` with the existing `aria-label`/`title`.
  - **Bulk bar:** `<div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-4 py-2">`. Use `<Button variant="ghost" size="xs" onClick={() => setSelectedIds(new Set())}><X />{selectedIds.size} selected</Button>`, then `<Button variant="secondary" size="xs" disabled={isBulkAdding} onClick={…}>`, with `{isBulkAdding ? <><Spinner />Adding…</> : `Add ${selectedIds.size} to notebook`}`.
  - **Empty state:**

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FileText /></EmptyMedia>
    <EmptyTitle>No papers in this table yet</EmptyTitle>
  </EmptyHeader>
  <EmptyContent>
    <Button onClick={onAddPapers}>Add Papers</Button>
  </EmptyContent>
</Empty>
```

  - **Table:**

```tsx
<Table containerClassName="min-h-0 flex-1 bg-background" className="min-w-275">
  <TableHeader sticky>
    <TableRow>
      <TableHead pinned className="min-w-105">
        <div className="flex items-center gap-3 pl-9">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            aria-label="Select all papers"
          />
          <span>Papers ({paperCount})</span>
        </div>
      </TableHead>
      {dataColumns.map((col) => (
        <TableHead key={col.id} className="min-w-70">
          {col.name}
        </TableHead>
      ))}
    </TableRow>
  </TableHeader>
  <TableBody>
    {/* same visibleRank loop as today */}
    <TableRow
      key={paper.citationId}
      data-state={selectedIds.has(paper.citationId) ? "selected" : undefined}
    >
      <TableCell pinned className="min-w-105">
        <LiteratureTablePaperCell … />
      </TableCell>
      {dataColumns.map((col) => (
        <TableCell key={col.id} className="min-w-70">
          <LiteratureTableExtractionCell value={paper.rowData[col.id] ?? ""} />
        </TableCell>
      ))}
    </TableRow>
  </TableBody>
</Table>
```

    The extra `pl-9` on the header lines its checkbox up with the row checkboxes, which sit after the rank chip. Keep it, and adjust in Task 10 if the visual check shows a misalignment. `bg-background` on `containerClassName` is a colour on a wrapper prop: if ESLint flags it, move the `bg-background` to the parent `div`.
  - **Full-screen shell:** `isFocusMode ? "fixed inset-x-0 top-14 bottom-0 z-60 flex flex-col bg-background" : "h-full animate-in fade-in slide-in-from-right-4 duration-300 ease-out"`, with the `flex min-w-0 flex-col bg-background` base. Keep `createPortal`, the Escape handler and `data-literature-table-shell`.

- [ ] **Step 3: Verify.** Run `bun run test src/features/studio/components/views/LiteratureTableView.test.tsx`, then `bunx eslint --max-warnings 0 src/features/studio/components/views/LiteratureTableView.tsx`, then `bun run typecheck:web` (from the root). Expected: PASS, no ESLint output, and a clean typecheck.

- [ ] **Step 4: Commit.** Message: `refactor(studio): literature table on the Table primitive and shadcn menu`.

---

### Task 4: `ColumnManager` on `Switch` and `Field`

**Files:**
- Modify: `apps/web/src/features/studio/components/ColumnManager.tsx`
- Create: `apps/web/src/features/studio/components/ColumnManager.test.tsx`

- [ ] **Step 1: Failing test.** Create `ColumnManager.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColumnManager, type TableColumn } from "./ColumnManager";

const COLUMNS: TableColumn[] = [
  { id: "title", name: "Title", type: "paper_title", isVisible: true, isSystem: true, order: 0 },
  { id: "method", name: "Method", type: "custom", isVisible: true, isSystem: false, order: 1 },
];

describe("ColumnManager", () => {
  it("toggles a column with its switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Toggle Method" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith([
      COLUMNS[0],
      { ...COLUMNS[1], isVisible: false },
    ]);
  });

  it("adds a custom column from the labelled form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    await user.type(screen.getByLabelText("Column name"), "Sample size");
    await user.type(screen.getByLabelText(/Instructions/), "Number of participants");
    await user.click(screen.getByRole("button", { name: "Add column" }));
    const added = onChange.mock.calls[0][0].at(-1);
    expect(added).toMatchObject({
      name: "Sample size",
      instructions: "Number of participants",
      type: "custom",
      isVisible: true,
      order: 2,
    });
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close column manager" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

Run it. Expected: the second test FAILS, because the inputs have only placeholders and no labels. The first may already pass, since the hand-rolled switch has `role="switch"`.

- [ ] **Step 2: Rewrite the markup.** Logic stays the same.
  - Delete `ColumnToggle` and the local `cn`. Use `cn` from `@/shared/utils/cn`, plus `Switch`, `Button`, `Field`, `FieldGroup`, `FieldLabel`, `Input` and `Textarea`.
  - **Panel:** `<aside aria-label="Manage columns" className="flex h-full w-88 max-w-full shrink-0 flex-col border-l border-border/50 bg-card shadow-lg">`. That is 22rem = 88; it replaces `w-[min(100%,22rem)]`, and `shadow-lg` replaces the hand-rolled shadow.
  - **Header:** `flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-5`. The heading stays `h3 text-sm font-semibold font-sans`. Close is `<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close column manager"><X /></Button>`.
  - **Custom column form**, inside `<div className="rounded-xl bg-muted/40 p-4">`:

```tsx
<FieldGroup>
  <Field>
    <FieldLabel htmlFor={nameId}>Column name</FieldLabel>
    <Input
      id={nameId}
      value={customName}
      onChange={(e) => setCustomName(e.target.value)}
      placeholder="e.g. Sample size"
    />
  </Field>
  <Field>
    <FieldLabel htmlFor={instructionsId}>Instructions for extraction (optional)</FieldLabel>
    <Textarea
      id={instructionsId}
      rows={3}
      className="resize-none"
      value={customInstructions}
      onChange={(e) => setCustomInstructions(e.target.value)}
    />
  </Field>
</FieldGroup>
<div className="mt-3 flex gap-2">
  <Button size="sm" className="flex-1" onClick={addCustomColumn}>Add column</Button>
  <Button size="sm" variant="ghost" onClick={cancelCustomForm}>Cancel</Button>
</div>
```

    `nameId` and `instructionsId` come from `useId()`. `cancelCustomForm` is the existing inline reset, extracted into a function.
  - **"Add Column" opener:** `<Button variant="outline" className="w-full" onClick={() => setShowCustomForm(true)}><Plus />Add Column</Button>`. The dashed border box goes.
  - **Column row:** keep the drag handlers and `draggable`. Use `flex items-center gap-3 rounded-lg px-1 py-2.5` and the `opacity-50`/`cursor-grab` classes through `cn`. `<Switch checked={options.checked} onCheckedChange={options.onToggle} aria-label={`Toggle ${col.name}`} />`. `onCheckedChange` passes a boolean, and `options.onToggle` ignores arguments, so wrap it: `onCheckedChange={() => options.onToggle()}`.
  - **Section headings:** `font-sans text-sm font-semibold`.
  - **Default list:** `max-h-70 space-y-0.5 overflow-y-auto pr-1`.

- [ ] **Step 3: Verify.** Run `bun run test src/features/studio/components/ColumnManager.test.tsx` and `bunx eslint --max-warnings 0 src/features/studio/components/ColumnManager.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 4: Commit.** Message: `refactor(studio): column manager on Switch, Field and Button`.

---

### Task 5: `LiteratureReportView` and `PrismaFlowDiagram`

**Files:**
- Modify: `apps/web/src/features/studio/components/views/LiteratureReportView.tsx`, `apps/web/src/features/studio/components/PrismaFlowDiagram.tsx`
- Create: `apps/web/src/features/studio/components/views/LiteratureReportView.test.tsx`

- [ ] **Step 1: Failing test.** Create `LiteratureReportView.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LiteratureReportView } from "./LiteratureReportView";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const REPORT = {
  title: "Transformers in NLP",
  content: "",
  citationStyle: "apa7" as const,
  sections: [
    { heading: "Introduction", content: "Transformers changed NLP." },
    { heading: "Methods", content: "We searched three databases." },
  ],
  citationIds: [],
};
const CITATIONS = {
  c1: { title: "Attention Is All You Need", authors: ["Ashish Vaswani"], year: 2017, url: "https://arxiv.org/abs/1706.03762" },
};

describe("LiteratureReportView", () => {
  it("renders sections, the PRISMA flow under Methods and the references", async () => {
    render(
      <LiteratureReportView
        report={REPORT}
        citations={CITATIONS}
        workflowProvenance={{ recordsIdentified: 40, recordsScreened: 20, recordsIncluded: 8 }}
      />
    );
    expect(screen.getByRole("heading", { name: "Transformers in NLP", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("Transformers changed NLP.")).toBeInTheDocument();
    expect(screen.getByText("PRISMA flow")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "References" })).toBeInTheDocument();
    expect(screen.getByText(/Ashish Vaswani \(2017\)/)).toBeInTheDocument();
  });

  it("exports Markdown from the Export menu", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<LiteratureReportView report={REPORT} onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: "Export report" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export Markdown (.md)" }));
    expect(onExport).toHaveBeenCalled();
  });

  it("Save and edit shows its saving state until the save resolves", async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onSaveAndEdit = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<LiteratureReportView report={REPORT} onSaveAndEdit={onSaveAndEdit} />);
    await user.click(screen.getByRole("button", { name: "Save and edit document" }));
    expect(screen.getByRole("button", { name: "Saving document" })).toBeDisabled();
    resolve();
    expect(await screen.findByRole("button", { name: "Save and edit document" })).toBeEnabled();
  });
});
```

Run it. Expected: the Export test FAILS on the legacy menu. Check the other failures are not fixture problems.

- [ ] **Step 2: Rewrite the report view markup.** Logic stays the same.
  - **Imports and constants:** use `cn` from `@/shared/utils/cn` (and `sanitizeMarkdown` from `@/shared/utils`). Import `Button`, the `DropdownMenu*` parts, `Empty*`, `Skeleton` and `Spinner`. Delete `REPORT_TOOLBAR_BTN` and `ExportMenuItem`.
  - **Mobile back bar:** same as Task 3.
  - **Toolbar:** keep the `@container/report-toolbar …` row with `border-border/50`. Thresholds: `@min-[420px]` → `@sm`, `@min-[520px]` → `@lg` (32rem = 512px), `@min-[700px]` → `@2xl`, `@min-[720px]` → `@2xl`. Controls are `Button variant="ghost" size="sm-adaptive"` or `icon-sm`, with the existing labels and `aria-label`s.

    Export menu items: `<DropdownMenuItem onSelect={handleExportPdf}><Printer />Export PDF</DropdownMenuItem>` and `<DropdownMenuItem onSelect={handleExportMarkdown}><FileDown />Export Markdown (.md)</DropdownMenuItem>`, with `align="end"`.
  - **Section:** `<h2 className="mb-3 border-b border-border/50 pb-2 font-display text-xl font-semibold">`.
  - **Body:** `<div className="prose max-w-none font-serif">` (drop `prose-stone`, `dark:prose-invert`, `leading-relaxed` and `text-foreground`; the house `.prose` sets them). The same goes for the `report.content` fallback.
  - **Suspense fallback:** `<Skeleton className="h-4 w-full" />`.
  - **No-content state:** `Empty` with `EmptyMedia variant="icon"` `<FileText />` and `EmptyTitle` "No content available".
  - **References:**
    - Rename the `ReferencesSection` prop `style` → `citationStyle` (with the props interface and call site). This clears `no-inline-styles`.
    - `<section className="mt-12 border-t border-border/50 pt-8">` (the `border-t-2` goes). The heading is `font-display text-xl font-semibold`.
    - Copy: `<Button variant="outline" size="icon-sm" onClick={handleCopyReferences} title=… aria-label=…>`.
    - `CitationStylePicker className="w-35 @2xl/report-toolbar:w-42"`. That query targets a container that isn't an ancestor here, so it never applied: use `className="w-42"`.
  - **Title:** `<h1 className="mb-8 text-center font-display text-3xl font-bold">`.

- [ ] **Step 3: PRISMA tokens.** In `PrismaFlowDiagram.tsx`, rename the variants to their meaning and use tokens:
  - **Variants:**

```tsx
type FlowVariant = "source" | "screen" | "excluded" | "included";

const FLOW_BOX_CLASS: Record<FlowVariant, string> = {
  source: "bg-info-muted ring-1 ring-info-border",
  screen: "bg-muted ring-1 ring-hairline",
  excluded: "bg-destructive-muted ring-1 ring-destructive-border",
  included: "bg-success-muted ring-1 ring-success-border",
};
```

    Check those tokens exist in `index.css` before using them: `--destructive-muted`, `--destructive-border`, `--info-border` and `--success-border`. If `destructive-border` doesn't exist, use `ring-destructive/30`.
  - **Mapping:** blue → `source`, purple → `screen`, red → `excluded`, green → `included`.
  - **`FlowBox`:**

```tsx
<div
  className={cn(
    "rounded-lg px-4 text-center",
    compact ? "min-w-16 py-1.5" : "min-w-40 py-2",
    FLOW_BOX_CLASS[variant]
  )}
>
  {label ? <div className="font-sans text-xs text-muted-foreground">{label}</div> : null}
  <div className="font-sans text-base font-semibold tabular-nums">…</div>
</div>
```

    The label `div` and value `div` stay siblings.
  - **Outer wrappers:** `cn("rounded-xl bg-muted/40 p-4 text-sm", className)` (the hairline `border` goes; fill separates it). Headings use `font-sans`.

- [ ] **Step 4: Verify.** Run `bun run test src/features/studio/components/views/LiteratureReportView.test.tsx src/features/studio/components/PrismaFlowDiagram.test.tsx`, then `bunx eslint --max-warnings 0 src/features/studio/components/views/LiteratureReportView.tsx src/features/studio/components/PrismaFlowDiagram.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 5: Commit.** Message: `refactor(studio): literature report and PRISMA flow on the design system`.

---

### Task 6: `LiteraturePapersPanel`

**Files:**
- Modify: `apps/web/src/features/studio/components/LiteraturePapersPanel.tsx`
- Create: `apps/web/src/features/studio/components/LiteraturePapersPanel.test.tsx`

- [ ] **Step 1: Failing test.** Create `LiteraturePapersPanel.test.tsx`, reading `types/rankedPaper.ts` for the `RankedPaper` shape and filling the fixture's required fields:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiteraturePapersPanel } from "./LiteraturePapersPanel";

const api = vi.hoisted(() => ({
  data: undefined as unknown,
  exportBibtex: vi.fn(),
}));

vi.mock("../services/literatureTablesApi", () => ({
  useRankedPapersForSession: () => api.data,
}));
vi.mock("../../sources/services/documentsApi", () => ({
  useGetExistingPapers: () => ({ dois: [], titleHashes: [] }),
  useBulkUpload: () => vi.fn(),
}));
vi.mock("../utils/paperExport", () => ({
  exportPapersToBibtex: api.exportBibtex,
  exportPapersToCsv: vi.fn(),
  exportPapersToExcel: vi.fn(),
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const PAPER = {
  title: "Attention Is All You Need",
  abstract: "We propose the Transformer.",
  authors: ["Ashish Vaswani"],
  year: 2017,
  url: "https://arxiv.org/abs/1706.03762",
  source: "arxiv",
  score: 0.92,
};

function renderPanel() {
  render(
    <LiteraturePapersPanel sessionId={"s1" as never} notebookId={"n1" as never} onClose={vi.fn()} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.data = { query: "transformers", papers: [PAPER] };
});

describe("LiteraturePapersPanel", () => {
  it("shows a loading state, then the ranked papers", () => {
    api.data = undefined;
    const { rerender } = render(
      <LiteraturePapersPanel sessionId={"s1" as never} notebookId={"n1" as never} onClose={vi.fn()} />
    );
    expect(screen.getByText("Loading ranked papers…")).toBeInTheDocument();
    api.data = { query: "transformers", papers: [PAPER] };
    rerender(
      <LiteraturePapersPanel sessionId={"s1" as never} notebookId={"n1" as never} onClose={vi.fn()} />
    );
    expect(screen.getByRole("link", { name: PAPER.title })).toBeInTheDocument();
    expect(screen.getByText("Score 0.92")).toBeInTheDocument();
  });

  it("exports BibTeX from the Export menu", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Export papers" }));
    await user.click(await screen.findByRole("menuitem", { name: "BibTeX (.bib)" }));
    expect(api.exportBibtex).toHaveBeenCalledWith([PAPER], "transformers.bib");
  });

  it("selecting a paper shows the bulk bar", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("checkbox", { name: `Select ${PAPER.title}` }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  it("shows the empty state when ranking found nothing", () => {
    api.data = { query: "x", papers: [] };
    renderPanel();
    expect(screen.getByText("No ranked papers yet")).toBeInTheDocument();
  });
});
```

Run it. Expected: the Export test FAILS (the legacy trigger has no name "Export papers").

- [ ] **Step 2: Rewrite the markup.** Logic stays the same.
  - **Shell:** `relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border/50 bg-sidebar`.
  - **Header:** `flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-background px-4`. The heading is `font-sans`.
    - Export: `DropdownMenu` with `<Button variant="ghost" size="sm" disabled={exportDisabled} title="Export papers" aria-label="Export papers"><Download />Export</Button>`, and three `DropdownMenuItem`s with `onSelect` (`<FileCode2 />BibTeX (.bib)`, `<Sheet />CSV (.csv)`, `<Table2 />Excel (.xlsx)`). The name "Export papers" contains the visible text "Export", so label-in-name holds.
    - Close: `Button variant="ghost" size="icon-sm"`.
  - **Bulk bar:** same as Task 3.
  - **Loading:** `<div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground"><Spinner className="size-8" /><p className="text-sm">Loading ranked papers…</p></div>`. `size-8` on `Spinner` is sizing, which is allowed.
  - **Empty:** `Empty` with `EmptyMedia variant="icon"` `<BookOpen />`, `EmptyTitle` "No ranked papers yet" and `EmptyDescription` (the existing sentence).
  - **`RankedPaperCard`:**
    - `<article className="px-4 py-4 transition-colors hover:bg-muted/30">`.
    - The rank chip keeps its token classes, with `font-sans`.
    - `Checkbox` with `onCheckedChange={onToggleSelect}`.
    - Title link: `line-clamp-3 text-sm font-semibold leading-snug hover:text-primary hover:underline`.
    - Meta: `font-sans text-xs text-muted-foreground`.
    - Abstract box: `mt-3 flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground`, with `<Sparkles className="mt-0.5 size-4 shrink-0 text-studio-literature" />`.
    - `PaperAction`: `Button variant="ghost" size="xs"`, with `asChild` for the `<a>` case. Keep `title`, `target` and `rel`. Delete `PAPER_ACTION_CLASS` and `PAPERS_PANEL_HEADER_BTN`.
    - Open-paper link: `<Button variant="ghost" size="icon-sm" asChild className="ml-auto"><a … aria-label="Open paper"><ExternalLink className="text-studio-literature" /></a></Button>`.

- [ ] **Step 3: Verify.** Run `bun run test src/features/studio/components/LiteraturePapersPanel.test.tsx` and `bunx eslint --max-warnings 0 src/features/studio/components/LiteraturePapersPanel.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 4: Commit.** Message: `refactor(studio): ranked papers panel on the design system`.

---

### Task 7: `LiteratureScreeningPanel`

**Files:**
- Modify: `apps/web/src/features/studio/components/LiteratureScreeningPanel.tsx`
- Create: `apps/web/src/features/studio/components/LiteratureScreeningPanel.test.tsx`

- [ ] **Step 1: Failing test.** Create `LiteratureScreeningPanel.test.tsx`. Read `types/literatureScreening.ts` for `LiteratureScreeningDecision` and fill the fixture's required fields:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiteratureScreeningPanel } from "./LiteratureScreeningPanel";

const api = vi.hoisted(() => ({ decisions: undefined as unknown }));

vi.mock("../services/literatureTablesApi", () => ({
  useLiteratureReviewSession: () => ({ query: "transformers", reviewTitle: "Transformers" }),
  useLiteratureReviewScreeningDecisions: () => api.decisions,
}));

const INCLUDED = {
  paperIndex: 0,
  rank: 1,
  title: "Attention Is All You Need",
  authors: ["Ashish Vaswani"],
  year: 2017,
  decision: "included",
  reason: "Directly addresses transformer evaluation with empirical analysis.",
};
const EXCLUDED = { ...INCLUDED, paperIndex: 1, rank: 2, title: "Cooking with LSTMs", decision: "excluded", reason: "Different topic." };

beforeEach(() => {
  api.decisions = [EXCLUDED, INCLUDED];
});

function renderPanel() {
  render(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
}

describe("LiteratureScreeningPanel", () => {
  it("lists decisions by rank with their outcome", () => {
    renderPanel();
    const titles = screen.getAllByText(/Attention Is All You Need|Cooking with LSTMs/);
    expect(titles.map((t) => t.textContent)).toEqual(["Attention Is All You Need", "Cooking with LSTMs"]);
    expect(screen.getByText("Papers (2)")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.getByText("Excluded")).toBeInTheDocument();
  });

  it("expands a row's screening criteria", async () => {
    const user = userEvent.setup();
    renderPanel();
    const [toggle] = screen.getAllByRole("button", { name: "View screening criteria" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide screening criteria" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows loading and empty states", () => {
    api.decisions = undefined;
    const { rerender } = render(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
    expect(screen.getByText("Loading screening decisions…")).toBeInTheDocument();
    api.decisions = [];
    rerender(<LiteratureScreeningPanel sessionId={"s1" as never} onClose={vi.fn()} />);
    expect(screen.getByText("No screening decisions yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });
});
```

This file pins today's behaviour. Run it and expect it to PASS before the rewrite, which is the safety net. If a test fails, fix the fixture, not the component.

- [ ] **Step 2: Rewrite the markup.** Logic (criteria inference, export) stays the same.
  - **Imports:** `cn` from `@/shared/utils/cn` (delete the local copy), plus `Badge`, `Button`, `Empty*` and `Spinner`.
  - **Shell:** `border-l border-border/50` in place of `border-l-2 border-border`.
  - **Header:** `px-4`, `border-border/50`, heading `font-sans`.
    - Export: `<Button variant="ghost" size="sm" onClick={onExport} disabled={!canExport}><Download />Export</Button>`.
    - Close: `Button variant="ghost" size="icon-sm" aria-label="Close screening panel"`.
  - **Loading and empty:** as in Task 6 (`Spinner`, and `Empty` with `EmptyDescription`).
  - **Grid columns.** On the grid's outer `div`:

```tsx
const SCREENING_GRID_STYLE = {
  "--screening-cols": "minmax(300px, 0.95fr) minmax(420px, 1fr)",
} as React.CSSProperties;

<div className="min-w-190" style={SCREENING_GRID_STYLE}>
```

    The header row and each `li` use `grid grid-cols-(--screening-cols)`. Custom properties inherit, so both read the value set on the outer `div`.
  - **Text sizes:** every `text-[11px]`, `text-[12px]` and `text-[13px]` → `text-xs`.
    - The header row: `sticky top-0 z-10 grid grid-cols-(--screening-cols) border-b border-border/50 bg-muted font-sans text-xs font-medium text-muted-foreground`. `bg-muted/40` + `backdrop-blur` → opaque `bg-muted`, matching the Table header.
    - Its column dividers: `border-r border-border/50`.
    - The paper title: `line-clamp-2 text-sm font-medium leading-snug`. It is content, so it gets `text-sm`.
  - **Rank chip:** `flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-sans text-xs font-medium text-muted-foreground`.
  - **"Cite" and "My References" spans:** keep them as non-interactive text, as today, with `font-sans text-xs`. They are placeholders and noted as a follow-up; don't turn them into buttons in this PR.
  - **Criterion detail grid:** `grid grid-cols-[16px_1fr]` → `flex gap-2`. The icon `span` gets `shrink-0 pt-0.5`, and the text `div` gets `min-w-0`.
  - **View/Hide criteria:** `<Button variant="ghost" size="xs" onClick={onToggleExpanded} aria-expanded={isExpanded}>…<ChevronDown className={cn("transition-transform", isExpanded && "rotate-180")} /></Button>`. `ghost` fills on `aria-expanded`, which reads as pressed, so use `variant="disclosure"` (the variant made for expandable sections).
  - **`DecisionBadge`:**

```tsx
function DecisionBadge({ included }: { included: boolean }) {
  const Icon = included ? CheckCircle2 : XCircle;
  return (
    <Badge variant="outline">
      <Icon aria-hidden className={included ? "text-success" : "text-destructive"} />
      {included ? "Included" : "Excluded"}
    </Badge>
  );
}
```

  - **`CriterionIcon`:** `met` → `text-success`, `partial` → `text-warning`, `missed` → `text-muted-foreground`, each `size-3.5`. The spec maps status colours to tokens, and status reads faster with colour.

- [ ] **Step 3: Verify.** Run `bun run test src/features/studio/components/LiteratureScreeningPanel.test.tsx` and `bunx eslint --max-warnings 0 src/features/studio/components/LiteratureScreeningPanel.tsx`. Expected: PASS, and no ESLint output.

- [ ] **Step 4: Commit.** Message: `refactor(studio): screening panel on the design system`.

---

### Task 8: `LiteratureStudioView`

**Files:** Modify `apps/web/src/features/studio/components/LiteratureStudioView.tsx`.

- [ ] **Step 1:** In `PanelShell`:
  - Both variants use `border-l border-border/50` (the default variant had `border-l-2 border-border`, which the lint missed because the class sat in a variable).
  - Keep `bg-background` for the table and `bg-sidebar` for the default.
  - Move the strings into a `cn(...)` call with a variant lookup object, so the linter checks them.
- [ ] **Step 2:** `LoadingState` → `<div className="flex flex-1 items-center justify-center"><Spinner className="size-8 text-primary" /></div>`. If `text-primary` on `Spinner` trips `no-restyle`, drop it.
- [ ] **Step 3: Verify.** Run `bunx eslint --max-warnings 0 src/features/studio/components/LiteratureStudioView.tsx` and `bun run typecheck:web`.
- [ ] **Step 4: Commit.** Message: `refactor(studio): literature studio shell on tokens and Spinner`.

---

### Task 9: Delete the legacy menu, lock in, gates

**Files:**
- Delete: `apps/web/src/shared/ui/DropdownMenu.tsx`, `apps/web/src/shared/ui/DropdownMenu.test.tsx`, `apps/web/src/shared/ui/anchoredPosition.ts`, `apps/web/src/shared/ui/anchoredPosition.test.ts`
- Modify: `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` (through the script)

- [ ] **Step 1: Confirm nothing imports the legacy menu.** Run `rg "shared/ui/DropdownMenu|anchoredPosition" apps/web/src apps/web/e2e`. Expected: only the four files about to be deleted. Then `git rm` them.
- [ ] **Step 2: ESLint config.**
  - Replace the 30 Studio lines in `MIGRATED` (from `StudioPanel.tsx` through `CitationStylePicker.tsx`) with `"src/features/studio/**/*.tsx",` and change the comment to `// Studio (#264).`.
  - Delete the `src/shared/ui/DropdownMenu.tsx` override block and its two comment lines.
  - If `src/shared/ui` then has no `.tsx` left, leave its `MIGRATED` glob in place; a glob matching nothing is harmless.
- [ ] **Step 3: Lint the whole feature.** Run `bunx eslint --max-warnings 0 "src/features/studio/**/*.tsx"` from `apps/web`. Expected: no output. Fix any stragglers in their own files; the per-file globs hid nothing, but check `LiteratureReportPage.tsx` and `LiteratureTablePage.tsx`.
- [ ] **Step 4: Ratchet.** Run `bun run lint:design:update`, then `git diff apps/web/design-lint-baseline.json`. Expected: the `features/studio` entry is removed (or 0), and **no other area's count rises**. Run `bun run lint:design`. Expected: pass.
- [ ] **Step 5: Gates**, from the repo root, one at a time:
  - `bun run typecheck:web`, then `bun run typecheck:convex`;
  - `bun run lint`;
  - `bunx knip` (or the repo's Knip script: check `package.json`). Expected: no unused exports or files. `StudyTypePillStyle` and the deleted menu must be gone with no dangling references.
  - `bun run test:web`. Expected: all pass. Report the count.
  - `bunx playwright test --list` from `apps/web`. Expected: it lists without errors.
- [ ] **Step 6: Commit.** Message: `refactor(studio): drop the legacy dropdown menu; all of Studio joins MIGRATED`.

---

### Task 10: Snapshots, visual check and PR (controller)

- [ ] **Snapshots:** export `VITE_CONVEX_URL` from the parent checkout's `apps/web/.env.local` (`export VITE_CONVEX_URL="$(grep ...)"`, never printed), then run `bun run test:design:update`. Expected: `toggles-*` changes, `tables-*` (4 files) is new, and **no other baseline changes**. Look at the new PNGs, then `bun run test:design`.
- [ ] **Browser pane, on the dev server** (root checkout on :5173, `git checkout --detach feature/studio-literature` there), signed in, in the controller's own tab:
  - open an existing literature review table, report, papers panel and screening panel from a notebook that has one. **No generation, and no clicks on anything that spends credits**; click by `find` ref near Generate or chat controls.
  - Check at 1440 and 375px, light and dark:
    - the sticky header and pinned column while scrolling both ways;
    - the full-screen table and Escape;
    - Manage Columns, toggling one switch (local state only, nothing saved);
    - each Export menu opening (don't pick an item that downloads unless asked);
    - the PRISMA colours;
    - the screening badges and criteria expand.
- [ ] **PR:** `feat(studio): literature review on the design system (#264, 8/8)`, with a body listing the files, the new primitives, the deleted legacy menu, the ratchet (73 → 0, Studio fully in `MIGRATED`), the follow-ups, and "Closes #264".

---

## Self-review

- **Spec coverage (§8):**
  - `Table` added through the CLI with fix-ups (Task 1), with a gallery entry (Task 1);
  - the table and cells use `Table`, `Badge` and `Tooltip` (Tasks 2–3; `Tooltip` is kept on Off-topic);
  - the three legacy menu users move to the shadcn `DropdownMenu` (Tasks 3, 5 and 6), and the menu, its helper and its override are deleted (Task 9);
  - 10–12px text becomes `text-xs` (Tasks 2, 6 and 7), and the table gets roomier (Task 1 padding, Task 2 `text-sm`);
  - the screening grid uses `--screening-cols` (Task 7);
  - colours become tokens (Tasks 2 and 5–8);
  - the `MIGRATED` glob replaced (Task 9).
- **Extras the spec implies:** `Switch` (the hand-rolled `role="switch"` is a primitive in disguise), the hidden PRISMA palette debt, the `border-l-2` in a variable, and the `style` prop rename.
- **Type consistency:** `studyTypeIcon` returns `StudyTypePillIcon` (Task 2). `TableHead`/`TableCell` share `pinned`; `TableHeader` takes `sticky` (Tasks 1 and 3). `FlowVariant` keys are used only inside `PrismaFlowDiagram`.

## Decisions

| Question | Decision |
|---|---|
| Sticky header and column with the shadcn `Table` | Borders on cells with `border-separate`, the wrapper as the scroll container, and `sticky`/`pinned` variants. Upstream row borders vanish under `border-separate`, and its `overflow-x-auto` wrapper breaks vertical sticky. |
| Column toggles | New `Switch` primitive (brand primary when on), not a restyled `Toggle` |
| Study-type pills | `Badge variant="outline"`; the util returns just the icon kind |
| Literature accents (open access, sparkles, open link) | `text-studio-literature`, the existing orange literature token |
| PRISMA boxes | info (sources), muted (screening), destructive (excluded), success (included) |
| Screening decisions | outline `Badge` with a success or destructive icon; criteria icons in success, warning or muted |
| Container-query thresholds | named `@sm`…`@4xl` sizes in place of `@min-[Npx]`; labels appear slightly earlier |
| Non-functional "Cite" / "My References" in screening rows | Unchanged here (follow-up) |
