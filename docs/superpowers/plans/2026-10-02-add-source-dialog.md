# Add-source dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nine hand-built add-source modals with one shadcn `Dialog` that switches between steps, in the soft layered house style.

**Architecture:**
- `AddSourceDialog` owns a `step` state and renders either `AddSourceMenu` or one form component.
- Forms are plain components with a small contract: `onDone()` closes the dialog, and `onBusyChange(busy)` blocks closing while work runs.
- `SourcesPanel` keeps the open state and the upload handlers.

**Tech Stack:**
- React 19
- Radix via shadcn/ui primitives in `apps/web/src/shared/components/ui`
- Tailwind v4
- vitest + Testing Library
- Playwright e2e at the repo-root `e2e/`

**Spec:** `docs/superpowers/specs/2026-10-02-add-source-dialog-design.md`.

**Deviation from the spec:** Website and Transcripts share one `LinkForm` with `kind: "website" | "video"`. The two old modals differed only in copy and icon; this mirrors the Zotero/Mendeley decision.

**Branch and worktree:** `feature/ds-migrate-sources-dialogs`, in the session worktree `C:/Users/samin/Documents/GitHub/SolomindLM/.claude/worktrees/premium-ui-shadcn-linter-74efdb`.
- Work there with Read/Edit/Write/Bash.
- **Do not use Serena**: it is bound to the main checkout and would edit the wrong tree.
- Run commands from the repo root unless noted.

**Ground rules for every task:**
- Use only semantic tokens: no palette colours, no `dark:`, no `bg-black/NN`, no `border-2`, no `border-primary` unless state-gated, no borders on `<button>`, no arbitrary values, no inline styles.
- Controls are sans (Buttons already are). Headings use `font-display`.
- **Process kills:** never kill processes by name, and use test timeouts.
- **Formatting:** after editing, run `bunx biome format --write <changed files>`, because Serena-style CRLF breaks Biome.
- **Commits:** conventional commits, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Test commands:**
  - Unit tests: `bun run --cwd apps/web test -- <path> --run` (or `bunx vitest run <path>` from `apps/web`).
  - Full suite: `bun run test:web`.

---

## File structure

All new files live under `apps/web/src/features/sources/components/add-source/`:

| File | Responsibility |
|---|---|
| `types.ts` | `AddSourceStep`, `StepFormProps`, `useReportBusy` |
| `LinkForm.tsx` (+ test) | Website and video URL textarea, URL validation |
| `TextForm.tsx` (+ test) | Pasted-text textarea |
| `DoiForm.tsx` (+ test) | Resolve a DOI, preview card, add |
| `ManualPaperForm.tsx` (+ test) | Labelled paper fields, add |
| `PaperFileDrop.tsx` | Hidden file input plus a "Choose file" button and the chosen name |
| `BibtexImportForm.tsx` (+ test) | Tabs (file/paste), parse, checkbox list, bulk import |
| `LibraryImportForm.tsx` (+ test) | Zotero/Mendeley `.bib` import with dedupe |
| `AddSourceMenu.tsx` | Drop zone, option groups, warnings |
| `AddSourceDialog.tsx` (+ test) | Dialog shell, step state, header, footer, close rules |

Other files:

| File | Change |
|---|---|
| `features/sources/lib/paperDedupe.ts` (+ test) | `paperKey`, `splitNewPapers` |
| `shared/components/ui/progress.tsx` | New (shadcn CLI) |
| `features/sources/components/SourcesPanel.tsx` | Wiring |
| `AddSourceModal.tsx`, `UrlInputModal.tsx`, `SocialMediaInputModal.tsx`, `TextInputModal.tsx`, `DoiInputModal.tsx`, `ManualPaperModal.tsx`, `BibtexImportModal.tsx`, `ZoteroImportModal.tsx`, `MendeleyImportModal.tsx` | Delete (Task 9) |
| `e2e/helpers/navigation.ts`, `e2e/helpers/source-assertions.ts`, `e2e/sources/add-source-modal.spec.ts`, `e2e/sources/file-uploads.spec.ts`, `e2e/sources/url-ingestion.spec.ts` | Selectors |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | Enforcement |

---

### Task 1: Progress primitive

**Files:**
- Create: `apps/web/src/shared/components/ui/progress.tsx` (CLI)
- Modify: `apps/web/src/shared/components/ui/ui.smoke.test.tsx`

- [ ] **Step 1: Add with the CLI**

From `apps/web`, run `bunx --bun shadcn@latest add progress`. Then apply the usual post-add fixes:
- If the CLI wrote `import { cn } from "cn"`, rewrite it to `import { cn } from "@/shared/utils/cn"`.
- If `package.json` gained `cn` or `next-themes`, remove them and re-run `bun install`.
- Check `git diff apps/web/package.json bun.lock`. It should be unchanged, or show only `radix-ui`, which is already a dependency.

- [ ] **Step 2: Adapt to tokens and add the destructive tone**

Replace the file body with:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const progressIndicatorVariants = cva("h-full w-full flex-1 rounded-full transition-all", {
  variants: {
    tone: { default: "bg-primary", destructive: "bg-destructive" },
  },
  defaultVariants: { tone: "default" },
});

function Progress({
  className,
  value,
  tone,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressIndicatorVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ tone })}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
