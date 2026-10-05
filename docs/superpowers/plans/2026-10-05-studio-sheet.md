# Studio Spreadsheets "Sheet" (PR 5 of #264, closes #299) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generated spreadsheets become an always-editable sheet that autosaves, built on one shared RFC 4180 CSV module and one validated `update` mutation.

**What "Sheet" means:**
- **Layout:** the header row and the row numbers stay in place while scrolling, and number columns are right-aligned with tabular figures.
- **Editing:**
  - Click a cell to select it. Typing, double-click, Enter or F2 starts editing.
  - Enter moves down and Tab moves right; the arrow keys move between cells.
  - Escape cancels the edit, and Delete or Backspace clears the selected cell.
- **Column header menu:** Sort A→Z, Sort Z→A, Insert column right, Rename and Delete column.
- **Adding:** "+ Add row" at the bottom, and "+" after the last column.
- **Saving:**
  - A changed cell flashes softly.
  - The header shows "Saving…", then "Saved · Edited".
  - A failed save shows "Couldn't save · Retry".
- **Phones:** tapping selects a cell, and a second tap edits it. No action is hover-only.

**Architecture:**
- **`convex/_shared/csv.helpers.ts`:** the one `parseCsv`/`serializeCsv` pair.
  - It's shared by the web app (through `@convex/_shared/csv.helpers`) and by the Convex spreadsheet job.
  - **Why the two dots in the name:** the Convex bundler skips files with more than one dot as function modules, as with `convex/_testing/preloadModules.helpers.ts`. So it adds no module to `convex/_generated/api.d.ts`, and the required "Convex codegen" CI check stays green without a regenerate. (Regenerating needs the dev deployment, and editing `convex/_generated` is blocked.)
  - The file holds no Convex functions, so leaving it out of the API is also correct.
- **`convex/studio/spreadsheets/index.ts`:** keeps one public `update`. It gains validation and `metadata.editedAt`, and drops its unused free-form `metadata` argument. The unused public `updateSpreadsheet` is deleted.
- **Web, in `apps/web/src/features/studio/components/spreadsheet/`:**
  - `sheetModel.ts`: pure grid operations.
  - `useSheetAutosave.ts`: debounce, flush, retry and status.
  - `SheetGrid.tsx`: the table, selection, editing, keys and column menu.
  - `SheetSaveStatus.tsx`: the header status.
- **`SpreadsheetView.tsx`** is rewritten around these pieces and joins `MIGRATED`.

