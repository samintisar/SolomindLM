# Discover sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Discover sources modal and the shared academic filters onto shadcn primitives in the soft layered style.
- Results become a keyboard-selectable grouped list.
- The grid view goes.
- The no-op SJR filter goes.

**Architecture:**
- **Pure helpers** move to `discover/discoveryFormat.ts` (TDD).
- **`DiscoverSourcesDialog`:**
  - owns search, selection and adding;
  - renders a `DiscoveryToolbar` (search, types, filters popover) and a list of `DiscoveryResultItem`s;
  - keeps state above `DialogContent`, so a reopen keeps the last search.
- **`AcademicDiscoveryFiltersSection`** keeps its path and exports, because chat imports it.

**Tech Stack:**
- React 19
- Radix through shadcn/ui primitives in `apps/web/src/shared/components/ui`
- Tailwind v4
- vitest + Testing Library
- Playwright e2e at the repo-root `e2e/`

**Spec:** `docs/superpowers/specs/2026-10-03-discover-sources-design.md`.

**References** (read before writing UI):
- `apps/web/src/features/sources/components/add-source/AddSourceDialog.tsx`: the dialog shell, header, footer, busy gating, `handoffRef`.
- `add-source/BibtexImportForm.tsx`: a grouped list of `<label>` rows with a `Checkbox`, and Spinner `aria-hidden` inside buttons.
- `add-source/AddSourceDialog.test.tsx`: mocks for `useUserLimits`, `documentsApi` and `useToast`.

**Worktree and branch:** `C:/Users/samin/Documents/GitHub/SolomindLM/.claude/worktrees/premium-ui-shadcn-linter-74efdb`, branch `feature/ds-migrate-sources-discover`.
- Use Read/Edit/Write/Bash. **Do not use Serena.**
- Run commands from the repo root unless the step says otherwise.

**Ground rules for every task:**
- **Style:**
  - Semantic tokens only: no palette colours, no `dark:`, no `bg-black/NN`, no `border-2`.
  - No unconditional `border-primary`, and no borders on `<button>`.
  - No arbitrary values (`[...]`). CSS-variable shorthand like `max-h-(--radix-popover-content-available-height)` is allowed.
  - No inline styles except custom-property-only ones.
- **`shadcn/no-restyle`:** it warns when typography or spacing classes are passed to primitive sub-parts (`DialogTitle`, `CardTitle`, `ItemTitle`, `DialogHeader`, `Textarea`…). Wrap the content in a `span`/`div` instead.
- **Spinners:** inside a labelled button, use `<Spinner aria-hidden />`. A standalone status row uses `role="status"`.
- **Processes and git:** never kill processes by name, and never use `git stash`. Don't push.
- **Before each commit:** `bunx biome format --write <changed>`, then `bunx biome check <changed>`.
- **Lint:** from `apps/web`, `bunx eslint <changed files>` must report 0 problems for new and migrated files.
- **Commits:** conventional commits, each ending with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:** run from `apps/web` with `bunx vitest run <path>`.

---

## File structure

**Create** in `apps/web/src/features/sources/components/discover/`:

| File | Responsibility |
|---|---|
| `discoveryFormat.ts` (+ `.test.ts`) | Hostname, snippet check, byline, relevance level, access info, notebook-match keys |
| `DiscoveryResultItem.tsx` | One selectable result row with per-row actions |
| `DiscoveryFilters.tsx` | Popover body: time range, sort, results count, academic section, reset |
| `DiscoveryToolbar.tsx` | Search form, source-type toggles, Filters popover trigger |
| `DiscoverSourcesDialog.tsx` (+ `.test.tsx`) | Dialog shell, search, selection, add, footer |

**Modify:**
- `components/AcademicDiscoveryFiltersSection.tsx`, plus a new `AcademicDiscoveryFiltersSection.test.tsx`
- `constants/academicFieldTaxonomy.ts` (drop SJR palette fields if unused)
- `components/SourcesPanel.tsx`
- `e2e/sources/add-source-modal.spec.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/design-lint-baseline.json`

**Delete:** `components/DiscoverSourcesModal.tsx`.

---

### Task 1: discoveryFormat helpers (TDD)

**Files:**
- Create: `discover/discoveryFormat.ts`
- Test: `discover/discoveryFormat.test.ts`