```

Keep whatever import form the CLI produced for `radix-ui` if it differs (the other ui files use `import { X as XPrimitive } from "radix-ui"`).

- [ ] **Step 3: Smoke test**

Add to `ui.smoke.test.tsx`, following the file's existing `it(...)` style:

```tsx
it("Progress exposes a progressbar with its value and a destructive tone", () => {
  render(<Progress value={40} tone="destructive" aria-label="Source limit" />);
  const bar = screen.getByRole("progressbar", { name: "Source limit" });
  expect(bar).toHaveAttribute("aria-valuenow", "40");
  expect(bar.querySelector("[data-slot=progress-indicator]")?.className).toContain(
    "bg-destructive"
  );
});
```

Run `bunx vitest run src/shared/components/ui/ui.smoke.test.tsx` from `apps/web`. Expected: PASS.

- [ ] **Step 4: Commit**

Message: `feat(web): Progress primitive with a destructive tone`.

---

### Task 2: Paper dedupe helper (TDD)

**Files:**
- Create: `apps/web/src/features/sources/lib/paperDedupe.ts`
- Test: `apps/web/src/features/sources/lib/paperDedupe.test.ts`

The keys must match `convex/documents/getExistingPapers.ts`:
- DOIs are lowercased and trimmed.
- The title hash is `title.toLowerCase().trim() + "|" + firstAuthor.split(",")[0].trim().toLowerCase()`.

Read that file first to confirm, and match it exactly if it differs.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { paperKeys, splitNewPapers } from "./paperDedupe";

const existing = { dois: ["10.1/abc"], titleHashes: ["paper one|smith"] };

describe("paperKeys", () => {
  it("normalises the DOI and the title|first-author-surname hash", () => {
    expect(paperKeys({ title: " Paper One ", authors: ["Smith, Jane"], doi: " 10.1/ABC " })).toEqual({
      doi: "10.1/abc",
      titleHash: "paper one|smith",
    });
  });
  it("omits keys it cannot build", () => {
    expect(paperKeys({ title: "T", authors: [] })).toEqual({ doi: undefined, titleHash: undefined });
  });
});

describe("splitNewPapers", () => {
  it("treats a DOI match (any case) as a duplicate", () => {
    const r = splitNewPapers([{ title: "X", authors: [], doi: "10.1/ABC" }], existing);
    expect(r.fresh).toHaveLength(0);
    expect(r.duplicates).toHaveLength(1);
  });
  it("falls back to the title and first author surname", () => {
    const r = splitNewPapers([{ title: "Paper One", authors: ["Smith, J."] }], existing);
    expect(r.duplicates).toHaveLength(1);
  });
  it("keeps papers that match nothing", () => {
    const paper = { title: "New", authors: ["Doe, A."], doi: "10.9/zzz" };
    expect(splitNewPapers([paper], existing)).toEqual({ fresh: [paper], duplicates: [] });
  });
  it("keeps everything while the existing set is still loading", () => {
    const paper = { title: "Paper One", authors: ["Smith, J."] };
    expect(splitNewPapers([paper], undefined)).toEqual({ fresh: [paper], duplicates: [] });
  });
});
```

Run `bunx vitest run src/features/sources/lib/paperDedupe.test.ts` from `apps/web`. Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

```ts
/** Keys shared with convex/documents/getExistingPapers.ts, so imports skip papers already in a notebook. */
export interface DedupablePaper {
  title: string;
  authors: string[];
  doi?: string;
}

export interface ExistingPaperKeys {
  dois: string[];
  titleHashes: string[];
}

export function paperKeys(paper: DedupablePaper): { doi?: string; titleHash?: string } {
  const doi = paper.doi ? paper.doi.toLowerCase().trim() : undefined;
  const firstAuthor = paper.authors?.[0];
  const titleHash =
    paper.title && firstAuthor
      ? `${paper.title.toLowerCase().trim()}|${firstAuthor.split(",")[0].trim().toLowerCase()}`
      : undefined;
  return { doi: doi || undefined, titleHash };
}

export function splitNewPapers<T extends DedupablePaper>(
  papers: T[],
  existing: ExistingPaperKeys | undefined
): { fresh: T[]; duplicates: T[] } {
  if (!existing) return { fresh: papers, duplicates: [] };
  const dois = new Set(existing.dois);
  const hashes = new Set(existing.titleHashes);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const paper of papers) {
    const { doi, titleHash } = paperKeys(paper);
    const isDuplicate = (doi && dois.has(doi)) || (titleHash && hashes.has(titleHash));
    (isDuplicate ? duplicates : fresh).push(paper);
  }
  return { fresh, duplicates };
}
```

- [ ] **Step 3: Run the tests.** Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

Message: `feat(sources): paper dedupe helper for library imports`.

---

### Task 3: Shared step types, LinkForm, TextForm

**Files:**
- Create: `add-source/types.ts`, `add-source/LinkForm.tsx`, `add-source/TextForm.tsx`
- Test: `add-source/LinkForm.test.tsx`, `add-source/TextForm.test.tsx`

- [ ] **Step 1: `types.ts`**

```ts
import { useEffect } from "react";

export type AddSourceStep =
  | "menu"
  | "website"
  | "video"
  | "text"
  | "doi"
  | "bibtex"
  | "zotero"
  | "mendeley"
  | "manual";

/** Contract between AddSourceDialog and each step's form. */
export interface StepFormProps {
  /** Close the whole dialog after a successful add. */
  onDone: () => void;
  /** Report in-flight work so the dialog can block closing. */
  onBusyChange: (busy: boolean) => void;
}

/** Mirror `busy` to the dialog, and clear it when the form unmounts. */
export function useReportBusy(busy: boolean, onBusyChange: (busy: boolean) => void) {
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
}
```

- [ ] **Step 2: Failing LinkForm test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinkForm } from "./LinkForm";

const showError = vi.fn();
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: showError, success: vi.fn(), info: vi.fn() }),
}));

function setup(onUpload = vi.fn().mockResolvedValue(undefined)) {
  const onDone = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <LinkForm kind="website" onUpload={onUpload} isUploading={false} onDone={onDone} onBusyChange={onBusyChange} />
  );
  return { onUpload, onDone, onBusyChange, field: screen.getByRole("textbox", { name: "Website URLs" }) };
}