**Tech Stack:** React 19.2 (`useEffectEvent`), Tailwind v4, shadcn/ui (`DropdownMenu`, `AlertDialog`, `Button`, `Empty`, `Alert`), Convex + `convex-test`, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md` §5, plus "Error handling" and "Testing". Mockup: `.superpowers/brainstorm/*/content/spreadsheet.html`, option A "Sheet".

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-sheet`, based on `origin/main` after PR 4 (#362).
- **One web test file:** `bun run test <path>`, from `apps/web`.
- **One Convex test file:** `bunx vitest run --config vitest.convex.config.ts <path>`, from the root.
- **Typecheck:** `bun run typecheck:web` and `bun run typecheck:convex`, from the root, one at a time.
- **Never kill processes by name.** Use test timeouts. Don't use the browser.

**Decisions this plan makes** (the spec leaves them open):

| Question | Decision |
|---|---|
| Who can edit | Everyone who can open the notebook. `NotebookAccessRole` is only `owner` or `editor` (`convex/_lib/notebookAccess.ts`), so the client has no read-only role. The sheet is read-only only while the spreadsheet is not `completed`. |
| Saving while generating | `update` rejects `data` unless `status === "completed"`, so an edit can't race the job that writes `data`. |
| Row and column caps | At most 2,000 rows, header included, and at most 50 columns (the widest row). At most 512 KB, measured as UTF-8 bytes. |
| Quoting on save | `serializeCsv` quotes only when a field needs it: a comma, a quote, CR, LF, or a leading or trailing space. Generated CSV is fully quoted, so the first save rewrites it minimally. Both forms parse the same. |
| Cell trimming | `parseCsv` never trims a field. The old view trimmed every cell. For the LLM's `"a", "b"` habit, whitespace between a closing quote and the next comma is dropped. |
| Blank lines | Lines that are completely empty are skipped. A row of empty fields (`,,`) is kept. |
| Ragged rows | `parseCsv` keeps rows ragged. `toGrid` pads every row to the widest. |
| Delete column | Confirmed with an `AlertDialog` when the column has any data, because there's no undo. An empty column is deleted at once. |
| Sorting | Sorting keeps the header and reorders the data rows. A numeric column (see `isNumericColumn`) sorts by number, with empty or non-numeric cells last in both directions. Other columns sort with `localeCompare(…, { numeric: true, sensitivity: "base" })`. |
| Hidden second panel | The notebook mounts both the desktop and the mobile Studio panel. The sheet's key handling lives on its own grid element, never on `window`, so the hidden copy never reacts. |

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`):
- Primitives get layout and sizing classes only.
- No palette colours, no arbitrary values (`[...]`) and no `dark:`.
- No border on a raw `<button>`.
- `style` may only set custom properties.
- Soft layered look: fill and shadow, `ring-hairline`, `bg-surface-raised`. No loud borders and no hand-rolled shadows.

---

## File map

| File | Change |
|---|---|
| `convex/_shared/csv.helpers.ts` | **new**: `parseCsv`, `serializeCsv` |
| `convex/_shared/csv.helpers.test.ts` | **new** |
| `convex/_agents/spreadsheet/csvHelpers.ts` | `cleanCsvOutput` uses the shared module; `parseCsvLine` is deleted |
| `convex/studio/spreadsheets/spreadsheetJobPhases.ts` | its private `cleanCsvOutput` and `parseCsvLine` are deleted; imports `cleanCsvOutput` from `csvHelpers` |
| `convex/studio/spreadsheets/index.ts` | `update` validates and stamps `editedAt`; `updateSpreadsheet` is deleted |
| `convex/studio/spreadsheets/index.test.ts` | **new**: `convex-test` coverage of `update` |
| `apps/web/src/features/studio/components/spreadsheet/sheetModel.ts` (+ test) | **new** |
| `apps/web/src/features/studio/components/spreadsheet/useSheetAutosave.ts` (+ test) | **new** |
| `apps/web/src/features/studio/components/spreadsheet/SheetGrid.tsx` (+ test) | **new** |
| `apps/web/src/features/studio/components/spreadsheet/SheetSaveStatus.tsx` | **new** |
| `apps/web/src/features/studio/services/spreadsheetsApi.ts` | `useSaveSpreadsheetData` (optimistic); maps `editedAt` |
| `apps/web/src/shared/types/index.ts` | `SpreadsheetNote`: fixes the stale comment and adds `editedAt?: number` |
| `apps/web/src/features/studio/components/views/SpreadsheetView.tsx` (+ test) | rewritten |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | `SpreadsheetView` and `spreadsheet/**` join `MIGRATED`; baseline lowered |
| `e2e/studio/spreadsheet-generation.spec.ts` | edit-and-reload test, behind the existing `E2E_AI_ENABLED` gate |

---

### Task 1: Shared CSV module

**Files:**
- Create: `convex/_shared/csv.helpers.ts`
- Test: `convex/_shared/csv.helpers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "./csv.helpers";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted commas, doubled quotes and newlines inside cells", () => {
    expect(parseCsv('"x, y","say ""hi""","line 1\nline 2"')).toEqual([
      ["x, y", 'say "hi"', "line 1\nline 2"],
    ]);
  });

  it("accepts CRLF, a trailing newline and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty cells and ragged rows", () => {
    expect(parseCsv("a,b,c\n1,,3\n4")).toEqual([["a", "b", "c"], ["1", "", "3"], ["4"]]);
  });

  it("skips blank lines but keeps a row of empty fields", () => {
    expect(parseCsv("a,b\n\n,\n")).toEqual([
      ["a", "b"],
      ["", ""],
    ]);
  });

  it("does not trim unquoted fields", () => {
    expect(parseCsv(" a , b ")).toEqual([[" a ", " b "]]);
  });

  it("drops whitespace between a closing quote and the next comma", () => {
    expect(parseCsv('"a" , "b"')).toEqual([["a", "b"]]);
  });

  it("returns no rows for empty or whitespace-only input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("treats an unterminated quote as running to the end", () => {
    expect(parseCsv('a,"b\nc')).toEqual([["a", "b\nc"]]);
  });
});

describe("serializeCsv", () => {
  it("quotes only fields that need it", () => {
    expect(
      serializeCsv([
        ["plain", "a,b", 'q"t', "two\nlines", " pad"],
        ["1", "", "3", "4", "5"],
      ])
    ).toBe('plain,"a,b","q""t","two\nlines"," pad"\n1,,3,4,5');
  });

  it("writes a lone empty field as a quoted empty string so the row survives", () => {
    expect(serializeCsv([["h"], [""]])).toBe('h\n""');
    expect(parseCsv(serializeCsv([["h"], [""]]))).toEqual([["h"], [""]]);
  });

  it("can quote every field", () => {
    expect(serializeCsv([["a", "b"]], { quoteAll: true })).toBe('"a","b"');
  });
});

describe("round trip", () => {
  const cases: string[][][] = [
    [["a", "b"], ["1", "2"]],
    [["x, y", 'say "hi"', "line 1\r\nline 2"], ["", "", ""]],
    [["only"], [""], ["z"]],
    [["a", "b", "c"], ["1"], ["2", "3"]],
  ];
  it.each(cases.map((rows) => [rows]))("parseCsv(serializeCsv(rows)) equals rows", (rows) => {
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });

  it("serializeCsv(parseCsv(x)) is stable after one normalisation", () => {
    const generated = '"Tool","Install (s)"\n"npm","38.2"\n"Bun","3.1"';
    const once = serializeCsv(parseCsv(generated));
    expect(once).toBe("Tool,Install (s)\nnpm,38.2\nBun,3.1");
    expect(serializeCsv(parseCsv(once))).toBe(once);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `bunx vitest run --config vitest.convex.config.ts convex/_shared/csv.helpers.test.ts`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Implement it**

```ts
/**
 * RFC 4180 CSV, shared by the web spreadsheet editor and the Convex spreadsheet job.
 *
 * The file name has two dots on purpose: Convex does not treat it as a function module, so it adds
 * nothing to the generated API (see convex/_testing/preloadModules.helpers.ts).
 */