Port from `DiscoverSourcesModal.tsx` lines ~126–230 and ~252–276. The logic must stay identical; only the colour classes are dropped.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import {
  accessInfo,
  formatAcademicByline,
  getHostname,
  isSnippetMeaningful,
  notebookDiscoveryKeys,
  isInNotebook,
  relevanceLevel,
} from "./discoveryFormat";

function result(over: Partial<UnifiedDiscoveryResult> & { metadata?: Partial<UnifiedDiscoveryResult["metadata"]> } = {}): UnifiedDiscoveryResult {
  return {
    id: "r1",
    title: "Title",
    url: "https://example.com/a",
    snippet: "",
    score: 0.5,
    sourceType: "web",
    ...over,
    metadata: { ...(over.metadata ?? {}) },
  } as UnifiedDiscoveryResult;
}

describe("getHostname", () => {
  it("returns the host, or the input when it is not a URL", () => {
    expect(getHostname("https://www.nature.com/x")).toBe("www.nature.com");
    expect(getHostname("not a url")).toBe("not a url");
  });
});

describe("isSnippetMeaningful", () => {
  it("hides empty, identical and title-prefix snippets", () => {
    expect(isSnippetMeaningful("Deep Learning", "")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning", "  deep   learning ")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning Review", "Deep Learning")).toBe(false);
    expect(isSnippetMeaningful("Deep Learning", "A survey of methods")).toBe(true);
  });
});

describe("formatAcademicByline", () => {
  it("joins year, venue and first author with et al.", () => {
    const r = result({ sourceType: "academic", metadata: { publicationYear: 2017, venue: "NeurIPS", authors: ["Vaswani", "Shazeer"] } });
    expect(formatAcademicByline(r)).toBe("2017 · NeurIPS · Vaswani et al.");
  });
  it("falls back to publishedDate's year and is null for non-academic", () => {
    expect(formatAcademicByline(result({ sourceType: "academic", publishedDate: "2020-05-01" }))).toBe("2020");
    expect(formatAcademicByline(result())).toBeNull();
  });
});

describe("relevanceLevel", () => {
  it("uses the 0.8 / 0.6 thresholds", () => {
    expect(relevanceLevel(0.8)).toBe("high");
    expect(relevanceLevel(0.6)).toBe("medium");
    expect(relevanceLevel(0.59)).toBe("low");
  });
});

describe("accessInfo", () => {
  it("ranks PDF, open access, external, metadata only; null for web", () => {
    expect(accessInfo(result({ sourceType: "academic", metadata: { pdfUrl: "https://x/p.pdf" } }))?.label).toBe("OA PDF");
    expect(accessInfo(result({ sourceType: "academic", metadata: { openAccess: true } }))?.label).toBe("Open access");
    expect(accessInfo(result({ sourceType: "academic", metadata: { doi: "10.1/x" } }))?.label).toBe("External access");
    expect(accessInfo(result({ sourceType: "academic" }))?.label).toBe("Metadata only");
    expect(accessInfo(result())).toBeNull();
  });
});