describe("LinkForm", () => {
  it("toasts the exact message when no URL is valid", async () => {
    const { field, onUpload } = setup();
    await userEvent.type(field, "not a url");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(showError).toHaveBeenCalledWith(
      "Please enter at least one valid URL (starting with http:// or https://)."
    );
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("submits http(s) URLs on Ctrl+Enter, then calls onDone", async () => {
    const { field, onUpload, onDone } = setup();
    await userEvent.type(field, "https://a.com ftp://x http://b.com");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onUpload).toHaveBeenCalledWith(["https://a.com", "http://b.com"]);
    expect(onDone).toHaveBeenCalled();
  });

  it("stays open when the upload rejects", async () => {
    const { field, onDone } = setup(vi.fn().mockRejectedValue(new Error("boom")));
    await userEvent.type(field, "https://a.com");
    await userEvent.click(screen.getByRole("button", { name: "Add Sources" }));
    expect(onDone).not.toHaveBeenCalled();
    expect(field).toBeInTheDocument();
  });

  it("disables submit while the input is blank", () => {
    setup();
    expect(screen.getByRole("button", { name: "Add Sources" })).toBeDisabled();
  });
});
```

Run it. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `LinkForm.tsx`**

```tsx
import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/contexts/useToast";
import { type StepFormProps, useReportBusy } from "./types";

const COPY = {
  website: {
    label: "Website URLs",
    placeholder:
      "https://example.com\nhttps://another-example.com\n\nSeparate multiple URLs with spaces or new lines",
    hint: "Separate multiple URLs with spaces or new lines.",
  },
  video: {
    label: "Video URLs",
    placeholder: "Paste URL from YouTube, TikTok, Instagram, or X...",
    hint: "Transcripts are extracted from YouTube, TikTok, Instagram and X. Separate multiple URLs with spaces or new lines.",
  },
} as const;

interface LinkFormProps extends StepFormProps {
  kind: keyof typeof COPY;
  onUpload: (urls: string[]) => Promise<void>;
  isUploading: boolean;
}

export function LinkForm({ kind, onUpload, isUploading, onDone, onBusyChange }: LinkFormProps) {
  const { error: showError } = useToast();
  const [value, setValue] = useState("");
  const id = useId();
  const copy = COPY[kind];
  useReportBusy(isUploading, onBusyChange);

  const submit = async () => {
    if (!value.trim() || isUploading) return;
    const urls = value
      .split(/\s+/)
      .map((url) => url.trim())
      .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
    if (urls.length === 0) {
      showError("Please enter at least one valid URL (starting with http:// or https://).");
      return;
    }
    try {
      await onUpload(urls);
      onDone();
    } catch {
      // useSourceUpload already toasted; keep the step open so the user can fix the input.
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>{copy.label}</FieldLabel>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            disabled={isUploading}
            autoFocus
            className="h-32 resize-none"
          />
          <FieldDescription>{copy.hint}</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={!value.trim() || isUploading}>
          {isUploading ? (
            <>
              <Spinner /> Adding...
            </>
          ) : (
            "Add Sources"
          )}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Failing TextForm test, then implement**

`TextForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextForm } from "./TextForm";

describe("TextForm", () => {
  it("is disabled until there is text, then uploads and calls onDone", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(<TextForm onUpload={onUpload} isUploading={false} onDone={onDone} onBusyChange={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Add Source" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "   ");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: "Text" }), "notes");
    await userEvent.click(submit);
    expect(onUpload).toHaveBeenCalledWith("   notes");
    expect(onDone).toHaveBeenCalled();
  });
});
```

`TextForm.tsx` follows the same shape as `LinkForm`:
- one `Field` labelled "Text";
- `Textarea` with `placeholder="Paste your text here..."`, `className="h-48 resize-none"`, `autoFocus`;
- Ctrl/Cmd+Enter submits;
- `onUpload(value)` is called with the untrimmed value, as today;
- submit label "Add Source" (busy: Spinner + "Adding...");
- `useReportBusy(isUploading, onBusyChange)`;
- the catch keeps the step open;
- no toast import.

Props: `StepFormProps & { onUpload: (text: string) => Promise<void>; isUploading: boolean }`.

- [ ] **Step 5: Run both tests.** Expected: PASS.

- [ ] **Step 6: Commit**

Message: `feat(sources): link and text steps for the add-source dialog`.

---

### Task 4: DoiForm and ManualPaperForm

**Files:**
- Create: `add-source/DoiForm.tsx`, `add-source/ManualPaperForm.tsx`
- Test: `add-source/DoiForm.test.tsx`, `add-source/ManualPaperForm.test.tsx`

Both take `StepFormProps & { notebookId: Id<"notebooks"> }`. They use `useResolveDoi` and `useUpload` from `../../services/documentsApi`.

- [ ] **Step 1: Failing tests**

Mock pattern for both files:

```tsx
const resolveDoi = vi.fn();
const upload = vi.fn();
vi.mock("../../services/documentsApi", () => ({
  useResolveDoi: () => resolveDoi,
  useUpload: () => upload,
}));
const notebookId = "nb1" as Id<"notebooks">;
```

`DoiForm.test.tsx` cases:
1. Type "10.1/x" into `getByRole("textbox", { name: "DOI" })` and press Enter. `resolveDoi` should be called with `{ doi: "10.1/x" }`. With the mock resolving `{ title: "Paper", authors: ["Ann Lee"], publicationYear: 2020, venue: "Nature" }`, the preview shows the text "Paper" and "Ann Lee".
2. When resolve returns `null`, `getByRole("alert")` has the text "Could not resolve DOI. Please check the DOI and try again."
3. After a preview, click `getByRole("button", { name: "Add to notebook" })`. `upload` should be called with `{ notebookId, type: "paper_record", fileName: "Paper", paperRecord: { authors: ["Ann Lee"], publicationYear: 2020, venue: "Nature" } }` (use `expect.objectContaining` for paperRecord), and then `onDone` is called.
4. An upload rejection with `new Error("nope")` shows an alert "nope", and `onDone` is not called.

`ManualPaperForm.test.tsx` cases:
1. Fields are reachable by label: "Title", "Authors", "Abstract", "DOI", "Venue", "Year", "PDF URL". Title and Authors have `aria-required="true"`.
2. "Add Paper" is disabled until both Title and Authors are non-blank.
3. Submitting with Title "T", Authors "Ann Lee, Bo Chen", Year "20x" calls `upload` with `paperRecord` equal to:
   ```ts
   { abstract: "", authors: ["Ann Lee", "Bo Chen"], doi: undefined, venue: undefined,
     publicationYear: 20, isOa: false, pdfUrl: undefined, sourceType: "manual" }
   ```
   Note that `parseInt("20x") === 20`. This keeps today's behaviour, so assert it. It is followed by `onDone`.

Run them. Expected: FAIL (module not found).

- [ ] **Step 2: Implement `DoiForm.tsx`**

Port the logic from `DoiInputModal.tsx` (`handleResolve` and `handleAddToNotebook`, the `ResolvedPaper` interface) verbatim, with these changes:
- On success, call `onDone()` instead of `onClose()`. Remove `handleClose` and `onSuccess`.
- `useReportBusy(isResolving || isUploading, onBusyChange)`.

Markup:

```tsx
<div className="flex flex-col gap-6">
  <Field>
    <FieldLabel htmlFor={id}>DOI</FieldLabel>
    <InputGroup>
      <InputGroupInput
        id={id}
        value={doi}
        onChange={(e) => setDoi(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void handleResolve();
          }
        }}
        placeholder="e.g., 10.1038/s41586-020-2649-2"
        autoFocus
        disabled={isResolving || isUploading}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={() => void handleResolve()} disabled={!doi.trim() || isResolving || isUploading}>
          {isResolving ? <Spinner /> : <Search />} Resolve
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </Field>
  {error && (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  )}
  {preview && (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">{preview.title}</CardTitle>
        {preview.authors.length > 0 && <CardDescription>{preview.authors.join(", ")}</CardDescription>}
      </CardHeader>
      {(preview.abstract || meta) && (
        <CardContent className="flex flex-col gap-3">
          {preview.abstract && <p className="line-clamp-4 text-sm text-muted-foreground">{preview.abstract}</p>}
          {meta && <p className="font-sans text-xs text-muted-foreground">{meta}</p>}
        </CardContent>
      )}
    </Card>
  )}
  {preview && (
    <div className="flex justify-end">
      <Button onClick={() => void handleAddToNotebook()} disabled={isUploading}>
        {isUploading ? <><Spinner /> Adding...</> : "Add to notebook"}
      </Button>
    </div>
  )}
</div>
```

- `const meta = [preview?.venue, preview?.publicationYear, preview?.doi && `DOI ${preview.doi}`].filter(Boolean).join(" · ");`
- Check `InputGroupAddon`'s `align` values in `input-group.tsx` and use the inline-end one it defines.
- Check `Card`'s sub-parts. If `CardHeader` has its own padding defaults, keep them.

- [ ] **Step 3: Implement `ManualPaperForm.tsx`**

Port `handleSubmit` from `ManualPaperModal.tsx` verbatim (payload unchanged), with these changes:
- On success call `onDone()`. Remove `handleClose` and `onSuccess`.
- `useReportBusy(isUploading, onBusyChange)`.
- Wrap it in `<form onSubmit>` with the submit button `type="submit"`.

Fields use `FieldGroup`:
- Title (`Input`, `autoFocus`, `aria-required`, `required` mark `<span aria-hidden className="text-destructive">*</span>` inside `FieldLabel`).
- Authors (`Input`, `aria-required`, mark, `FieldDescription` "Separate authors with commas").
- Abstract (`Textarea rows={4}`).
- `<div className="grid gap-4 sm:grid-cols-2">` holding DOI, Venue, Year (`inputMode="numeric"`) and PDF URL (`type="url"`).

Each field has its own `useId()`-based id wired to `FieldLabel htmlFor`. The label text must be exactly the names in the test; the mark is `aria-hidden`, so the accessible name stays "Title".

The error goes in `Alert variant="destructive"`. The footer is `flex justify-end`, with "Add Paper" (busy: Spinner + "Adding...") disabled while `!isValid || isUploading`.

- [ ] **Step 4: Run both tests.** Expected: PASS.

- [ ] **Step 5: Commit**

Message: `feat(sources): DOI and manual paper steps`.

---

### Task 5: PaperFileDrop and BibtexImportForm

**Files:**
- Create: `add-source/PaperFileDrop.tsx`, `add-source/BibtexImportForm.tsx`
- Test: `add-source/BibtexImportForm.test.tsx`

- [ ] **Step 1: `PaperFileDrop.tsx`**

```tsx
import { FileUp } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/shared/components/ui/button";

interface PaperFileDropProps {
  accept: string;
  /** Visible description, e.g. "A .bib file exported from Zotero". */
  hint: string;
  fileName: string | null;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/** A keyboard-reachable file picker on a quiet dashed panel (no drag and drop, as before). */
export function PaperFileDrop({ accept, hint, fileName, disabled, onFile }: PaperFileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <FileUp /> {fileName ? "Choose another file" : "Choose file"}
      </Button>
      <p className="font-sans text-sm text-muted-foreground">{fileName ?? hint}</p>
    </div>
  );
}
```

- [ ] **Step 2: Failing BibtexImportForm test**

```tsx
const parse = vi.fn();
const bulkUpload = vi.fn();
vi.mock("../../services/documentsApi", () => ({
  useParseBibliography: () => parse,
  useBulkUpload: () => bulkUpload,
}));

const result = {
  papers: [
    { title: "Alpha", authors: ["Ann Lee"], doi: "10.1/a", publicationYear: 2020 },
    { title: "Beta", authors: ["Bo Chen"] },
  ],
  stats: { total: 2, withDoi: 1, withoutDoi: 1, malformed: 0 },
  warnings: [],
};
```

Cases:
1. Switch to `getByRole("tab", { name: "Paste text" })`. Type into `getByRole("textbox", { name: "Bibliography" })` the text `"TY  - JOUR\nTI  - Alpha\nER  -"`, then click "Parse bibliography". Expect `parse` called with `{ content: <that text>, format: "ris" }`.
2. After parsing BibTeX text `@article{a, title={Alpha}}`, expect `parse` called with `format: "auto"`. Then:
   - Two checkboxes, named "Include Alpha" and "Include Beta", are both checked.
   - The button "Import 2 selected papers" is present.
3. Uncheck "Include Beta". The button reads "Import 1 selected paper". Clicking it calls `bulkUpload` with `{ notebookId, papers: [expect.objectContaining({ title: "Alpha", sourceType: "bibtex" })] }`, then `onDone`.
4. "Deselect all" unchecks both and disables the import button.
5. A file chosen through the hidden `input[type=file]` (`userEvent.upload(container.querySelector('input[type="file"]'), new File(["TY  - JOUR"], "x.ris"))`) parses with `format: "ris"`. This is the stale-state fix.

Run it. Expected: FAIL.

- [ ] **Step 3: Implement `BibtexImportForm.tsx`**

Port the state and handlers from `BibtexImportModal.tsx`, with these changes:
- **`detectFormat`:** `const detectFormat = (content: string): "auto" | "ris" => (content.trim().startsWith("TY  -") ? "ris" : "auto");`. `handleParse(content)` uses `detectFormat(content)`. Remove the `activeTab`/`fileContent` dependency.
- **File selection:** `onFile` does `const text = await file.text(); setFileName(file.name); void handleParse(text);`. Remove `fileContent` state.
- **Success** calls `onDone()`. Remove `handleClose` and `onSuccess`.
- **Busy:** `useReportBusy(isParsing || isImporting, onBusyChange)`.

Markup, top to bottom:
1. `<Tabs defaultValue="file">`:
   - `<TabsList><TabsTrigger value="file">Upload file</TabsTrigger><TabsTrigger value="paste">Paste text</TabsTrigger></TabsList>`
   - **file:** `<PaperFileDrop accept=".bib,.ris" hint="A BibTeX (.bib) or RIS (.ris) file" fileName={fileName} disabled={isParsing || isImporting} onFile={...} />`
   - **paste:** a `Field` with `FieldLabel` "Bibliography" and a `Textarea rows={8} className="font-mono text-xs"` with placeholder `"@article{key,\n  title={...},\n  author={...}\n}"`. Below it, a right-aligned `Button variant="secondary"` "Parse bibliography" (Spinner while parsing), disabled while `!pasteContent.trim() || isParsing || isImporting`.
2. If `isParsing`: `<p className="flex items-center gap-2 font-sans text-sm text-muted-foreground"><Spinner /> Parsing bibliography...</p>`.
3. `error`: `Alert variant="destructive"`.
4. `warnings.length > 0`: `Alert variant="warning"` with `AlertTitle` "Some entries had problems" and an `AlertDescription` containing a `<ul className="list-disc pl-4">` of the warnings.
5. `stats`: `<div className="flex flex-wrap gap-2">` containing:
   - `<Badge variant="secondary">{stats.total} found</Badge>`
   - `<Badge variant="outline">{stats.withDoi} with DOI</Badge>`
   - if `stats.malformed > 0`, `<Badge variant="outline">{stats.malformed} skipped</Badge>`
6. `withoutDoiCount > 0`: `Alert variant="warning"` with today's missing-DOI copy from the old modal (read it there and keep the text).
7. `papers.length > 0`:
   - A header row: `<div className="flex items-center justify-between font-sans text-sm text-muted-foreground"><span>{selected.size} of {papers.length} selected</span><Button variant="ghost" size="sm" onClick={toggleAll}>{allSelected ? "Deselect all" : "Select all"}</Button></div>`.
   - Then `<div className="max-h-64 overflow-y-auto"><ItemGroup variant="grouped">…</ItemGroup></div>`. Each row is:
     ```tsx
     <Item key={i} size="sm" role="listitem">
       <ItemMedia>
         <Checkbox id={`${baseId}-${i}`} checked={selected.has(i)} onCheckedChange={() => togglePaper(i)} aria-label={`Include ${p.title || "Untitled"}`} />
       </ItemMedia>
       <ItemContent>
         <ItemTitle className="line-clamp-2">{p.title || "Untitled"}</ItemTitle>
         <ItemDescription>{[p.authors?.slice(0, 3).join(", "), p.publicationYear].filter(Boolean).join(" · ")}</ItemDescription>
       </ItemContent>
     </Item>
     ```
8. A footer `flex justify-end`: `Button` "Import {n} selected paper{n === 1 ? "" : "s"}" (Spinner + "Importing..." while busy), disabled while `selected.size === 0 || isImporting`.

The button's text must make the test names exact: "Import 2 selected papers" and "Import 1 selected paper".

- [ ] **Step 4: Run the test.** Expected: PASS.

- [ ] **Step 5: Commit**

Message: `feat(sources): BibTeX/RIS import step with real tabs and checkboxes`.

---

### Task 6: LibraryImportForm (Zotero + Mendeley)

**Files:**
- Create: `add-source/LibraryImportForm.tsx`
- Test: `add-source/LibraryImportForm.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
const parse = vi.fn();
const bulkUpload = vi.fn();
let existing: { dois: string[]; titleHashes: string[] } | undefined;
vi.mock("../../services/documentsApi", () => ({
  useParseBibliography: () => parse,
  useBulkUpload: () => bulkUpload,
  useGetExistingPapers: () => existing,
}));
```

Cases:
1. With `source="zotero"`, `existing = { dois: ["10.1/a"], titleHashes: [] }`, and parse resolving two papers (Alpha with DOI `10.1/A`, and Beta):
   - Uploading `library.bib` calls `parse` with `{ content, format: "auto" }`.
   - The text "1 already in notebook" is shown, and the button reads "Import 1 paper".
   - Clicking it calls `bulkUpload` with `papers: [expect.objectContaining({ title: "Beta", sourceType: "zotero" })]`, then `onDone`.
2. `source="mendeley"` shows "Export your Mendeley library as BibTeX (.bib), then choose the file." and imports with `sourceType: "mendeley"`.
3. When every parsed paper is a duplicate, the text "All papers from this file are already in your notebook." is shown and there is no Import button.
4. A parse rejection with `new Error("bad file")` shows `getByRole("alert")` with "bad file".

Run it. Expected: FAIL.

- [ ] **Step 2: Implement**

```tsx
const LIBRARY = {
  zotero: { name: "Zotero", icon: BookOpen },
  mendeley: { name: "Mendeley", icon: Library },
} as const;

interface LibraryImportFormProps extends StepFormProps {
  notebookId: Id<"notebooks">;
  source: keyof typeof LIBRARY;
}
```

- **State:** `fileName`, `isParsing`, `isImporting`, `papers`, `error`.
- **Dedupe:** `const { fresh, duplicates } = useMemo(() => splitNewPapers(papers, existing ?? undefined), [papers, existing]);`, using `paperDedupe` from Task 2.
- **Busy:** `useReportBusy(isParsing || isImporting, onBusyChange)`.
- **`onFile`:** port `handleFileSelect` (`format: "auto"`), setting `fileName`.
- **Import:** port `handleImport`, over `fresh`, with `sourceType: source`. Then `onDone()`.

Markup, top to bottom:
1. `<p className="text-sm text-muted-foreground">Export your {name} library as BibTeX (.bib), then choose the file.</p>`
2. `<PaperFileDrop accept=".bib" hint={`A .bib file exported from ${name}`} … />`
3. Parsing row (Spinner + "Parsing bibliography..."), and the error `Alert`.
4. When `papers.length > 0`, badges:
   - `{papers.length} found` (secondary);
   - `{duplicates.length} already in notebook` (outline), only if more than 0;
   - `{fresh.length} new` (outline).
5. If `fresh.length === 0`:
   ```tsx
   <Empty>
     <EmptyHeader>
       <EmptyMedia variant="icon"><Icon /></EmptyMedia>
       <EmptyTitle>Nothing new to import</EmptyTitle>
       <EmptyDescription>All papers from this file are already in your notebook.</EmptyDescription>
     </EmptyHeader>
   </Empty>
   ```
6. Otherwise: a `max-h-64 overflow-y-auto` wrapper around `ItemGroup variant="grouped"`, with read-only `Item size="sm" role="listitem"` rows (`ItemMedia variant="icon"` with the library icon, `ItemTitle`, and `ItemDescription` with authors · year), plus a footer button "Import {n} paper{s}" (Spinner + "Importing...").

Check `EmptyMedia`'s variant names in `empty.tsx`.

- [ ] **Step 3: Run the test.** Expected: PASS.

- [ ] **Step 4: Commit**

Message: `feat(sources): one library import step for Zotero and Mendeley`.

---

### Task 7: AddSourceMenu and AddSourceDialog

**Files:**
- Create: `add-source/AddSourceMenu.tsx`, `add-source/AddSourceDialog.tsx`
- Test: `add-source/AddSourceDialog.test.tsx`

- [ ] **Step 1: Failing dialog test**

Mock `@/features/billing/services/subscriptionApi` (`useUserLimits`) with a mutable `limits = { sourceLimit: 100, isLoading: false }`. Mock `../GoogleDrivePicker` with `isGoogleDrivePickerConfigured: true`. Mock `../../services/documentsApi` with `vi.fn()` hooks: `useResolveDoi`, `useUpload`, `useParseBibliography`, `useBulkUpload`, and `useGetExistingPapers: () => undefined`. Mock `@/shared/contexts/useToast` as in Task 3.

Render helper:

```tsx
function renderDialog(over: Partial<React.ComponentProps<typeof AddSourceDialog>> = {}) {
  const props: React.ComponentProps<typeof AddSourceDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    sourcesCount: 3,
    userId: "u1",
    noteId: "nb1",
    isUploading: false,
    isDragging: false,
    onDragEnter: vi.fn(),
    onDragLeave: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    fileInputRef: { current: null },
    onFileSelect: vi.fn(),
    onUrlUpload: vi.fn().mockResolvedValue(undefined),
    onVideoUpload: vi.fn().mockResolvedValue(undefined),
    onTextUpload: vi.fn().mockResolvedValue(undefined),
    onDiscoverClick: vi.fn(),
    onGoogleDriveClick: vi.fn(),
    ...over,
  };
  return { props, ...render(<AddSourceDialog {...props} />) };
}
```

Cases:
1. `getByRole("dialog", { name: "Add sources" })` exists. The buttons "Website", "Transcripts", "Copied text", "Choose from Google Drive", "Import from DOI", "Import BibTeX or RIS", "Import from Zotero", "Import from Mendeley" and "Add manually" each exist (exact names). The text "3 / 100" and the progressbar named "Source limit" are present.
2. Clicking "Import from DOI" renames the dialog to "Import from DOI". Clicking `getByRole("button", { name: "Back to add sources" })` returns to "Add sources".
3. Navigating to "Copied text", then rerendering with `open: false`, then `open: true`, lands on the dialog named "Add sources".
4. `userId: null` disables every option button, and an alert contains "Authentication required".
5. `sourcesCount: 100` disables every option, an alert contains "Source limit reached", and the progressbar indicator has `bg-destructive`.
6. `limits.isLoading = true` shows "3 / …".
7. "Discover sources" calls `onOpenChange(false)` and `onDiscoverClick`. "Choose from Google Drive" calls `onOpenChange(false)` and `onGoogleDriveClick`.
8. **Busy blocks Escape:** go to "Copied text" and type text. Make `onTextUpload` return a never-resolving promise, rerender with `isUploading: true`, click "Add Source", then press Escape. Expect `onOpenChange` not to have been called with `false`.
9. Closing the dialog (`open: false` rerender) calls `onDragLeave` once.

Run it. Expected: FAIL.

- [ ] **Step 2: Implement `AddSourceMenu.tsx`**

Props:
- `canUpload`, `showAuthWarning`, `limitReached`, `maxSources`;
- `isDragging`, `onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop`;
- `fileInputRef`, `onFileSelect`;
- `onSelect(step: AddSourceStep)`, `onDiscover()`, `onGoogleDrive()`;
- `showPaperOptions: boolean` (true when `noteId` is set).

Structure:

```tsx
<div className="flex flex-col gap-6">
  <div className="flex items-start justify-between gap-4">
    <p className="max-w-prose text-sm text-muted-foreground">
      Sources let SolomindLM base its responses on the information that matters most to you, like
      course reading, research notes, meeting transcripts or plans.
    </p>
    <Button variant="outline" className="hidden sm:inline-flex" onClick={onDiscover}>
      <Globe /> Discover sources
    </Button>
  </div>

  {fileInputRef && onFileSelect && (
    <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelect}
      accept=".pdf,.docx,.pptx,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.avif,.wav,.mp3,.m4a,.webm,.flac" multiple />
  )}

  <div
    data-testid="source-dropzone"
    data-state={isDragging ? "dragging" : "idle"}
    aria-disabled={!canUpload || undefined}
    onClick={() => canUpload && fileInputRef?.current?.click()}
    onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
    className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted/60 data-[state=dragging]:border-primary data-[state=dragging]:bg-primary/10 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
  >
    <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Upload className="size-6" />
    </span>
    <div className="flex flex-col gap-1">
      <h3 className="font-display text-lg">Upload sources</h3>
      <p className="font-sans text-sm text-muted-foreground">Drag and drop files here, or</p>
    </div>
    <Button
      type="button"
      variant="outline"
      disabled={!canUpload}
      onClick={(e) => {
        e.stopPropagation();
        fileInputRef?.current?.click();
      }}
    >
      Choose files
    </Button>
    <p className="max-w-xl font-sans text-xs text-muted-foreground">
      PDF, Word, PowerPoint, Text, Markdown, JSON, CSV, PNG, JPEG, AVIF, WAV, MP3, M4A, WebM, FLAC
    </p>
  </div>

  <div className="grid gap-4 sm:grid-cols-2">
    <OptionGroup heading="Links and text" options={linkOptions} />
    {showPaperOptions && <OptionGroup heading="Research papers" options={paperOptions} />}
  </div>

  {showAuthWarning && (
    <Alert variant="warning"><TriangleAlert /><AlertTitle>Authentication required</AlertTitle>
      <AlertDescription>Please log in and select a notebook to upload sources.</AlertDescription></Alert>
  )}
  {limitReached && (
    <Alert variant="destructive"><CircleAlert /><AlertTitle>Source limit reached</AlertTitle>
      <AlertDescription>You've reached the maximum of {maxSources} sources. Remove some sources to add new ones.</AlertDescription></Alert>
  )}
</div>
```

- **Drop zone:** if `aria-disabled:` is not a Tailwind v4 variant in this setup, use `data-[disabled=true]:` with `data-disabled={!canUpload}` instead. Check the compiled CSS in the browser during the visual pass.
- **Drop-zone heading:** it is "Upload sources" (e2e reads it). Keep "Drag & drop" wording simple.
- **`OptionGroup`** is a local component (not exported). It renders a heading (`<h3 className="mb-2 font-sans text-xs font-medium text-muted-foreground">`) and an `<ItemGroup variant="grouped">`. In that group, each option is:

```tsx
<Item key={o.label} asChild size="sm" className="hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-50">
  <button type="button" role="listitem" disabled={!canUpload} onClick={o.onClick} aria-describedby={`${baseId}-${o.key}`}>
    <ItemMedia variant="icon"><o.icon /></ItemMedia>
    <ItemContent>
      <ItemTitle>{o.label}</ItemTitle>
      <ItemDescription id={`${baseId}-${o.key}`}>{o.hint}</ItemDescription>
    </ItemContent>
    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
  </button>
</Item>
```

  - `role="listitem"` on a button would drop its button role. Instead wrap each `Item` in a `<div role="listitem">`, keeping the `<button>` a button, and add `w-full text-left` to the button classes.
  - **Accessible name:** it must equal the label. `ItemDescription` would otherwise join the name, so give the button `aria-label={o.label}` as well as `aria-describedby`.
- **Options** (`key`, `label`, icon, hint, onClick):
  - **links:**
    - `website` "Website" (Globe), hint "Paste one or more web page links";
    - `video` "Transcripts" (Youtube), hint "YouTube, TikTok, Instagram or X video links";
    - `text` "Copied text" (FileText), hint "Paste notes or any text";
    - plus, if `isGoogleDrivePickerConfigured`, `drive` "Choose from Google Drive" (HardDrive), hint "Pick files from your Drive", which calls `onGoogleDrive`.
  - **papers:**
    - `doi` "Import from DOI" (Fingerprint, or Globe if Fingerprint is not in the lucide version), hint "Look up a paper by its DOI";
    - `bibtex` "Import BibTeX or RIS" (FileText), hint "Upload or paste a bibliography";
    - `zotero` "Import from Zotero" (BookOpen), hint "Import a Zotero BibTeX export";
    - `mendeley` "Import from Mendeley" (Library), hint "Import a Mendeley BibTeX export";
    - `manual` "Add manually" (PenLine), hint "Enter a paper's details yourself".

- [ ] **Step 3: Implement `AddSourceDialog.tsx`**

```tsx
export interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcesCount: number;
  userId?: string | null;
  noteId?: string | null;
  isUploading: boolean;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlUpload: (urls: string[]) => Promise<void>;
  onVideoUpload: (urls: string[]) => Promise<void>;
  onTextUpload: (text: string) => Promise<void>;
  onDiscoverClick: () => void;
  onGoogleDriveClick: () => void;
}

const STEP_COPY: Record<Exclude<AddSourceStep, "menu">, { title: string; description: string }> = {
  website: { title: "Add website", description: "Add web pages as sources." },
  video: { title: "Add video transcripts", description: "Paste video links to extract their transcripts." },
  text: { title: "Paste text", description: "Add copied text as a source." },
  doi: { title: "Import from DOI", description: "Look up a paper and add its record." },
  bibtex: { title: "Import BibTeX or RIS", description: "Upload or paste a bibliography, then pick papers." },
  zotero: { title: "Import from Zotero", description: "Import papers from a Zotero BibTeX export." },
  mendeley: { title: "Import from Mendeley", description: "Import papers from a Mendeley BibTeX export." },
  manual: { title: "Add paper manually", description: "Enter the details of a paper." },
};
```

Body:
- **State:** `const [step, setStep] = useState<AddSourceStep>("menu"); const [busy, setBusy] = useState(false);`
- **Limits:** `const { sourceLimit: maxSources, isLoading: limitsLoading } = useUserLimits();` Then `limitReached`, `canUpload` and `showAuthWarning` exactly as in `AddSourceModal.tsx` (keep its comment about loading).
- **Reset and drag reset:** port the `onDragLeaveRef` + `useEffect([open])` from `AddSourceModal.tsx` verbatim, keeping its comment. In the same `!open` branch, also run `setStep("menu"); setBusy(false);`.
- **Close:** `const close = () => onOpenChange(false);` and `const done = close;`.
- **Busy callback:** `const onBusyChange = useCallback((b: boolean) => setBusy(b), []);`, a stable identity, which `useReportBusy` depends on.
- **Dialog:** `<Dialog open={open} onOpenChange={(next) => { if (!next && busy) return; onOpenChange(next); }}>`.
- **`DialogContent`:**
  - `size="wide" padding="none" showCloseButton={false}`;
  - `onEscapeKeyDown={(e) => busy && e.preventDefault()}`;
  - `onInteractOutside={(e) => busy && e.preventDefault()}`;
  - `className="sm:max-h-[min(90svh,56rem)]"`. If that is an arbitrary value the lint flags (`no-arbitrary-values`), drop it; `size="wide"` already caps at `max-h-svh`.
- **Header** (`flex items-center gap-2 px-6 pt-6 pb-4`):
  - On a non-menu step, `<Button variant="ghost" size="icon-sm" aria-label="Back to add sources" disabled={busy} onClick={() => setStep("menu")}><ArrowLeft /></Button>`.
  - `<DialogHeader className="min-w-0 flex-1 gap-1 text-left">` containing `<DialogTitle className="font-display text-xl">` (step title, or "Add sources" on the menu) and `<DialogDescription>` (step description; on the menu, `sr-only` "Upload files, add links or text, or import papers.", because the menu has its own visible copy).
  - `<DialogClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close" disabled={busy}><X /></Button></DialogClose>`.
- **Body:** `<div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">`. The menu fills it; for a form, wrap it in `<div className="mx-auto w-full max-w-xl">`.
- **Footer:** `<div className="flex items-center gap-4 bg-muted/40 px-6 py-3 font-sans text-xs">` containing:
  - `<span className="flex shrink-0 items-center gap-2 font-medium text-muted-foreground"><File className="size-4" /> Source limit</span>`;
  - `<Progress aria-label="Source limit" className="flex-1" value={limitsLoading ? 0 : Math.min((sourcesCount / maxSources) * 100, 100)} tone={limitReached ? "destructive" : "default"} />`;
  - `<span className={cn("font-mono font-medium", limitReached ? "text-destructive" : "text-muted-foreground")}>{sourcesCount} / {limitsLoading ? "…" : maxSources}</span>`.
- **Steps:**
  - `"website"`: `<LinkForm kind="website" onUpload={onUrlUpload} isUploading={isUploading} onDone={done} onBusyChange={onBusyChange} />`
  - `"video"`: the same with `kind="video"` and `onVideoUpload`.
  - `"text"`: `TextForm`.
  - `doi`, `bibtex`, `manual`: render only when `noteId` is set, with `notebookId={noteId as Id<"notebooks">}`.
  - `zotero` and `mendeley`: `<LibraryImportForm source={step} … />`.
- **Menu callbacks:**
  - `onSelect={setStep}`;
  - `onDiscover={() => { close(); onDiscoverClick(); }}`;
  - `onGoogleDrive={() => { close(); onGoogleDriveClick(); }}`;
  - `showPaperOptions={Boolean(noteId)}`.

Note that in today's code the paper options render even without `noteId` (they are only disabled), while the paper modals don't mount. Keep the options visible and disabled through `canUpload`, so pass `showPaperOptions` as always `true`. If you do that, delete the prop and render both groups. Pick the simpler option, which is to always render.

- [ ] **Step 4: Run the test.** Expected: PASS. Fix any case that fails because of Radix portals: Testing Library's `screen` queries reach the portal, since it attaches to `document.body`.

- [ ] **Step 5: Commit**

Message: `feat(sources): add-source dialog shell and menu`.

---

### Task 8: Wire SourcesPanel

**Files:**
- Modify: `apps/web/src/features/sources/components/SourcesPanel.tsx`

- [ ] **Step 1: Replace the modal wiring**

- Remove the imports of `AddSourceModal`, `UrlInputModal`, `SocialMediaInputModal` and `TextInputModal`. Import `AddSourceDialog` from `./add-source/AddSourceDialog`.
- Remove the `showUrlInput`, `showSocialMediaInput` and `showTextInput` state.
- Replace `<AddSourceModal …/>` and the three sibling modals with:

```tsx
<AddSourceDialog
  open={isAddModalOpen}
  onOpenChange={setIsAddModalOpen}
  sourcesCount={sources.length}
  userId={userId}
  noteId={noteId}
  isUploading={sourceUpload.isUploading}
  isDragging={sourceUpload.isDragging}
  onDragEnter={sourceUpload.handleDragEnter}
  onDragLeave={sourceUpload.handleDragLeave}
  onDragOver={sourceUpload.handleDragOver}
  onDrop={sourceUpload.handleDrop}
  fileInputRef={sourceUpload.fileInputRef}
  onFileSelect={sourceUpload.handleFileSelect}
  onUrlUpload={sourceUpload.handleUrlUpload}
  onVideoUpload={sourceUpload.handleSocialMediaUpload}
  onTextUpload={sourceUpload.handleTextUpload}
  onDiscoverClick={() => setIsDiscoverOpen(true)}
  onGoogleDriveClick={() => googleDriveRef.current?.open()}
/>
```

Read the old `onDiscoverClick`/`onGoogleDriveClick` bodies (lines ~407–442) and keep any extra logic they had. The dialog already closes itself before calling them.

- [ ] **Step 2: Typecheck**

Run `bun run typecheck:web`. Expected: the only errors are from the old modal files (if any) or none.

- [ ] **Step 3: Commit**

Message: `refactor(sources): mount the add-source dialog from the panel`.

---

### Task 9: Delete the old modals

- [ ] **Step 1:** `git rm` these files under `apps/web/src/features/sources/components/`:
  - `AddSourceModal.tsx`
  - `UrlInputModal.tsx`, `SocialMediaInputModal.tsx`, `TextInputModal.tsx`
  - `DoiInputModal.tsx`, `ManualPaperModal.tsx`, `BibtexImportModal.tsx`
  - `ZoteroImportModal.tsx`, `MendeleyImportModal.tsx`
- [ ] **Step 2:** Run `grep -rn "AddSourceModal\|UrlInputModal\|SocialMediaInputModal\|TextInputModal\|DoiInputModal\|ManualPaperModal\|BibtexImportModal\|ZoteroImportModal\|MendeleyImportModal" apps/web/src docs/design`. Expected: no code hits. Docs that mention them historically can stay. Check `DiscoverSourcesModal.tsx`'s "matches AddSourceModal" comment: if it now points at a deleted file, change it to "matches the add-source dialog".
- [ ] **Step 3:** Run `bun run typecheck:web` and `bun run test:web`. Expected: both green.
- [ ] **Step 4: Commit**

Message: `refactor(sources): remove the hand-built add-source modals`.

---

### Task 10: e2e selectors

**Files** (repo root):
- `e2e/helpers/navigation.ts`
- `e2e/helpers/source-assertions.ts`
- `e2e/sources/add-source-modal.spec.ts`
- `e2e/sources/file-uploads.spec.ts`
- `e2e/sources/url-ingestion.spec.ts`

- [ ] **Step 1: `navigation.ts`**

After clicking `[title="Add Source"]`, wait with `await expect(page.getByRole("dialog", { name: "Add sources" })).toBeVisible();`. Import `expect` from `@playwright/test` if it isn't already imported.

- [ ] **Step 2: `add-source-modal.spec.ts`**

```ts
/** The add-source dialog; Radix hides the panel behind it from role queries. */
function addSourcesDialog(page: Page) {
  return page.getByRole("dialog", { name: "Add sources" });
}
function modalDiscoverButton(page: Page) {
  return addSourcesDialog(page).getByRole("button", { name: "Discover sources" });
}
```

- Replace the old doc comment.
- Scope the option-button assertions to `addSourcesDialog(page)`.
- Make "Website" and the other option assertions `{ name: "Website", exact: true }`.
- Keep `getByText("0 / 100")` and `getByText("Source limit")`.

- [ ] **Step 3: `source-assertions.ts`**

Inside the paste-text and URL helpers:
- `const dialog = page.getByRole("dialog", { name: "Add sources" });`
- After clicking "Copied text" or "Website", the dialog's name changes. Re-scope with `page.getByRole("dialog")`, which is the only dialog.
- Use `getByRole("dialog").getByRole("button", { name: "Add Source", exact: true })` instead of `.last()`, and likewise for "Add Sources".
- Keep the placeholder selectors.
- Keep the `evaluate` clicks only if they were working around overlay interception. With Radix they should be plain `.click()`; try the plain click first and keep `evaluate` only if `--list` plus a reasoning check says otherwise. When unsure, leave them.

- [ ] **Step 4: `file-uploads.spec.ts`**

Replace `page.locator("div[class*='border-dashed']").first()` (two places) with `page.getByTestId("source-dropzone")`. `input[type="file"]` stays: the menu step mounts only the one input.

- [ ] **Step 5: `url-ingestion.spec.ts`**

Apply the same dialog scoping for the Website flow. The toast assertion is unchanged.

- [ ] **Step 6: Verify parse**

Run `bunx playwright test --list` from the repo root. Expected: it lists the tests with no errors. Don't run the live suite; it needs the user's credentials.

- [ ] **Step 7: Commit**

Message: `test(e2e): add-source selectors by dialog role`.

---

### Task 11: Enforcement and gates

**Files:**
- Modify: `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json`

- [ ] **Step 1:** Add `"src/features/sources/components/add-source/**/*.tsx"` to `MIGRATED` (after the panel entry).
- [ ] **Step 2:** From `apps/web`, run `bunx eslint src/features/sources/components/add-source`. Expected: 0 problems. Fix any finding in the source; never suppress it.
- [ ] **Step 3:** Run `bun run lint:design`. Expected: it passes with lower counts for `features/sources`. Then run `bun run lint:design:update` and confirm the diff only drops numbers, with `shadcn/no-inline-styles` gone for `features/sources`.
- [ ] **Step 4:** Run the gates one at a time:
  - `bun run typecheck:web`
  - `bun run typecheck:convex`
  - `bun run lint`
  - `bun run test:web`
  - `bun run lint:design`

  Expected: all green.
- [ ] **Step 5: Commit**

Message: `chore(web): enforce design lint on the add-source dialog`.

---

### Visual pass (controller, not a subagent)

On the dev server (:5173) at 390px and on desktop, in light and dark, check:
- the menu: idle, dragging (simulate by toggling `data-state` in devtools), at the limit, and signed out where feasible;
- each step;
- a DOI preview (a real DOI resolve is a Convex action and costs nothing; confirm with the user first anyway);
- BibTeX results from pasted text;
- the library empty state.

Show the screenshots to the user before pushing.