/**
 * Parses CSV text into rows of fields. Quoted fields may contain commas, doubled quotes and line
 * breaks. Accepts LF or CRLF and a leading BOM. Fields are never trimmed, except that whitespace
 * between a closing quote and the next delimiter is dropped. Completely empty lines are skipped;
 * rows keep their own length (ragged rows stay ragged).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false; // a quoted field closed; ignore whitespace until the delimiter
  let rowHasContent = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = "";
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    if (rowHasContent || row.length > 1) rows.push(row);
    row = [];
    rowHasContent = false;
  };

  for (; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === ",") {
      endField();
      rowHasContent = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (afterQuote) {
      // Stray text after a closing quote: keep it rather than lose data.
      if (char !== " " && char !== "\t") field += char;
    } else if (char === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
      rowHasContent = true;
    } else {
      field += char;
      rowHasContent = true;
    }
  }
  if (field !== "" || row.length > 0 || rowHasContent || inQuotes) endRow();
  return rows;
}

const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/** Serializes rows as CSV with LF line breaks, quoting only fields that need it (or all of them). */
export function serializeCsv(rows: string[][], options: { quoteAll?: boolean } = {}): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return rows
    .map((row) => {
      // A row holding one empty field would serialize to an empty line, which parses as nothing.
      if (row.length === 1 && row[0] === "") return '""';
      return row
        .map((value) => (options.quoteAll || NEEDS_QUOTES.test(value) ? quote(value) : value))
        .join(",");
    })
    .join("\n");
}
```

Note on the "keeps a row of empty fields" test: `,` gives two empty fields and `rowHasContent` is true, so the row is kept. A blank line has no comma and no characters, so `row.length === 0` and `rowHasContent` is false, and it's skipped. A row consisting of `""` sets `rowHasContent` through the quote branch. Check each test against this before moving on, and adjust the implementation (not the tests) if one disagrees.

- [ ] **Step 4: Run the tests until they pass**

Run: `bunx vitest run --config vitest.convex.config.ts convex/_shared/csv.helpers.test.ts`
Expected: PASS (all of them).

- [ ] **Step 5: Check it adds no Convex module**

Run: `bun run check:convex-codegen`
Expected: passes, so the generated API is unchanged.

- [ ] **Step 6: Commit**

```bash
git add convex/_shared/csv.helpers.ts convex/_shared/csv.helpers.test.ts
git commit -m "feat(studio): one RFC 4180 CSV parser and serializer shared by the web app and Convex (#299)"
```

---

### Task 2: The spreadsheet job uses the shared CSV module

**Files:**
- Modify: `convex/_agents/spreadsheet/csvHelpers.ts` (`cleanCsvOutput`, delete `parseCsvLine`)
- Modify: `convex/studio/spreadsheets/spreadsheetJobPhases.ts` (delete the private `cleanCsvOutput` at about line 100 and `parseCsvLine` at about line 141)
- Test: `convex/_agents/spreadsheet/csvHelpers.test.ts` (create it if it doesn't exist)

The behaviour stays the same except that quoted cells with line breaks now survive. Before, each physical line was parsed alone, so they were split into broken rows.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { cleanCsvOutput } from "./csvHelpers";

describe("cleanCsvOutput", () => {
  it("strips a ```csv fence", () => {
    expect(cleanCsvOutput('```csv\n"a","b"\n"1","2"\n```')).toBe('"a","b"\n"1","2"');
  });

  it("returns already-quoted output unchanged", () => {
    const quoted = '"a","b"\n"1","2"';
    expect(cleanCsvOutput(quoted)).toBe(quoted);
  });

  it("re-quotes every field of unquoted output", () => {
    expect(cleanCsvOutput('a,b\n1,"x, y"')).toBe('"a","b"\n"1","x, y"');
  });

  it("keeps a quoted line break inside one cell", () => {
    expect(cleanCsvOutput('a,b\n1,"two\nlines"')).toBe('"a","b"\n"1","two\nlines"');
  });

  it("skips blank lines", () => {
    expect(cleanCsvOutput("a,b\n\n1,2")).toBe('"a","b"\n"1","2"');
  });
});
```

- [ ] **Step 2: Run them to make sure the line-break test fails**

Run: `bunx vitest run --config vitest.convex.config.ts convex/_agents/spreadsheet/csvHelpers.test.ts`
Expected: the "keeps a quoted line break" test FAILS; the others pass.

- [ ] **Step 3: Implement it**

In `csvHelpers.ts`, import `{ parseCsv, serializeCsv } from "../../_shared/csv.helpers"`. Replace the `try` block of `cleanCsvOutput` (everything after the "already quoted" early return) with:

```ts
  const rows = parseCsv(cleaned);
  if (rows.length > 0) {
    console.log("[SpreadsheetGraph] Applied RFC 4180 CSV formatting to output");
    return serializeCsv(rows, { quoteAll: true });
  }
  return cleaned;
```

Then delete `parseCsvLine`, after checking that nothing else imports it (`git grep -n parseCsvLine`).

In `spreadsheetJobPhases.ts`:
- delete the private `cleanCsvOutput` and `parseCsvLine`, along with their `// HELPER: Clean CSV output` banner;
- add `import { cleanCsvOutput } from "../../_agents/spreadsheet/csvHelpers";`.

Both `csvHelpers.ts` and `spreadsheetJobPhases.ts` start with `"use node"`, so the import is allowed.

- [ ] **Step 4: Run the tests and the existing spreadsheet tests**

Run: `bunx vitest run --config vitest.convex.config.ts convex/_agents/spreadsheet convex/studio/spreadsheets convex/_shared`
Expected: PASS.