describe("notebook matching", () => {
  const sources = [
    { id: "s1", url: "https://example.com/a", paper: undefined },
    { id: "s2", paper: { doi: "https://doi.org/10.1/ABC" } },
    { id: "s3", paper: { openAlexId: "https://openalex.org/W123" } },
  ] as unknown as Source[];
  const keys = notebookDiscoveryKeys(sources);

  it("matches by normalized URL", () => {
    expect(isInNotebook(result({ url: "https://example.com/a" }), keys)).toBe(true);
  });
  it("matches academic results by DOI or OpenAlex id, case-insensitively", () => {
    expect(isInNotebook(result({ sourceType: "academic", url: "https://z", metadata: { doi: "10.1/abc" } }), keys)).toBe(true);
    expect(isInNotebook(result({ sourceType: "academic", url: "https://z", metadata: { openAlexId: "w123" } }), keys)).toBe(true);
  });
  it("does not match web results by DOI", () => {
    expect(isInNotebook(result({ url: "https://z", metadata: { doi: "10.1/abc" } }), keys)).toBe(false);
  });
});
```

Run `bunx vitest run src/features/sources/components/discover/discoveryFormat.test.ts`. It should fail because the module is missing.

- [ ] **Step 2: Implement.** Port the functions verbatim from the modal: `getHostname`, `isSnippetMeaningful`, `formatAcademicByline`, `normalizeDiscoveryKey`, `normalizeDoiKey`. Add:

```ts
export type RelevanceLevel = "high" | "medium" | "low";
export function relevanceLevel(score: number): RelevanceLevel {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/** Access hint aligned with notebook `fulltextStatus` copy. Labels and titles match the old chips. */
export function accessInfo(r: UnifiedDiscoveryResult): { label: string; title?: string } | null {
  if (r.sourceType !== "academic") return null;
  if (r.metadata.pdfUrl?.trim()) {
    return {
      label: "OA PDF",
      title: "An open-access PDF is available. We try to ingest it; some repositories block automated downloads.",
    };
  }
  if (r.metadata.openAccess) return { label: "Open access" };
  if (r.metadata.landingPageUrl?.trim() || r.metadata.doi?.trim()) return { label: "External access" };
  return { label: "Metadata only" };
}

export function notebookDiscoveryKeys(sources: Source[]): Set<string> {
  /* body of the old useMemo, returning the Set */
}

export function isInNotebook(r: UnifiedDiscoveryResult, keys: Set<string>): boolean {
  /* body of the old isDiscoveryResultInNotebook */
}
```

Export `getHostname`, `isSnippetMeaningful` and `formatAcademicByline`. Keep `normalizeSourceUrlForNotebookMatch` imported from `@/shared/utils/sourceUrlMatch`.

- [ ] **Step 3: Run the tests.** They should pass.

- [ ] **Step 4: Commit** with `feat(sources): discovery formatting helpers`.

---

### Task 2: Academic filters section on primitives

**Files:**
- Modify: `components/AcademicDiscoveryFiltersSection.tsx` and `constants/academicFieldTaxonomy.ts`
- Test: `components/AcademicDiscoveryFiltersSection.test.tsx` (new)

Read the whole file first. Keep:
- every export's name and signature (`AcademicDiscoveryFiltersSection`, `buildAcademicDiscoveryApiFilters`, `DiscoveryAcademicFilterState`, and anything else exported);
- the props (`academic`, `setAcademic`, `showTopDivider`);
- the patch semantics of `setAcademic`.

Its consumers are:
- `features/chat/components/composer/FiltersPopover.tsx`
- `ChatPanel.tsx`
- `ChatInput.tsx`
- the chat tests that mock it (`ChatPanel.header.test.tsx`, `ChatPanel.externalSources.test.tsx`)
- `composer/popovers.test.tsx`, which renders it and reads the "Academic papers" text, so keep that heading text.

- [ ] **Step 1: Failing tests.** Render with a small harness holding state:

```tsx
function Harness({ initial = {} }: { initial?: DiscoveryAcademicFilterState }) {
  const [academic, setA] = useState<DiscoveryAcademicFilterState>(initial);
  return (
    <>
      <AcademicDiscoveryFiltersSection academic={academic} setAcademic={(p) => setA((prev) => ({ ...prev, ...p }))} />
      <output data-testid="api">{JSON.stringify(buildAcademicDiscoveryApiFilters(academic))}</output>
    </>
  );
}
```

Cases. Read the file first to learn the real state field names, and adapt the field names in the assertions to match.
1. `getByRole("radiogroup", { name: "Publication year" })` contains the radios "All years", "Last N years" and "Custom range". Choosing "Last N years" enables the textbox or spinbutton "Years".
2. Choose "Custom range" and type From = 2022, To = 2010. Expect:
   - `getByText("From must be before To")`;
   - both inputs have `aria-invalid="true"`;
   - the `api` output contains no year range.
3. `getByRole("checkbox", { name: "Has PDF" })` and `getByRole("checkbox", { name: "Open access" })` toggle the corresponding state. The `api` output reflects it.
4. `getByRole("spinbutton", { name: "Minimum citations" })`: typing 10 shows up in `api`, and clearing it removes the minimum.
5. The `getByRole("button", { name: /Field of study/ })` collapsible starts with `aria-expanded="false"`. Opening it shows the `getByRole("textbox", { name: "Filter fields" })` search. Checking a field's checkbox adds it to state, and the trigger's name then includes "1 selected".
6. `queryByText(/Journal Rating|SJR/i)` returns `null`.

Run the test. It should fail.

- [ ] **Step 2: Implement** with `RadioGroup`/`RadioGroupItem`, `Field`/`FieldLabel`/`FieldError`/`FieldSet`/`FieldLegend`, `Input`, `Checkbox`, `Collapsible`, `InputGroup` and `Button`. Read each primitive's file for its API.

- **Publication year:**
  - `FieldSet` with `FieldLegend` "Publication year".
  - A `RadioGroup` labelled by the legend (`aria-labelledby`), with `useId`-based ids.
  - "Last N years": a radio plus `Input type="number" min={1} max={80}` labelled "Years", disabled unless that mode is selected. Keep the clamp to 1–80.
  - "Custom range": radio plus "From" and "To" number inputs, each with its own label. When both are set and From > To:
    - show `<FieldError>From must be before To</FieldError>`;
    - set `aria-invalid` on both inputs;
    - make `buildAcademicDiscoveryApiFilters` omit the range when From > To.
- **Has PDF / Open access:** each is `<Field orientation="horizontal"><Checkbox id=… checked=… onCheckedChange=… /><FieldLabel htmlFor=…>…</FieldLabel></Field>`. Delete `FilterToggle`.
- **Minimum citations:** `Input type="number" min={0}`, labelled "Minimum citations", placeholder "Any". A blank value or 0 means no minimum (it is dropped from the API).
- **Field of study:**
  - `Collapsible`, with `CollapsibleTrigger asChild` over a ghost `Button` containing a ChevronDown that rotates via `group-data-[state=open]` or a `data-[state=open]:` class. The label is "Field of study", plus " · N selected" when N > 0.
  - Content:
    - an `InputGroup` with a search icon and an `InputGroupInput` labelled "Filter fields" (`aria-label`);
    - per group from `ACADEMIC_FIELD_GROUPS`, a muted `<p className="text-xs font-medium text-muted-foreground">` heading and `Checkbox` fields;
    - a ghost `Button size="xs"` "Show N more" / "Show less" per group.
  - The list is wrapped in `max-h-52 overflow-y-auto`. Keep today's filtering logic.
- **Journal rating:** delete the SJR UI block. Keep the `worstAllowedJournalQuartile` state field and its type. Grep for `pillClass|barClass|barWidth` across `apps/web/src`; if only the deleted block used them, remove those fields from the tier constants in `constants/academicFieldTaxonomy.ts`.
- **Text classes:** no `text-[11px]` or `text-[10px]`; use `text-xs`.
- **Section heading:** keep the "Academic papers" text.

- [ ] **Step 3: Run the tests**, plus the chat ones:

```bash
bunx vitest run src/features/sources/components/AcademicDiscoveryFiltersSection.test.tsx src/features/chat
```

All of them should pass.

- [ ] **Step 4: Lint.** Run `bunx eslint src/features/sources/components/AcademicDiscoveryFiltersSection.tsx src/features/chat/components/composer/FiltersPopover.tsx`. It should report 0 problems.

- [ ] **Step 5: Commit** with `refactor(sources): academic filters on design-system primitives`.

---

### Task 3: DiscoveryResultItem

**Files:**
- Create: `discover/DiscoveryResultItem.tsx`

There is no separate test; the dialog test in Task 5 covers it.

Props:

```ts
interface DiscoveryResultItemProps {
  result: UnifiedDiscoveryResult;
  selected: boolean;
  inNotebook: boolean;
  adding: boolean;
  limitReached: boolean;
  onToggle: () => void;
  onAdd: () => void;
}
```

Markup, following the `BibtexImportForm` row pattern:

```tsx
<div role="listitem">
  <Item asChild size="sm">
    <label htmlFor={checkboxId} className="cursor-pointer items-start has-disabled:cursor-default">
      <ItemMedia>
        <Checkbox
          id={checkboxId}
          checked={selected || inNotebook}
          disabled={inNotebook}
          onCheckedChange={onToggle}
          aria-label={`Include ${result.title || hostname}`}
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        {/* title row: favicon or type icon + title */}
        {/* byline (academic), snippet if meaningful */}
        {/* badges row */}
      </ItemContent>
      <ItemActions onClick={(e) => e.preventDefault()}>
        {/* open link + add button; preventDefault stops the label from toggling the checkbox */}
      </ItemActions>
    </label>
  </Item>
</div>
```

Details:
- **Title row:**
  - Web, news and finance results show `<Favicon url={result.url} … />`. Read `@/shared/components/Favicon` for its props.
  - Academic results show the `GraduationCap` icon in a `size-5` muted span. Share the type → icon map (Globe, Newspaper, GraduationCap, TrendingUp) with the toolbar: export a `SOURCE_TYPE_META` record from `discoveryFormat.ts` or a small `discover/sourceTypes.ts`.
  - The title is `<span className="line-clamp-2 font-medium">`.
- **Byline:** `formatAcademicByline(result)` in `text-sm text-muted-foreground`.
- **Snippet:** shown when `isSnippetMeaningful`, as `<p className="line-clamp-2 text-sm text-muted-foreground">`.
- **Badges** (`flex flex-wrap gap-1.5`), each a `Badge variant="outline"`:
  - type label (Web, News, Academic or Finance);
  - `getHostname(url)` without `www.`;
  - `{High|Medium|Low} match` from `relevanceLevel`;
  - `accessInfo(result)?.label`, with `title` set when present;
  - citations, `<Quote aria-hidden /> {n.toLocaleString()} citations`, when `metadata.citationCount != null`.
- **Actions:**
  - `<Button variant="ghost" size="icon-sm" asChild><a href={result.url} target="_blank" rel="noreferrer" aria-label={`Open ${title} in new tab`}><ExternalLink /></a></Button>`
  - `<Button variant="outline" size="sm" disabled={inNotebook || adding || limitReached} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}>`. Its label is one of:
    - `inNotebook`: `<Check aria-hidden /> Added`;
    - `adding`: `<Spinner aria-hidden /> Adding…`;
    - `limitReached`: `Limit reached`;
    - otherwise: `<Plus aria-hidden /> Add`.

  Give the add button `aria-label={`Add ${title}`}` only in the "Add" state. In the other states its text is enough.

  Make sure a click on the link or the button does not toggle the checkbox. Test this in Task 5.

Run `bunx eslint` on the file. It should report 0 problems. Then commit with `feat(sources): discovery result row`.

---

### Task 4: DiscoveryToolbar and DiscoveryFilters

**Files:**
- Create: `discover/DiscoveryToolbar.tsx`, `discover/DiscoveryFilters.tsx`

Move `FilterState`, `DEFAULT_FILTERS`, `MAX_DISCOVERY_TOTAL_RESULTS` and `SourceType` from the old modal into `discover/discoveryFilters.ts`, a plain module, so that the dialog, toolbar and filters can all import them.

- [ ] **`DiscoveryFilters`.** Props are `filters: FilterState` and `onChange(patch: Partial<FilterState>)`. Render a `FieldGroup className="gap-5"`. If `no-restyle` flags that class, wrap the group in a `div` instead. The fields:
  - **Time range:** a `Select` labelled "Time range". Use today's option list from the old modal (lines ~615–630), with `"any"` mapped to `undefined`.
  - **Sort by:** a `Select` with Relevance, Newest and Most cited. Values come from the old modal (~637–650).
  - **Results:** a `ToggleGroup type="single" variant="outline" size="sm" aria-label="Number of results"` with items 5, 10, 15 and 20. `onValueChange` ignores the empty string, so the group can never be empty.
  - **Academic section:** `filters.sourceTypes.includes("academic") && <AcademicDiscoveryFiltersSection academic={filters.academic} setAcademic={(p) => onChange({ academic: { ...filters.academic, ...p } })} showTopDivider />`. Check how the old modal passed `setAcademic` and copy it.
  - **Reset filters:** a ghost `Button size="sm"`, disabled when `filters` deep-equals `DEFAULT_FILTERS`. Clicking it calls `onChange(DEFAULT_FILTERS)`.

  Also export `countActiveFilters(filters)`. It counts differences from the defaults: time range set, sort ≠ relevance, maxResults ≠ default, and, when Academic is on, `Object.keys(buildAcademicDiscoveryApiFilters(filters.academic)).length`. Add a test case for it in `discoveryFormat.test.ts`, or in a new `discoveryFilters.test.ts` (preferred).

- [ ] **`DiscoveryToolbar`.** Props:

  ```ts
  { query, onQueryChange, onSearch: () => void, isLoading,
    filters, onFiltersChange: (patch: Partial<FilterState>) => void }
  ```

  It contains:
  - `<form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(); }}>`, holding:
    - an `sr-only` `<label htmlFor={id}>Search sources</label>`;
    - an `InputGroup` with a search-icon addon;
    - an `InputGroupInput` with `id`, `autoFocus` and the placeholder `"Search for articles, papers, or websites..."` exactly;
    - an `InputGroupAddon align="inline-end"` holding an `InputGroupButton type="submit"`, disabled while `!query.trim() || isLoading`, showing `{isLoading ? <Spinner aria-hidden /> : null} Search`.
  - Below it, a row (`flex flex-wrap items-center justify-between gap-2`) with:
    - `ToggleGroup type="multiple" variant="outline" size="sm" aria-label="Source types" value={filters.sourceTypes} onValueChange={(v) => onFiltersChange({ sourceTypes: v.length ? v : ["web"] })}`, with one item per type (icon plus label);
    - a `Popover`. Its `PopoverTrigger asChild` wraps `<Button variant="outline" size="sm"><SlidersHorizontal aria-hidden /> Filters {n > 0 && <Badge variant="secondary">{n}</Badge>}</Button>` and gets `aria-label` "Filters" or "Filters, N active". Its `PopoverContent align="end"` uses `className="w-80 max-h-(--radix-popover-content-available-height) overflow-y-auto"` and holds `<DiscoveryFilters … />`.
  - `variant="outline"` must exist for `ToggleGroup`; read `toggle-group.tsx`. If it doesn't, use the variant the chat tray uses.
  - The `PopoverContent` width is `w-80`, a token; if `no-restyle` flags it, read `popover.tsx` for a size variant.

Run `bunx eslint` on the changed files. It should report 0 problems. Commit with `feat(sources): discovery toolbar and filters`.

---

### Task 5: DiscoverSourcesDialog

**Files:**
- Create: `discover/DiscoverSourcesDialog.tsx`, `discover/DiscoverSourcesDialog.test.tsx`

Props match the old modal, except that `isAtLimit` is removed:

```ts
export interface DiscoverSourcesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSource: (source: Source) => void;
  notebookSources: Source[];
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
  onAddSourcesClick?: () => void;
}
```

- [ ] **Step 1: Failing tests.** Mock these:
  - `@/features/billing/services/subscriptionApi` (`useUserLimits` → mutable `{ sourceLimit: 100, isLoading: false }`);
  - `../../services/documentsApi` (`useUnifiedDiscovery: () => discover`, `useCreateDocument: () => createDocument`);
  - `@/shared/contexts/useToast` (`error`, `success`);
  - `@/hooks/useSessionStorage` → a `useState` passthrough: `(key, init) => useState(init)`.

  Fixtures:

  ```ts
  const web = { id: "w1", title: "Web page", url: "https://ex.com/a", snippet: "About things", score: 0.9, sourceType: "web", metadata: {} };
  const paper = { id: "p1", title: "A paper", url: "https://openalex.org/W1", snippet: "Abstract", score: 0.7, sourceType: "academic",
    metadata: { authors: ["Ann Lee"], publicationYear: 2020, doi: "10.1/p", openAlexId: "W1", openAccess: true } };
  discover.mockResolvedValue({ sources: [web, paper], totalCount: 2, sourceTypeCounts: {}, warnings: [] });
  createDocument.mockResolvedValue({ documentId: "doc1" });
  ```

  Cases:
  1. `getByRole("dialog", { name: "Discover sources" })` exists. Before searching, the text "Find sources to add" is shown.
  2. Type "transformers" and press Enter. `discover` is called with `expect.objectContaining({ query: "transformers", sourceTypes: ["web"], maxResults: 20, sortBy: "relevance" })`. Then:
     - the checkboxes "Include Web page" and "Include A paper" appear, unchecked;
     - the text "2 results" is shown.
  3. Clicking the row title text "Web page" checks its checkbox, and the footer reads "1 of 2 selected". Clicking the row's "Open Web page in new tab" link does not change the selection.
  4. "Select all" selects both. Then:
     - with `notebookSources` containing a source whose `url` is `https://ex.com/a`, "Select all" selects only the paper, and the web row shows a disabled "Added" button;
     - with `sourceLimit: 1` and 0 notebook sources, "Select all" selects 1 and the note "Only 1 more source fits in this notebook." is shown. Adjust the singular/plural wording to what you implement, but cover it.
  5. The per-row "Add A paper" calls `createDocument` with `expect.objectContaining({ notebookId: "nb1", type: "paper_record", fileName: "A paper", paperRecord: expect.objectContaining({ doi: "10.1/p", isOa: true }) })`, and then `onAddSource` with a `PAPER` source.
  6. Select both, then click "Add 2 sources". `createDocument` is called twice: one `url`, one `paper_record`. `success` is called with "Added 2 sources", and the selection clears.
  7. With `notebookSources.length` equal to `sourceLimit` (100), every "Add" button reads "Limit reached" and is disabled, and "Add N sources" is disabled.
  8. **Stale response:** the first `discover` call returns a promise you resolve later; the second resolves at once with `[paper]`. Resolve the first afterwards with `[web]`. Only "Include A paper" is present.
  9. **No results:** `discover` resolves `{ sources: [], warnings: ["Rate limited, try later"] }`. The text "No sources found" and "Rate limited, try later" are shown.
  10. **Source types never go empty:** click "Web" to deselect it, then submit. `sourceTypes` is `["web"]`.
  11. **Busy:** during an add (`createDocument` pending), Escape does not call `onOpenChange(false)`.
  12. **Hand-off:** "Add sources" calls `onOpenChange(false)` and then `onAddSourcesClick`.

  Run the tests. They should fail.