Run: `bun run typecheck:convex`, then `bun run check:convex-codegen`.
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add convex/_agents/spreadsheet convex/studio/spreadsheets/spreadsheetJobPhases.ts convex/_shared
git commit -m "refactor(studio): the spreadsheet job cleans CSV with the shared parser, so quoted line breaks survive"
```

---

### Task 3: One validated `update` mutation

**Files:**
- Modify: `convex/studio/spreadsheets/index.ts`
- Test: `convex/studio/spreadsheets/index.test.ts` (new)

**Before writing code,** read `convex/_generated/ai/guidelines.md`.

**What `update` must do:**
- **Arguments:** `{ id: v.id("spreadsheets"), title: v.optional(v.string()), data: v.optional(v.string()) }`.
  - The `metadata` argument is removed. Nothing passes it (`git grep -n "spreadsheets.index.update"` shows only `useRenameSpreadsheet`, which sends `{ id, title }`), and it let a client replace the whole metadata object.
  - `data` becomes `v.string()`, so a non-string is rejected by the validator.
- **Order:**
  1. Authenticate: `"Unauthenticated"`.
  2. Load the document: `"Spreadsheet not found"`.
  3. `assertCanEditNotebook`.
  4. Then, if `data` is set, check the following, each failing with `throw toConvexError(new InputValidationError(message, { field: "data" }))` (from `../../_lib/errors` and `../../_lib/serviceErrors`):
     - `existing.status !== "completed"` → `"This spreadsheet can't be edited until it has finished generating."`
     - UTF-8 size over `SPREADSHEET_MAX_BYTES` (512 × 1024, measured with `new TextEncoder().encode(data).length`) → `"This spreadsheet is too large to save (512 KB at most)."`
     - `parseCsv(data)` has more than `SPREADSHEET_MAX_ROWS` (2,000, header included) rows → `"This spreadsheet has too many rows to save (2,000 at most)."`
     - The widest row has more than `SPREADSHEET_MAX_COLUMNS` (50) fields → `"This spreadsheet has too many columns to save (50 at most)."`
- **On success with `data`:** patch `data` and `metadata: { ...(existing.metadata ?? {}), editedAt: Date.now() }`.
- **On a title-only call:** patch only the title. `editedAt` is untouched.
- **Return value:** the updated document, as today.
- **Constants:** export the three, named as above, from `convex/studio/spreadsheets/index.ts` so the web app can import them for messages if needed. They are not functions, so the API types don't change.
- **Delete the public `updateSpreadsheet` mutation** and check nothing references it: `git grep -n "updateSpreadsheet\b" -- apps e2e evals convex` should show only the `_model` helper of the same name, which stays.

- [ ] **Step 1: Write the failing tests**

Follow `convex/studio/prompts/index.test.ts` for the module glob, `preloadModules(modules, ["./studio/spreadsheets/index.ts"])`, `seedUser`, `seedNotebook` and `withIdentity`. Copy `seedNotebook`'s fields from that file. Seed a spreadsheet directly:

```ts
async function seedSpreadsheet(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">,
  overrides: Partial<{ status: string; data: unknown }> = {}
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("spreadsheets", {
      userId,
      notebookId,
      title: "Sheet",
      data: '"a","b"\n"1","2"',
      status: "completed",
      metadata: { spreadsheetType: "comparison_table", documentIds: [] },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    })
  );
}
```

The tests:
1. **An owner saves new CSV.** `data` changes, `metadata.editedAt` is a number, and `metadata.spreadsheetType` is still `"comparison_table"`.
2. **A title-only rename** changes the title and leaves `metadata.editedAt` undefined.
3. **Another user** gets `rejects.toThrow("Notebook not found")`.
4. **No identity** gets `rejects.toThrow("Unauthenticated")`.
5. **A non-string `data`** (`{ data: 42 as unknown as string }`) is rejected (`rejects.toThrow()`).
6. **Over 512 KB:** `"x".repeat(512 * 1024 + 1)` is rejected with `expect.objectContaining({ data: expect.objectContaining({ type: "INPUT_VALIDATION_ERROR" }) })`. Use `rejects.toMatchObject` or catch and inspect `ConvexError.data`, whichever convex-test surfaces. Check once and use it consistently.
7. **2,001 rows** (`Array.from({ length: 2001 }, (_, i) => String(i)).join("\n")`) are rejected; exactly 2,000 rows are accepted.
8. **51 columns** are rejected; 50 are accepted.
9. **A `generating` spreadsheet** rejects `data`, but a title rename still works.
10. **`updateSpreadsheet` is gone:** `expect("updateSpreadsheet" in api.studio.spreadsheets.index).toBe(false)`. If the `api` proxy makes `in` unreliable, drop this test and rely on typecheck instead.

- [ ] **Step 2: Run them to make sure they fail**

Run: `bunx vitest run --config vitest.convex.config.ts convex/studio/spreadsheets/index.test.ts`
Expected: the validation and `editedAt` tests FAIL.

- [ ] **Step 3: Implement `update` as described above.**

- [ ] **Step 4: Run the tests and the gates**

Run: the test file again (PASS); then `bun run typecheck:convex`, `bun run typecheck:web` and `bun run check:convex-codegen`.

- [ ] **Step 5: Commit**

```bash
git add convex/studio/spreadsheets/index.ts convex/studio/spreadsheets/index.test.ts
git commit -m "feat(studio): spreadsheet update validates CSV size and shape and marks edits; drop the duplicate mutation (#299)"
```

---

### Task 4: Pure sheet model

**Files:**
- Create: `apps/web/src/features/studio/components/spreadsheet/sheetModel.ts`
- Test: `apps/web/src/features/studio/components/spreadsheet/sheetModel.test.ts`

A `Grid` is `string[][]`. Row 0 is the header, and every row has the same length. Every operation returns a new grid and never mutates its input.

```ts
import { parseCsv, serializeCsv } from "@convex/_shared/csv.helpers";

export type Grid = string[][];

/** Parses CSV and pads every row to the widest one (at least one column). */
export function toGrid(csv: string): Grid;
export function toCsv(grid: Grid): string; // serializeCsv(grid)
export function columnCount(grid: Grid): number; // grid[0]?.length ?? 0
export function setCell(grid: Grid, row: number, col: number, value: string): Grid; // same grid object back when unchanged
export function addRow(grid: Grid): Grid; // appends a row of "" with the grid's width
export function insertColumn(grid: Grid, afterCol: number, header?: string): Grid; // header defaults to "Column N" where N = new 1-based index; afterCol = -1 inserts first
export function deleteColumn(grid: Grid, col: number): Grid; // never deletes the last remaining column (returns the grid unchanged)
export function columnHasData(grid: Grid, col: number): boolean; // any non-blank data cell (header excluded)
/** True when every non-blank data cell parses as a number; needs at least one such cell. */
export function isNumericColumn(grid: Grid, col: number): boolean;
export function sortByColumn(grid: Grid, col: number, direction: "asc" | "desc"): Grid;
```

**Number parsing for `isNumericColumn` and sorting:**
- Trim the cell, then strip one leading currency symbol (`$ € £ ¥`), thousands commas and one trailing `%`.
- Then `Number(x)` must be finite, and the cell must not be empty after trimming.
- Treat `—`, `-` and `N/A` (case-insensitive) as blank.

**Sort rules:**
- The header stays first.
- **Numeric columns** compare numerically. Blank or non-numeric cells sort last in both directions.
- **Other columns** use `a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })`. Blank cells sort last in both directions.
- The sort is stable (`Array.prototype.sort` is stable).

- [ ] **Step 1: Write the failing tests.** Cover:
  - `toGrid` padding ragged rows, and an empty string giving `[[""]]`;
  - the round trip `toCsv(toGrid(x))`;
  - `setCell` returning the same reference when the value is unchanged;
  - `addRow` width;
  - `insertColumn` naming (a grid with three columns, inserted after 0, gets the header `"Column 2"`) and its position;
  - `deleteColumn` refusing to delete the last column;
  - `columnHasData`;
  - `isNumericColumn` with `$1,200`, `12%`, `—` and a text cell;
  - `sortByColumn`, asc and desc, for numbers (blanks last both ways) and for text ("item 2" before "item 10");
  - input not mutated (deep-freeze the input with `Object.freeze` on each row and on the grid).

- [ ] **Step 2: Run them to make sure they fail.** `bun run test src/features/studio/components/spreadsheet/sheetModel.test.ts` (from `apps/web`).

- [ ] **Step 3: Implement it.**

- [ ] **Step 4: Run them until they pass.**

- [ ] **Step 5: Commit.** `feat(studio): pure grid operations for the spreadsheet sheet`

---

### Task 5: Save hook and autosave

**Files:**
- Modify: `apps/web/src/features/studio/services/spreadsheetsApi.ts`
- Modify: `apps/web/src/shared/types/index.ts` (`SpreadsheetNote`)
- Create: `apps/web/src/features/studio/components/spreadsheet/useSheetAutosave.ts`
- Test: `apps/web/src/features/studio/components/spreadsheet/useSheetAutosave.test.ts`

**`spreadsheetsApi.ts`:**
- **`useSaveSpreadsheetData()`** returns `(spreadsheetId: string, data: string) => Promise<unknown>`. It calls `api.studio.spreadsheets.index.update` with `{ id, data }` and an optimistic update that patches `data` in the `get({ id })` cache and in the `list({ notebookId })` cache, the same way `useRenameSpreadsheet` patches `title`. It doesn't touch metadata optimistically; the server's `editedAt` arrives through the query.
  - Both hooks call `useMutation(api.studio.spreadsheets.index.update)` with different optimistic updates. Keep them as two hooks.
- **`mapSpreadsheetToNote`** also copies `editedAt: dbSpreadsheet.metadata?.editedAt` (a number, or undefined).
- **`SpreadsheetNote`:**
  - the comment becomes `// CSV text (RFC 4180; see convex/_shared/csv.helpers.ts)`;
  - add `editedAt?: number` to its `metadata`;
  - add `"literature_review"` to `spreadsheetType` if `getSpreadsheetTypeLabel` already handles it (it does).

**`useSheetAutosave`:**

```ts
export type SaveState = "idle" | "saving" | "saved" | "error";

export function useSheetAutosave(options: {
  /** The CSV the sheet currently shows. A change schedules a save. */
  csv: string;
  /** The CSV last known to be on the server (from the query). */
  serverCsv: string;
  save: (csv: string) => Promise<unknown>;
  /** A save the server refused for good (validation): roll the sheet back to this CSV. */
  onRejected: (lastGoodCsv: string, error: unknown) => void;
  enabled: boolean;
}): { state: SaveState; retry: () => void; flush: () => void };
```

**Behaviour:**
- **Debounce:** `SAVE_DEBOUNCE_MS = 800` after the last change of `csv`. Nothing is saved when `csv` equals the last saved or confirmed CSV. The latter starts as `serverCsv`.
- **In flight:**
  - A change during a save waits for the save to finish, then saves the newest CSV. At most one save is in flight.
  - The state is `"saving"` while a save is pending (debounce running or in flight) and `"saved"` after a success.
  - It's `"idle"` before the first edit; the view shows "Saved · Edited" or nothing from `editedAt` in that state.
- **Errors:** classify with `parseServiceError(err)?.kind === "input_validation"`, imported from `@/shared/utils/errorParser`.
  - **Validation:** call `onRejected(lastGoodCsv, err)`. `lastGoodCsv` is the last CSV the server accepted, or `serverCsv` if none. The state becomes `"saved"` (nothing is pending once the sheet rolls back), and there's no retry.
  - **Any other error:** the state becomes `"error"` and one automatic retry is scheduled after `RETRY_DELAY_MS = 3000`.
    - If that retry fails too, the state stays `"error"` until `retry()` is called or the sheet changes again.
    - `retry()` saves the current CSV at once.