- [ ] **Step 2: Implement.**
  - **State** (in the component, not inside `DialogContent`): `query`, `results`, `selectedIds`, `addingIds`, `isLoading`, `error`, `hasSearched`. Filters use `useSessionStorage("discovery-filters", DEFAULT_FILTERS)`, plus the one-time clamp effect with its comment.
  - **Notebook match:** `const keys = useMemo(() => notebookDiscoveryKeys(notebookSources), [notebookSources])` and `inNotebook = (r) => isInNotebook(r, keys)`.
  - **Limits:** `useUserLimits()`, then `limitReached`, and `remaining = Math.max(0, sourceLimit - notebookSources.length)`. While limits are loading, use `remaining = Infinity` and `limitReached = false`, as the add dialog does.
  - **Search:** port `handleSearch`. Add `const requestRef = useRef(0)`. Each search does `const id = ++requestRef.current`, and ignores the result (and the `finally` updates) unless `id === requestRef.current`. Set `hasSearched` to true. With no results:
    - keep `results` empty;
    - store `warning = response.warnings?.[0] ?? null`;
    - render the no-results `Empty`.

    Errors go to `error`, rendered as an `Alert`.
  - **Adding:** port `addResult` verbatim, using `noteId` and the same `Source` shapes. Port `handleAddSingle`, then change `handleAddSelected`:
    - `toAdd = results.filter(selected && !inNotebook && !adding).slice(0, remaining)`;
    - add them sequentially and count successes;
    - on finish, if `ok > 0`, call `success(ok === 1 ? "Added 1 source" : `Added ${ok} sources`)`;
    - then remove the succeeded ids from `selectedIds`. Failures stay selected, and their error toasts are unchanged.
  - **Select all:** `selectAll = results.filter((r) => !inNotebook(r)).slice(0, remaining)`. "Clear" empties the selection. The button shows "Select all" when nothing is selected, otherwise "Clear".
  - **Busy:** `busy = addingIds.size > 0`. Block closing while busy, the same way as `AddSourceDialog`: the `onOpenChange` guard, plus `onEscapeKeyDown` and `onInteractOutside` calling `preventDefault`, and the ✕ disabled.
  - **Shell:** the header and close button match `AddSourceDialog`.
    - The header right side holds an outline `Button size="sm"` "Add sources" (Plus icon) with `className="hidden sm:inline-flex"`. It sets `handoffRef.current = true`, calls `onOpenChange(false)`, then `onAddSourcesClick?.()`.
    - Add `onCloseAutoFocus` handoff handling.
  - **Body:** `min-h-0 flex-1 overflow-y-auto px-6 pb-6`, laid out as `flex flex-col gap-4`:
    - `<DiscoveryToolbar …/>`;
    - the results region:
      - loading: `<div role="status" className="flex flex-col gap-3"><span className="sr-only">Searching…</span>{3× <Skeleton className="h-20 rounded-xl" />}</div>`;
      - `error`: `Alert variant="destructive"`;
      - no search yet: `Empty` with `EmptyMedia variant="icon"` (Search icon), `EmptyTitle` "Find sources to add", and `EmptyDescription` "Search the web, news, academic papers or finance.";
      - no results: `Empty` "No sources found" with the description `warning ?? "Try different keywords or filters."`;
      - results: `<p aria-live="polite" className="text-sm text-muted-foreground">{n} result{s}</p>`, then `<ItemGroup variant="grouped">{results.map(DiscoveryResultItem)}</ItemGroup>`.
  - **Footer:** `flex flex-wrap items-center gap-3 bg-muted/40 px-6 py-3 font-sans text-sm`, containing:
    - `{selected} of {selectable} selected`, where `selectable` is the number of results not in the notebook;
    - the ghost "Select all" / "Clear" button, disabled when nothing is selectable;
    - the overflow note `text-xs text-muted-foreground` when `selectedIds.size > remaining`;
    - `ml-auto`, then the primary Button "Add {n} source(s)" (Spinner `aria-hidden` while busy), disabled while `n === 0 || busy || limitReached`.