- **`flush()`** saves at once if anything is pending.
- **Unmount:** flush any pending debounced save (as `WrittenQuestionsView`'s `flushDraft` does), using the latest `csv` read from a ref. Don't flush when `enabled` is false.
- **Stale updates:** ignore results that arrive after unmount when deciding state. Use an `isMounted` ref; never call `setState` after unmount.

- [ ] **Step 1: Write the failing tests** with `renderHook`, `vi.useFakeTimers()` and a `save` mock that returns controllable promises. Cover:
  - no save before 800 ms, then exactly one save with the latest CSV after several quick changes;
  - no save when the CSV returns to the saved value;
  - the state sequence idle → saving → saved;
  - a change during an in-flight save producing a second save with the newest CSV after the first resolves;
  - a non-validation failure → `"error"`, an automatic retry after 3 s, success → `"saved"`;
  - two failures → stays `"error"`, `retry()` saves again;
  - a validation failure (reject with `new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: "too big" })` from `convex/values`) → `onRejected` called with the last good CSV, no retry;
  - unmount with a pending debounce → `save` called once with the latest CSV;
  - `enabled: false` → never saves.

- [ ] **Step 2: Run them to make sure they fail.**

- [ ] **Step 3: Implement it.** Use refs for the timers, the in-flight promise, the latest CSV and the last-good CSV. Clear every timer on unmount.

- [ ] **Step 4: Run them until they pass**, then run `bun run typecheck:web`.

- [ ] **Step 5: Commit.** `feat(studio): spreadsheet autosave with debounce, flush on close, and one retry`

---

### Task 6: `SheetGrid`

**Files:**
- Create: `apps/web/src/features/studio/components/spreadsheet/SheetGrid.tsx`
- Test: `apps/web/src/features/studio/components/spreadsheet/SheetGrid.test.tsx`

**Props:**

```ts
interface SheetGridProps {
  grid: Grid;
  readOnly: boolean;
  /** Called with the next grid after any edit. The parent owns the grid. */
  onChange: (next: Grid) => void;
}
```

**Structure.** The view owns scrolling: the grid's outer element is the scroll container.
- **Outer element:** a `div` with `role="grid"`, `aria-label="Spreadsheet"`, `aria-rowcount`, `aria-colcount`, `aria-readonly={readOnly || undefined}` and `tabIndex={0}`. Its classes are `relative min-h-0 flex-1 overflow-auto rounded-xl bg-card shadow-xs ring-1 ring-hairline` (the soft card from the mockup). It handles `onKeyDown`.
- **Inside it:** a `<table className="min-w-full border-separate border-spacing-0 text-sm">`, built with plain `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>` and `<td>`. There is no Table primitive yet; PR 8 adds one. Use `role="row"`, `role="columnheader"`, `role="rowheader"` and `role="gridcell"` so the ARIA grid pattern holds.
- **Header row:** `sticky top-0 z-20` with `bg-muted`.
  - **The corner cell** is also `sticky left-0 z-30`.
  - **Each column header** is a `DropdownMenu`, whose trigger is a full-width `<button type="button">` with no border (`flex w-full items-center gap-1.5 px-3 py-2 font-sans text-xs font-semibold text-muted-foreground hover:text-foreground`). The trigger shows the header text (`Column N` in italics when empty) and a `ChevronDown` icon. The icon is always visible at `opacity-60`, so nothing is hover-only.
  - **When `readOnly`**, the header is plain text with no menu.
- **Row numbers:** a `<th scope="row">` in every body row, `sticky left-0 z-10 bg-muted text-center font-sans text-xs text-muted-foreground tabular-nums`.
- **Cells:** a `<td role="gridcell">` with `aria-selected` on the selected cell, holding a `div` with `px-3 py-2 whitespace-pre-wrap` that shows the value.
  - **Number columns** (`isNumericColumn`) add `text-right tabular-nums`.
  - **Hairlines between cells:** `border-b border-r border-hairline` on `td` and `th` (`--color-hairline` is a token in `index.css`). Don't copy the mockup's inset shadow, which would need an arbitrary value. Remove the right border on the last column.
  - **The selected cell** gets `ring-2 ring-primary ring-inset rounded-sm` on its inner `div`.
- **Editing a cell:**
  - While editing, the inner `div` is replaced by a `<textarea>`, not an `<input>`, because cells may contain line breaks. It has `rows={1}`, auto-height via `field-sizing-content` (Tailwind v4 has `field-sizing-content`), `aria-label="Edit {column header}, row {n}"`, and these classes: `block w-full resize-none bg-card px-3 py-2 outline-hidden ring-2 ring-primary ring-inset rounded-sm shadow-md`.
  - Don't restyle the shadcn `Textarea` primitive; use a raw `textarea` here, as the mockup's cell editor is not a form field.
- **Changed-cell flash:** after a committed edit, the cell gets `bg-success-muted` for 900 ms, then returns to transparent with `transition-colors duration-700 ease-out`. Keep a `Set` of flashing `"r:c"` keys in state with timeouts, and clear the timeouts on unmount.
- **Add row:** a last `<tr>` whose cell spans every column holds a `Button variant="ghost" size="sm"` "+ Add row" (a `Plus` icon plus the text "Add row"). It appends a row, selects its first cell and starts editing.
- **Add column:** a last header `<th>` holds a `Button variant="ghost" size="icon-sm" aria-label="Add column"` with a `Plus` icon. It appends a column, starts editing its header cell and scrolls it into view with `scrollIntoView({ inline: "nearest", block: "nearest" })`.
- **The empty trailing cell** under the add-column header is a plain `td`.
- **When `readOnly`:** no add row, no add column, no editing, no menus. Selection and arrow keys still work, for reading.

**Selection and keys.** The state is `selected: { row: number; col: number } | null` and `editing: { row, col, draft: string, original: string } | null`. Header editing is row 0; body rows are 1…n.
- **Pointer:**
  - Clicking a body cell selects it and focuses the grid element (`preventScroll`).
  - Clicking the already selected cell starts editing. This is the phone rule: tap to select, tap again to edit. It also works with a mouse.
  - Double-clicking starts editing.
- **When not editing** (keys on the grid element):
  - Arrows move the selection within body rows and columns, clamped.
  - Tab and Shift+Tab move right and left, wrapping to the next or previous row; at the edges, let focus leave the grid by not calling `preventDefault`.
  - Enter or F2 starts editing with the current value.
  - Any single printable character (`key.length === 1` with no Ctrl, Meta or Alt) starts editing with that character as the draft.
  - Delete or Backspace clears the cell (an edit plus the flash).
  - Home and End go to the first or last column.
  - The selected cell is scrolled into view (`scrollIntoView({ block: "nearest", inline: "nearest" })`).
  - With no selection, any arrow selects (1, 0).
- **When editing** (keys on the textarea):
  - **Enter** without Shift commits and moves down one row. On the last row it just commits.
  - **Shift+Enter** inserts a line break (the default).
  - **Tab** commits and moves right; **Shift+Tab** commits and moves left.
  - **Escape** cancels and restores the original.
  - Commit on blur too, unless the blur came from Escape.
  - A commit calls `onChange(setCell(grid, row, col, draft))` only when the draft differs from the original. Header edits (row 0) don't flash.
  - After commit or cancel, focus returns to the grid element with `preventScroll`.
- **Selection and the menu:** don't move the selection into the header row with the arrows. The header row is reached only through its menu's Rename.

**Column menu** (`DropdownMenuContent align="start"`):
- **Items:**
  - "Sort A → Z" (icon `ArrowDownAZ`) and "Sort Z → A" (`ArrowDownZA`). For number columns, label them "Sort smallest first" and "Sort largest first", with the same actions.
  - "Insert column right" (`ArrowRightToLine` or `Columns3`).
  - "Rename" (`Pencil`): starts editing the header cell of that column.
  - A separator, then "Delete column" with `variant="destructive"` (`Trash2`).
- **Delete column:** disabled when only one column is left. When `columnHasData`, it opens an `AlertDialog`: "Delete column “{header}”?", with the body "Its {n} filled cells will be removed. This can't be undone." and actions Cancel / Delete (destructive). Otherwise it deletes at once.
- **After a sort,** keep the selection on the same column at row 1.

- [ ] **Step 1: Write the failing tests** (Testing Library plus `userEvent`, with the `Element.prototype.scrollIntoView` stub that jsdom lacks):
  - It renders the headers, row numbers and cells.
  - A number column's cells have `text-right`.
  - Clicking a cell gives it `aria-selected="true"`; clicking it again shows the editor textbox.
  - Typing a character on the selected cell starts editing with that character; Enter commits → `onChange` with the new grid, and the selection moves down.
  - Escape cancels, so `onChange` isn't called.
  - Tab commits and moves right.
  - Delete clears the cell.
  - Arrows move the selection; Home and End work.
  - "Add row" → `onChange` with one more row, and its first cell is being edited.
  - "Add column" → `onChange` with one more column, and its header is being edited.
  - Menu Sort A → Z → `onChange` with sorted rows. Use `DropdownMenu` in jsdom: open it with `userEvent.click` on the trigger; Radix menus need `pointerdown`, which `userEvent` sends.
  - Menu Rename → the header editor; type and Enter → `onChange` with the header changed.
  - Menu Delete on a column with data → the alert dialog; confirming → `onChange` without that column. Delete on an empty column → immediate.
  - `readOnly` → no "Add row", no menu trigger buttons, and double-click doesn't edit.
  - The flash class appears on an edited cell and goes after 900 ms (fake timers).

- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass**, plus `bun run typecheck:web` and `bunx eslint src/features/studio/components/spreadsheet` from `apps/web` (expect 0 findings once Task 7 adds the folder to `MIGRATED`; for now run `bun run lint:design` and confirm no new findings).

- [ ] **Step 5: Commit.** `feat(studio): editable spreadsheet grid with keyboard editing and a column menu (#299)`

---

### Task 7: `SpreadsheetView` and the save status

**Files:**
- Create: `apps/web/src/features/studio/components/spreadsheet/SheetSaveStatus.tsx`
- Rewrite: `apps/web/src/features/studio/components/views/SpreadsheetView.tsx`
- Test: `apps/web/src/features/studio/components/views/SpreadsheetView.test.tsx`
- Modify: `apps/web/eslint.config.mjs` (add `"src/features/studio/components/views/SpreadsheetView.tsx"` and `"src/features/studio/components/spreadsheet/**/*.tsx"` to `MIGRATED`, after the flashcards entries)
- Modify: `apps/web/design-lint-baseline.json` (`bun run lint:design:update`)

**`SheetSaveStatus({ state, editedAt, onRetry })`:** a `role="status"` `aria-live="polite"` span, `inline-flex items-center gap-1.5 font-sans text-xs text-muted-foreground`, with a 6 px dot (`size-1.5 rounded-full`).

| State | Dot | Text |
|---|---|---|
| `saving` | `bg-muted-foreground animate-pulse` | "Saving…" |
| `saved`, or `idle` with `editedAt` | `bg-success` | "Saved · Edited" |
| `idle` without `editedAt` | none | nothing (render `null`, but keep the live region mounted as an empty span so later updates are announced) |
| `error` | `bg-destructive` | "Couldn't save ·", then a `Button variant="link" size="sm"` "Retry" that calls `onRetry` (layout classes only, e.g. `h-auto p-0`) |

The `title` attribute on "Edited" is the formatted `editedAt` date (`toLocaleString()`).

**`SpreadsheetView({ note, onBack })`** keeps its props and export names (`SpreadsheetView`, `SpreadsheetViewProps`).
- **State:**
  - `grid`, initialised with `toGrid(note.content)`.
  - `csv = useMemo(() => toCsv(grid), [grid])`.
  - `serverCsv = note.content`.
- **Resync from the server:** when `note.content` changes and the autosave is not pending, meaning `state !== "saving"` and the local CSV equals the last CSV this view saved or loaded, replace `grid` with `toGrid(note.content)`.
  - This is how a regenerate, or the other (hidden) panel's save, shows up.
  - Track "the last CSV this view saved or loaded" in a ref, updated on load, on resync and when a save resolves. Don't compare against `note.content` directly, because the optimistic update makes them equal early.
- **`readOnly`** is `note.status !== "completed"`.
- **`useSheetAutosave`:**
  - `save` is `(data) => saveData(note.id, data)`, from `useSaveSpreadsheetData`;
  - `enabled` is `!readOnly`;
  - `onRejected(lastGood, err)` does `setGrid(toGrid(lastGood))` and `showError(err)`, from `useServiceErrorToast`.
- **Layout:** a column flex filling the panel (`flex h-full min-h-0 flex-col bg-background`) with the PR 1 entrance (`animate-in fade-in slide-in-from-right-4 duration-300 ease-out`), containing:
  1. **Mobile back bar** (only when `onBack`): `md:hidden`, sticky, with a `Button variant="ghost" size="icon" aria-label="Back to Studio"` and an `ArrowLeft` icon, plus the truncated title. Keep the label; e2e and tests may use it.
  2. **Header row:**
     - `flex items-center gap-3 px-4 pt-4 pb-3`;
     - the title in `font-display text-base font-semibold truncate flex-1`, hidden on mobile when the back bar shows it (`hidden md:block` when `onBack` is set, else always);
     - `<SheetSaveStatus />`;
     - a `Button variant="ghost" size="icon-sm" aria-label="Download CSV"` with a `Download` icon. It downloads `toCsv(grid)` as `${safeFileName(note.title)}.csv`, using a `Blob` with `text/csv;charset=utf-8`, a `﻿` BOM (so Excel reads UTF-8), and a temporary object URL that's revoked afterwards. `safeFileName` replaces `[\\/:*?"<>|]` with `-`, trims, and falls back to `"spreadsheet"`.
  3. **Failed banner** (`status === "failed"`): the `Alert variant="destructive"` primitive, with the title "Spreadsheet generation failed" and the same error-message extraction as today, inside `px-4 pb-3`.
  4. **Body:**
     - with content (`note.content.trim()` is non-empty and the grid has a non-empty header): `<div className="flex min-h-0 flex-1 flex-col px-3 pb-3"><SheetGrid … /></div>`;
     - otherwise: `Empty` with `EmptyMedia variant="icon"` (`Table2`, or `XCircle` when failed), and the title "No data to display" (or "Spreadsheet generation failed" when failed).
  5. **A hint line**, desktop only, when editable: `hidden md:block px-4 pb-3 font-sans text-xs text-muted-foreground` with the text "Click a cell, then type to edit · Enter, Tab and the arrow keys move · Esc cancels".
- **Flush on close:** the autosave unmount flush covers it.
- **`ActiveNoteView.tsx`** doesn't change (it passes `note` and `onBack={undefined}`). Check that the JSON fallback (`JSON.stringify(data)` for non-string `data`, such as the `{}` a generating row starts with) shows the empty state, not a grid of `{}`. Treat content that isn't valid CSV-like text the same way: if `note.content` is `"{}"`, show the empty state. Simplest: `const hasTable = note.status === "completed" && typeof note.content === "string" && note.content.trim() !== "" && note.content.trim() !== "{}"`.

- [ ] **Step 1: Write the failing tests.** Mock `useSaveSpreadsheetData` and `useServiceErrorToast` with `vi.mock` on their modules.
  - It renders a completed note's grid, with the title and "Download CSV".
  - Editing a cell → after 800 ms (fake timers) `save` is called with the expected CSV; the status shows "Saving…", then "Saved · Edited".
  - A generating or failed note → read-only (no "Add row"); a failed note shows the destructive alert.
  - Empty or `{}` content → "No data to display".
  - A server `note.content` change with no pending edits → the grid shows the new data (rerender with a new prop).
  - A validation rejection → the grid rolls back and `showError` is called.
  - Download → `URL.createObjectURL` is called with a Blob whose text starts with the BOM and equals the CSV (stub `createObjectURL` and `revokeObjectURL`, and spy on `HTMLAnchorElement.prototype.click`).
  - `onBack` → the back button with the name "Back to Studio" calls it.

- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass.**

- [ ] **Step 5: Lint gates.** From the root:
  - `bun run lint:design`: it fails only because the counts went down, so run `bun run lint:design:update` and check that the baseline diff only lowers counts;
  - `bun run lint`;
  - `bun run typecheck:web`.
  - From `apps/web`: `bunx eslint src/features/studio/components/views/SpreadsheetView.tsx src/features/studio/components/spreadsheet`, with 0 errors.

- [ ] **Step 6: Commit.** `feat(studio): spreadsheets become an always-editable sheet that autosaves (#299)`

---

### Task 8: End-to-end test behind the AI gate

**Files:**
- Modify: `e2e/studio/spreadsheet-generation.spec.ts`

Add `test("edits a cell and keeps it after a reload", …)` inside the same `E2E_AI_ENABLED`-gated block as "transitions to completed status". Reuse its setup: seed a pasted source, create a "Data Table" spreadsheet, and wait for completion. Then:
1. Open the note: click `firstStudioNoteCard`.
2. In `page.getByRole("grid", { name: "Spreadsheet" })`, click the first body `gridcell` and click it again to edit.
3. Fill the textbox with a unique value (`e2e-${Date.now()}`) and press Enter.
4. Expect the `status` to reach `Saved · Edited`.
5. `page.reload()`, reopen the note, and expect the grid to contain the value.

Note: the notebook renders two Studio panels; scope the locators to the visible one, as other Studio specs do (check `e2e/helpers/studio-assertions.ts`).

Run: `bunx playwright test --list e2e/studio/spreadsheet-generation.spec.ts`. Expect the new test to be listed. It's skipped without `E2E_AI_ENABLED`, which costs credits, so don't run it for real.

Commit: `test(e2e): editing a spreadsheet cell survives a reload`

---

### Task 9: Gates and PR (controller)

- `bun run typecheck:web`, then `bun run typecheck:convex`.
- `bun run lint`, `bun run lint:design`, `bun run knip`, and `bun run check:convex-codegen`.
- `bun run test:web`, and `bunx vitest run --config vitest.convex.config.ts convex/studio/spreadsheets convex/_shared convex/_agents/spreadsheet`.
- `bunx playwright test --list` (count only).
- A visual check in a background browser tab of the dev server: desktop 1440px and phone 375px, light and dark, reduced motion on and off. Edit, sort, add a row and a column, delete a column, download, and check that a reload keeps the edits.
  - This writes to the user's own spreadsheet on the dev deployment, which needs the Convex change deployed. Ask the user first, since deploying to dev was declined for PR 4.
- Open the PR with `Closes #299` and `Part of #264`.