- [ ] **Step 3: Run the test**, then `bunx eslint src/features/sources/components/discover`. The tests should pass, and eslint should report 0 problems.

- [ ] **Step 4: Commit** with `feat(sources): discover sources dialog`.

---

### Task 6: Wire, delete, e2e

- [ ] **SourcesPanel:**
  - Replace the `DiscoverSourcesModal` import and usage with `DiscoverSourcesDialog`, using `open={isDiscoverOpen}` and `onOpenChange={setIsDiscoverOpen}`.
  - Drop `isAtLimit`. Keep the other props and the `onAddSourcesClick` body.
  - Read the old usage (around lines 422–435) first.
- [ ] **Delete the old modal:** `git rm apps/web/src/features/sources/components/DiscoverSourcesModal.tsx`. Then grep `apps/web/src` for `DiscoverSourcesModal`. There should be no code hits; fix any comments that still mention it, such as the one in `add-source`.
- [ ] **e2e** (`e2e/sources/add-source-modal.spec.ts`): after clicking Discover in the add dialog, assert `page.getByRole("dialog", { name: "Discover sources" })` is visible, and scope the placeholder lookup to it. Then run `bunx playwright test --list` from the repo root. It should parse.
- [ ] **Checks:**
  - `bun run typecheck:web`
  - `bun run test:web`, which includes the chat tests

  Both should pass.
- [ ] **Commit** with `refactor(sources): mount the discover dialog and remove the old modal`.

---

### Task 7: Enforcement and gates

- [ ] From `apps/web`, run `bunx eslint src/features/sources`. If it reports 0 problems, replace the per-file sources entries in `MIGRATED` (`apps/web/eslint.config.mjs`) with `"src/features/sources/**/*.tsx"`. Otherwise add `discover/**` and `AcademicDiscoveryFiltersSection.tsx` explicitly and list the remaining offenders in the report.
- [ ] Run `bun run lint:design`, then `bun run lint:design:update`. The baseline diff should only decrease. The `features/sources` entry should disappear or reach 0.
- [ ] Run the gates one at a time:
  - `bun run typecheck:web`
  - `bun run typecheck:convex`
  - `bun run lint`
  - `bun run test:web`
  - `bun run lint:design`
- [ ] **Commit** with `chore(web): enforce design lint across sources`.

---

### Visual pass (controller)

- **Views:** desktop and 375px, light and dark.
- **States:** empty, filters popover (with academic on), and the chat composer filters popover.
- **Results:** a real search is one Discover call, which hits Tavily and the academic APIs. Ask the user before running it.
- **Limit state:** check it if feasible.
