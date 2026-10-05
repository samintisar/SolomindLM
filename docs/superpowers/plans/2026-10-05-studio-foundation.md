# Studio Foundation and Panel (PR 1 of #264) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Studio motion foundation (reduced-motion fallbacks, type colour tokens, the Sheen generating state) and move the Studio panel's seven files onto the design system at 0 lint findings.

**Architecture:**
- **`index.css`:** gets the new reduced-motion policy, `studio-*` colour tokens with a `studio-tone-*` utility, and a few house keyframes.
- **`Progress`:** gains three opt-in variants: an indeterminate sweep, a moving glint and a small size.
- **Type colours and icons:** two small, tested units: `studioTypeStyle(note)` (type → icon and colour classes) and `useJustFinished(status)` (the finish moment).
- **Saved rows:** `NoteItem` becomes a `Card` with a shadcn `DropdownMenu`, `Input` and `Progress`. This replaces the hand-built portal menu and its click-outside code, which is the likely cause of the "Rename does nothing, the menu stays open" report.

**Tech Stack:** React 19, Tailwind v4, `tw-animate-css`, shadcn/ui on Radix, Vitest with Testing Library, `@shadcn/lint`.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`, sections 1 and the PR 1 row of the scope table.

**Deviation from the spec:**
- **Studio motion helpers:** `useCountUp`, `<Burst />` and `useStreak` move to PR 2, where they're first used. Knip fails CI on unused exports, so shipping them unused in PR 1 would fail. Task 10 updates the spec to say so.
- **Gallery:** the `/dev/design` gallery still has no `Progress` entry. Adding one is the existing gallery follow-up, so it is out of scope here.

**Working directory:** every path below is relative to the worktree `.worktrees/studio-foundation` (branch `feature/studio-foundation`, based on `origin/main`). Dependencies are installed there; never junction `node_modules`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/index.css` | Modify | Reduced-motion policy, `studio-*` tokens, `studio-tone-*` and `studio-sheen` utilities, house keyframes. The old `.studio-generating-progress-indeterminate` CSS is removed. |
| `apps/web/src/shared/components/ui/progress.tsx` | Modify | `size`, `glint` and indeterminate sweep |
| `apps/web/src/shared/components/ui/card.tsx` | Modify | `interactive` gains a `data-selected` state |
| `apps/web/src/shared/components/ui/ui.smoke.test.tsx` | Modify | Tests for the new `Progress` and `Card` behaviour |
| `apps/web/src/features/studio/studioTypeStyle.ts` | Create | Maps a note to its icon, tile classes and tone class |
| `apps/web/src/features/studio/studioTypeStyle.test.ts` | Create | Its tests |
| `apps/web/src/features/studio/hooks/useJustFinished.ts` | Create | True for a moment after `generating` → `completed` |
| `apps/web/src/features/studio/hooks/useJustFinished.test.ts` | Create | Its tests |
| `apps/web/src/features/studio/components/NoteIcon.tsx` | Rewrite | Tokenised tile; bobbing icon while generating; pop when finished |
| `apps/web/src/features/studio/components/NoteItem.tsx` | Rewrite | `Card` row, Sheen, `Progress`, `DropdownMenu`, `Input` |
| `apps/web/src/features/studio/components/NoteItem.test.tsx` | Create | Row behaviour tests |
| `apps/web/src/features/studio/components/NoteListView.tsx` | Modify | `InputGroup` search; drops manual menu state |
| `apps/web/src/features/studio/components/ToolGrid.tsx` | Rewrite | `Card variant="interactive"` tiles, token colours, missing `Image` icon |
| `apps/web/src/shared/constants/index.ts` | Modify | Tool colours → `text-studio-*` |
| `apps/web/src/features/studio/components/ActiveNoteView.tsx` | Modify | `Button`s; `min-h-50` |
| `apps/web/src/features/studio/components/StudioPanel.tsx` | Modify | Drops `border-l-2 border-border` (Sources has no edge) |
| `apps/web/eslint.config.mjs` | Modify | The seven panel files join `MIGRATED` |
| `apps/web/design-lint-baseline.json` | Regenerate | `features/studio` drops by 23 |
| `docs/superpowers/specs/2026-10-04-studio-redesign-design.md` | Modify | Notes that the motion helpers move to PR 2 |

Commands run from `apps/web` unless they say otherwise. Run one test file with `bun run test <path>`, which runs `vitest run --config vitest.config.ts <path>`.

---

### Task 1: Reduced-motion policy (movement becomes a fade)

**Files:**
- Modify: `apps/web/src/index.css`, replacing the whole `@media (prefers-reduced-motion: reduce) { … }` block at the end of the file (about lines 1074–1095).

CSS with no logic to unit-test, so this task is verified in the browser. This machine's Windows has animations off, so the browser pane already reports `prefers-reduced-motion: reduce`.

- [ ] **Step 1: Replace the block**

Replace the existing block, which sets every animation and transition to `0.01ms` and special-cases `.animate-spin` and `.rfm-marquee`, with:

```css
/* Reduced motion: movement becomes a fade, it does not disappear (spec §1).
   tw-animate-css drives animate-in/out through these variables; resetting them keeps the
   opacity part of every enter/exit and drops the slide, zoom and spin. Spinners, progress
   sweeps and the landing marquee keep moving because they are not reset here. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    --tw-enter-translate-x: 0 !important;
    --tw-enter-translate-y: 0 !important;
    --tw-exit-translate-x: 0 !important;
    --tw-exit-translate-y: 0 !important;
    --tw-enter-scale: 1 !important;
    --tw-exit-scale: 1 !important;
    --tw-enter-rotate: 0 !important;
    --tw-exit-rotate: 0 !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Start the worktree's dev server**

Add a configuration to the session's `.claude/launch.json`. That is the file in the session root, not in the worktree.

```json
{
  "name": "web-studio",
  "runtimeExecutable": "bun",
  "runtimeArgs": ["run", "--cwd", ".worktrees/studio-foundation/apps/web", "dev", "--port", "5174", "--strictPort"],
  "port": 5174
}
```

Start it with the browser pane: `preview_start { name: "web-studio" }`.

- [ ] **Step 3: Verify in the browser pane**

1. Open a notebook, then open any dialog, for example "Add source".
2. Run this in the page:

```js
[matchMedia('(prefers-reduced-motion: reduce)').matches,
 getComputedStyle(document.querySelector('[role=dialog]')).getPropertyValue('--tw-enter-translate-y').trim()]
```

Expected: `[true, "0"]`. The dialog fades in without sliding.

3. Open chat and send nothing. Check that the "Thinking" dots and spinners still animate on a page that shows them.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/index.css
git commit -m "fix(web): reduced motion fades instead of freezing every animation"
```

---

### Task 2: Studio colour tokens, tone utility and house keyframes

**Files:**
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add light values**

Inside `:root { … }` (it starts at about line 11), right after the `--info…` group of semantic tokens, add:

```css
    /* Studio type colours (Create grid, Saved list): today's hues as tokens. */
    --studio-audio: oklch(0.511 0.096 186.391);
    --studio-mindmap: oklch(0.591 0.293 322.896);
    --studio-report: oklch(0.666 0.179 58.318);
    --studio-flashcard: oklch(0.505 0.213 27.518);
    --studio-quiz: oklch(0.488 0.243 264.376);
    --studio-infographic: oklch(0.541 0.281 293.009);
    --studio-written: oklch(0.527 0.154 150.069);
    --studio-spreadsheet: oklch(0.609 0.126 221.723);
    --studio-note: oklch(0.511 0.262 276.966);
    --studio-literature: oklch(0.646 0.222 41.116);
```

- [ ] **Step 2: Add dark values**

Inside `.dark { … }` (about line 105), after its `--info…` group, add:

```css
    --studio-audio: oklch(0.777 0.152 181.912);
    --studio-mindmap: oklch(0.74 0.238 322.16);
    --studio-report: oklch(0.828 0.189 84.429);
    --studio-flashcard: oklch(0.704 0.191 22.216);
    --studio-quiz: oklch(0.707 0.165 254.624);
    --studio-infographic: oklch(0.702 0.183 293.541);
    --studio-written: oklch(0.792 0.209 151.711);
    --studio-spreadsheet: oklch(0.789 0.154 211.53);
    --studio-note: oklch(0.673 0.182 276.935);
    --studio-literature: oklch(0.75 0.183 55.934);
```

- [ ] **Step 3: Keep the light pin consistent**

`.auth-form-light` (about line 237, under the comment "Pins the auth/landing pages to light-mode tokens") re-declares each token. `ToolGrid` renders inside it on `/auth` and in the landing mockup. Add the ten light values from Step 1 at the end of that rule, so a dark-mode account still sees light tile colours there.

- [ ] **Step 4: Map them into Tailwind**

In the `@theme inline { … }` block, after `--color-chart-5: var(--chart-5);`, add:

```css
  --color-studio-audio: var(--studio-audio);
  --color-studio-mindmap: var(--studio-mindmap);
  --color-studio-report: var(--studio-report);
  --color-studio-flashcard: var(--studio-flashcard);
  --color-studio-quiz: var(--studio-quiz);
  --color-studio-infographic: var(--studio-infographic);
  --color-studio-written: var(--studio-written);
  --color-studio-spreadsheet: var(--studio-spreadsheet);
  --color-studio-note: var(--studio-note);
  --color-studio-literature: var(--studio-literature);
```

- [ ] **Step 5: Add keyframes as `animate-*` utilities**

In the `@theme { … }` block that defines `--animate-route-in` (about line 315), add after the `route-in` keyframes:

```css
  --animate-studio-bob: studio-bob 1.6s ease-in-out infinite;
  --animate-studio-pop: studio-pop 550ms var(--ease-out);
  --animate-studio-glow: studio-glow 1400ms var(--ease-out) forwards;
  --animate-progress-sweep: progress-sweep 1.5s var(--ease-out) infinite;
  --animate-progress-glint: progress-glint 1.8s linear infinite;

  @keyframes studio-bob {
    50% {
      transform: translateY(-2px) rotate(-6deg);
    }
  }
  @keyframes studio-pop {
    40% {
      transform: scale(1.18);
    }
  }
  @keyframes studio-glow {
    0% {
      opacity: 0;
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes progress-sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(250%);
    }
  }
  @keyframes progress-glint {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(100%);
    }
  }
```

- [ ] **Step 6: Replace the old generating CSS with the tone and Sheen utilities**

Delete the block from `/* Studio sidebar: generating note — indeterminate progress sweep (theme tokens) */` through the end of `.studio-generating-progress-indeterminate::after { … }`. That covers the `studio-generating-bar-sweep` keyframes and both rules. In its place put:

```css
/* Studio: --studio-tone carries a type colour into decorations (studio-tone-flashcard, …). */
@utility studio-tone-* {
  --studio-tone: --value(--color-studio-*);
}

/* Studio: a soft light in the type colour sweeping across a generating Saved row (spec §1). */
@utility studio-sheen {
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 30%,
      color-mix(in oklch, var(--studio-tone, var(--primary)) 10%, transparent) 50%,
      transparent 70%
    );
    transform: translateX(-100%);
    animation: studio-sheen 2.4s var(--ease-out) infinite;
  }
}

@keyframes studio-sheen {
  to {
    transform: translateX(100%);
  }
}
```

- [ ] **Step 7: Pair the Sheen with its reduced-motion rule**

Inside the reduced-motion block from Task 1, after the `*` rule, add:

```css
  /* Decorative only: the progress bar still shows the work. */
  .studio-sheen::before {
    display: none;
  }
```

- [ ] **Step 8: Check that the utilities resolve**

Run from `apps/web`:

```bash
bun run build 2>&1 | tail -5
```

Expected: the build succeeds. Then confirm the generated CSS has the functional utility:

```bash
grep -o "studio-tone-audio{[^}]*}" dist/assets/*.css | head -1
```

Expected: a hit similar to `studio-tone-audio{--studio-tone:var(--color-studio-audio)}`. Minified output may differ slightly; any rule that sets `--studio-tone` is correct.

If nothing matches, the class is unused until Task 4, which is expected. Re-run this check after Task 7. If it still misses then, replace the functional utility with ten static ones in the form `@utility studio-tone-audio { --studio-tone: var(--color-studio-audio); }`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/index.css
git commit -m "feat(web): studio type colour tokens, tone utility and generating keyframes"
```

---

### Task 3: `Progress` gains size, glint and an indeterminate sweep

**Files:**
- Modify: `apps/web/src/shared/components/ui/progress.tsx`
- Test: `apps/web/src/shared/components/ui/ui.smoke.test.tsx`, after the two existing `Progress` tests (about line 735)

- [ ] **Step 1: Write the failing tests**

```tsx
  it("Progress without a value sweeps as indeterminate", () => {
    render(<Progress value={null} aria-label="Generating" />);
    const bar = screen.getByRole("progressbar", { name: "Generating" });
    expect(bar).toHaveAttribute("data-state", "indeterminate");
    expect(bar.querySelector("[data-slot=progress-indicator]")?.className).toContain(
      "data-[state=indeterminate]:animate-progress-sweep"
    );
  });

  it("Progress glint and size are opt-in variants", () => {
    render(<Progress value={40} glint size="sm" aria-label="Generating" />);
    const bar = screen.getByRole("progressbar", { name: "Generating" });
    expect(bar.className).toContain("h-1");
    const indicator = bar.querySelector("[data-slot=progress-indicator]");
    expect(indicator?.className).toContain("after:animate-progress-glint");
    expect(indicator?.className).toContain("motion-reduce:after:hidden");
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun run test src/shared/components/ui/ui.smoke.test.tsx`
Expected: the two new tests FAIL. There is no sweep class, and `glint`/`size` are not props.

- [ ] **Step 3: Implement**

Replace the whole of `progress.tsx` with:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const progressVariants = cva("relative w-full overflow-hidden rounded-full bg-muted", {
  variants: {
    size: { default: "h-2", sm: "h-1" },
  },
  defaultVariants: { size: "default" },
});

// With no value (null) Radix marks the bar indeterminate: a short segment sweeps across instead.
const progressIndicatorVariants = cva(
  "h-full w-full flex-1 translate-x-(--progress-offset) rounded-full transition-all data-[state=indeterminate]:w-2/5 data-[state=indeterminate]:translate-x-0 data-[state=indeterminate]:animate-progress-sweep",
  {
    variants: {
      tone: { default: "bg-primary", destructive: "bg-destructive" },
      // A highlight gliding along the filled part, for work in progress. Off under reduced motion.
      glint: {
        true: "relative overflow-hidden after:absolute after:inset-0 after:bg-linear-to-r after:from-transparent after:via-primary-foreground/45 after:to-transparent after:animate-progress-glint motion-reduce:after:hidden",
        false: "",
      },
    },
    defaultVariants: { tone: "default", glint: false },
  }
);

function Progress({
  className,
  value,
  tone,
  glint,
  size,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressIndicatorVariants> &
  VariantProps<typeof progressVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(progressVariants({ size }), className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ tone, glint })}
        style={{ "--progress-offset": `${(value ?? 0) - 100}%` } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun run test src/shared/components/ui/ui.smoke.test.tsx`
Expected: PASS, including the two older `Progress` tests.

- [ ] **Step 5: Confirm the one existing user is unchanged**

Run: `bun run test src/features/sources`
Expected: PASS. `AddSourceDialog` uses `Progress` with a value and the default size, so it renders exactly as before.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/components/ui/progress.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx
git commit -m "feat(ui): Progress size, glint and indeterminate sweep variants"
```

---

### Task 4: `studioTypeStyle(note)`

**Files:**
- Create: `apps/web/src/features/studio/studioTypeStyle.ts`
- Test: `apps/web/src/features/studio/studioTypeStyle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { BookOpen, FileText } from "lucide-react";
import { describe, expect, it } from "vitest";
import type { Note } from "@/shared/types/index";
import { studioTypeStyle } from "./studioTypeStyle";

const note = (fields: Record<string, unknown>) =>
  ({ id: "n1", title: "T", preview: "", status: "completed", ...fields }) as unknown as Note;

describe("studioTypeStyle", () => {
  it("colours both audio note types with the audio token", () => {
    for (const type of ["audio", "audioOverview"]) {
      const style = studioTypeStyle(note({ type, metadata: {} }));
      expect(style.tileClass).toBe("bg-studio-audio/10 text-studio-audio");
      expect(style.toneClass).toBe("studio-tone-audio");
    }
  });

  it("maps written questions to the written token", () => {
    expect(studioTypeStyle(note({ type: "writtenQuestions" })).toneClass).toBe(
      "studio-tone-written"
    );
  });

  it("gives literature-review reports their own colour and a book icon", () => {
    const style = studioTypeStyle(
      note({ type: "report", metadata: { reportType: "literature_review" } })
    );
    expect(style.tileClass).toBe("bg-studio-literature/10 text-studio-literature");
    expect(style.icon).toBe(BookOpen);
  });

  it("keeps ordinary reports on the report colour", () => {
    expect(
      studioTypeStyle(note({ type: "report", metadata: { reportType: "briefing_doc" } })).toneClass
    ).toBe("studio-tone-report");
  });

  it("falls back to a muted tile for unknown types", () => {
    const style = studioTypeStyle(note({ type: "text", content: "" }));
    expect(style.tileClass).toBe("bg-muted text-muted-foreground");
    expect(style.toneClass).toBe("");
    expect(style.icon).toBe(FileText);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test src/features/studio/studioTypeStyle.test.ts`
Expected: FAIL with "Failed to resolve import ./studioTypeStyle".

- [ ] **Step 3: Implement**

```ts
import {
  AudioLines,
  BookOpen,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  type LucideIcon,
  MessageSquareText,
  Table2,
} from "lucide-react";
import { isReportNote, type Note } from "@/shared/types/index";
import { isLiteratureReviewReportType } from "@/shared/types/reportTypes";

type StudioTypeKey =
  | "audio"
  | "mindmap"
  | "report"
  | "flashcard"
  | "quiz"
  | "infographic"
  | "written"
  | "spreadsheet"
  | "note"
  | "literature";

interface StudioTypeStyle {
  icon: LucideIcon;
  /** Tile fill and icon colour. */
  tileClass: string;
  /** Sets --studio-tone for decorations such as the generating Sheen. Empty means primary. */
  toneClass: string;
}

// Literal class strings so Tailwind generates them.
const STYLES: Record<StudioTypeKey, StudioTypeStyle> = {
  audio: {
    icon: AudioLines,
    tileClass: "bg-studio-audio/10 text-studio-audio",
    toneClass: "studio-tone-audio",
  },
  mindmap: {
    icon: GitFork,
    tileClass: "bg-studio-mindmap/10 text-studio-mindmap",
    toneClass: "studio-tone-mindmap",
  },
  report: {
    icon: FileText,
    tileClass: "bg-studio-report/10 text-studio-report",
    toneClass: "studio-tone-report",
  },
  flashcard: {
    icon: Layers,
    tileClass: "bg-studio-flashcard/10 text-studio-flashcard",
    toneClass: "studio-tone-flashcard",
  },
  quiz: {
    icon: HelpCircle,
    tileClass: "bg-studio-quiz/10 text-studio-quiz",
    toneClass: "studio-tone-quiz",
  },
  infographic: {
    icon: Image,
    tileClass: "bg-studio-infographic/10 text-studio-infographic",
    toneClass: "studio-tone-infographic",
  },
  written: {
    icon: MessageSquareText,
    tileClass: "bg-studio-written/10 text-studio-written",
    toneClass: "studio-tone-written",
  },
  spreadsheet: {
    icon: Table2,
    tileClass: "bg-studio-spreadsheet/10 text-studio-spreadsheet",
    toneClass: "studio-tone-spreadsheet",
  },
  note: {
    icon: FileText,
    tileClass: "bg-studio-note/10 text-studio-note",
    toneClass: "studio-tone-note",
  },
  literature: {
    icon: BookOpen,
    tileClass: "bg-studio-literature/10 text-studio-literature",
    toneClass: "studio-tone-literature",
  },
};

const FALLBACK: StudioTypeStyle = {
  icon: FileText,
  tileClass: "bg-muted text-muted-foreground",
  toneClass: "",
};

const NOTE_TYPE_KEY: Partial<Record<Note["type"], StudioTypeKey>> = {
  audio: "audio",
  audioOverview: "audio",
  flashcard: "flashcard",
  report: "report",
  quiz: "quiz",
  mindmap: "mindmap",
  writtenQuestions: "written",
  infographic: "infographic",
  spreadsheet: "spreadsheet",
  note: "note",
};

/** Icon and colour classes for a Studio note's type (Saved list tiles, generating Sheen). */
export function studioTypeStyle(note: Note): StudioTypeStyle {
  const key =
    isReportNote(note) && isLiteratureReviewReportType(note.metadata.reportType)
      ? "literature"
      : NOTE_TYPE_KEY[note.type];
  return key ? STYLES[key] : FALLBACK;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test src/features/studio/studioTypeStyle.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/studio/studioTypeStyle.ts apps/web/src/features/studio/studioTypeStyle.test.ts
git commit -m "feat(studio): studioTypeStyle maps note types to icons and colour tokens"
```

---

### Task 5: `useJustFinished(status)`

**Files:**
- Create: `apps/web/src/features/studio/hooks/useJustFinished.ts`
- Test: `apps/web/src/features/studio/hooks/useJustFinished.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJustFinished } from "./useJustFinished";

type Props = { status: string | undefined };

describe("useJustFinished", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is true for a moment after generating turns into completed", () => {
    const { result, rerender } = renderHook(({ status }: Props) => useJustFinished(status, 1000), {
      initialProps: { status: "generating" },
    });
    expect(result.current).toBe(false);
    rerender({ status: "completed" });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it("stays false for a note that mounts already completed", () => {
    const { result } = renderHook(({ status }: Props) => useJustFinished(status), {
      initialProps: { status: "completed" },
    });
    expect(result.current).toBe(false);
  });

  it("stays false when generation fails", () => {
    const { result, rerender } = renderHook(({ status }: Props) => useJustFinished(status), {
      initialProps: { status: "generating" },
    });
    rerender({ status: "failed" });
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test src/features/studio/hooks/useJustFinished.test.ts`
Expected: FAIL with "Failed to resolve import ./useJustFinished".

- [ ] **Step 3: Implement**

```ts
import { useEffect, useRef, useState } from "react";

/** True for `ms` after `status` goes from "generating" to "completed": the Saved row's finish moment. */
export function useJustFinished(status: string | undefined, ms = 1400): boolean {
  const previous = useRef(status);
  const [justFinished, setJustFinished] = useState(false);

  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (was !== "generating" || status !== "completed") return;
    setJustFinished(true);
    const timer = setTimeout(() => setJustFinished(false), ms);
    return () => clearTimeout(timer);
  }, [status, ms]);

  return justFinished;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test src/features/studio/hooks/useJustFinished.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/studio/hooks/useJustFinished.ts apps/web/src/features/studio/hooks/useJustFinished.test.ts
git commit -m "feat(studio): useJustFinished flags the moment a generation completes"
```

---

### Task 6: `NoteIcon` on tokens

**Files:**
- Rewrite: `apps/web/src/features/studio/components/NoteIcon.tsx`

`NoteItem.test.tsx` in Task 7 covers its rendering. `NoteIcon` has no logic of its own beyond `studioTypeStyle`, which Task 4 tests.

- [ ] **Step 1: Replace the file**

```tsx
import type React from "react";
import type { Note } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { studioTypeStyle } from "../studioTypeStyle";

interface NoteIconProps {
  note: Note;
  /** Plays the one-off pop when the note has just finished generating. */
  popped?: boolean;
}

/**
 * The type tile on a Saved row, coloured like the Create grid (STUDIO_TOOLS). While the note is
 * generating, its type icon bobs in place of a spinner; the row's Sheen and progress bar carry the
 * rest of the progress signal.
 */
export const NoteIcon: React.FC<NoteIconProps> = ({ note, popped = false }) => {
  const { icon: Icon, tileClass } = studioTypeStyle(note);
  const generating = note.status === "generating";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        tileClass,
        popped && "animate-studio-pop motion-reduce:animate-none"
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          generating && "animate-studio-bob motion-reduce:animate-none"
        )}
      />
    </span>
  );
};
```

- [ ] **Step 2: Typecheck**

Run from the repo root: `bun run typecheck:web`
Expected: PASS. `NoteItem` still calls `<NoteIcon note={note} />`, which remains valid.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/studio/components/NoteIcon.tsx
git commit -m "refactor(studio): NoteIcon on studio tokens, bobbing while generating"
```

---

### Task 7: `NoteItem` as a `Card` with the Sheen, `Progress` and a shadcn menu; `NoteListView` follows

**Files:**
- Rewrite: `apps/web/src/features/studio/components/NoteItem.tsx`
- Modify: `apps/web/src/features/studio/components/NoteListView.tsx`
- Test: `apps/web/src/features/studio/components/NoteItem.test.tsx`

E2E contracts to keep: `data-testid="studio-note-card"`, the `More options` label, `[data-note-item-menu]` on the open menu with `Rename` and `Delete` items, and the `Edit note title` input (see `e2e/helpers/studio-assertions.ts`).

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { Note } from "@/shared/types/index";
import { NoteItem } from "./NoteItem";

const note = (fields: Record<string, unknown> = {}) =>
  ({
    id: "n1",
    type: "flashcard",
    title: "SQL Joins",
    preview: "8 Flashcards · Medium",
    status: "completed",
    metadata: {},
    ...fields,
  }) as unknown as Note;

const handlers = () => ({
  onEditTitleChange: vi.fn(),
  onEditStart: vi.fn(),
  onEditSave: vi.fn(),
  onEditCancel: vi.fn(),
  onEditKeyDown: vi.fn(),
  onClick: vi.fn(),
  onDelete: vi.fn(),
});

function renderItem(n: Note, extra: Partial<React.ComponentProps<typeof NoteItem>> = {}) {
  const h = handlers();
  render(<NoteItem note={n} isEditing={false} editTitle="" {...h} {...extra} />);
  return h;
}

describe("NoteItem", () => {
  it("opens the note when its row is clicked", async () => {
    const h = renderItem(note());
    await userEvent.click(screen.getByRole("button", { name: /SQL Joins/ }));
    expect(h.onClick).toHaveBeenCalledOnce();
  });

  it("shows the current step and a determinate bar while generating", () => {
    renderItem(
      note({
        status: "generating",
        metadata: { currentStep: "Drafting cards 2 of 8", progress: 40 },
      })
    );
    expect(screen.getByTestId("studio-note-card")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Drafting cards 2 of 8")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Generation progress" })).toHaveAttribute(
      "aria-valuenow",
      "40"
    );
    expect(screen.queryByRole("button", { name: /SQL Joins/ })).not.toBeInTheDocument();
  });

  it("sweeps an indeterminate bar before the job reports a percentage", () => {
    renderItem(note({ status: "generating", metadata: {} }));
    expect(screen.getByRole("progressbar", { name: "Generation progress" })).toHaveAttribute(
      "data-state",
      "indeterminate"
    );
  });

  it("deletes from the menu", async () => {
    const h = renderItem(note());
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(h.onDelete).toHaveBeenCalledOnce();
  });

  it("keeps focus in the title input after choosing Rename", async () => {
    function Harness() {
      const [editing, setEditing] = React.useState(false);
      const [title, setTitle] = React.useState("SQL Joins");
      return (
        <NoteItem
          note={note()}
          isEditing={editing}
          editTitle={title}
          {...handlers()}
          onEditStart={() => setEditing(true)}
          onEditTitleChange={setTitle}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Edit note title" })).toHaveFocus();
  });

  it("offers inline play for a finished audio overview", async () => {
    const onPlayAudio = vi.fn();
    renderItem(note({ type: "audioOverview", audioUrl: "https://x/a.mp3" }), { onPlayAudio });
    await userEvent.click(screen.getByRole("button", { name: "Play audio overview" }));
    expect(onPlayAudio).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun run test src/features/studio/components/NoteItem.test.tsx`
Expected: several FAIL:
- the old row has no `button` named after the title;
- its progress bar has no accessible name;
- its menu has no `menuitem` roles;
- it still requires the `isMenuOpen`, `onMenuToggle` and `onMenuClose` props.

- [ ] **Step 3: Replace `NoteItem.tsx`**

```tsx
import { MoreVertical, Pencil, Play, Trash2 } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Progress } from "@/shared/components/ui/progress";
import { isAudioNote, isAudioOverviewNote, type Note } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { useJustFinished } from "../hooks/useJustFinished";
import { studioTypeStyle } from "../studioTypeStyle";
import {
  getStudioGeneratingListLines,
  type StudioGeneratingListLines,
} from "../utils/studioGenerationLabels";
import { NoteIcon } from "./NoteIcon";

interface NoteItemProps {
  note: Note;
  isEditing: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  onEditStart: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditKeyDown: (e: React.KeyboardEvent) => void;
  onClick: () => void;
  onDelete: () => void;
  onPlayAudio?: (note: Note) => void;
}

/** Step text, percentage and progress bar for a generating row. The step text rolls in as it changes. */
function GeneratingStatus({ lines, preview }: { lines: StudioGeneratingListLines; preview: string }) {
  return (
    <div className="mt-2 min-w-0 space-y-2">
      {preview ? (
        <p className="truncate font-serif text-sm leading-snug text-muted-foreground">{preview}</p>
      ) : null}
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p
          key={lines.primary}
          className="min-w-0 flex-1 truncate font-serif text-xs leading-snug text-foreground animate-in fade-in slide-in-from-bottom-1 duration-300"
        >
          {lines.primary}
        </p>
        {lines.progressPercent !== null ? (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {lines.progressPercent}%
          </span>
        ) : null}
      </div>
      <Progress value={lines.progressPercent} size="sm" glint aria-label="Generation progress" />
    </div>
  );
}

/**
 * One Saved row: type tile, title (inline rename) and preview, plus play and a ⋮ menu.
 * While generating, a Sheen in the type colour sweeps across it; when it finishes it glows once.
 */
export const NoteItem: React.FC<NoteItemProps> = ({
  note,
  isEditing,
  editTitle,
  onEditTitleChange,
  onEditStart,
  onEditSave,
  onEditCancel: _onEditCancel,
  onEditKeyDown,
  onClick,
  onDelete,
  onPlayAudio,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when "Rename" is picked, so the menu's close doesn't pull focus back from the title input.
  const renameRequestedRef = useRef(false);
  const justFinished = useJustFinished(note.status);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const isGenerating = note.status === "generating";
  const generatingLines = isGenerating ? getStudioGeneratingListLines(note) : null;
  const { toneClass } = studioTypeStyle(note);

  const canPlayInline =
    Boolean(onPlayAudio) &&
    !isGenerating &&
    ((isAudioOverviewNote(note) && Boolean(note.audioUrl?.trim())) ||
      (note.type === "audio" && isAudioNote(note) && Boolean(note.metadata.audioUrl?.trim())));

  return (
    <Card
      variant={isGenerating ? "flush" : "interactive"}
      data-testid="studio-note-card"
      aria-busy={isGenerating || undefined}
      className="relative"
    >
      {isGenerating ? (
        <span
          aria-hidden
          className={cn("studio-sheen pointer-events-none absolute inset-0", toneClass)}
        />
      ) : null}
      {justFinished ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-studio-glow rounded-2xl ring-2 ring-success/40 ring-inset"
        />
      ) : null}
      <div className="flex items-start gap-2 p-3">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <NoteIcon note={note} />
            <Input
              ref={inputRef}
              aria-label="Edit note title"
              value={editTitle}
              onChange={(e) => onEditTitleChange(e.target.value)}
              onBlur={onEditSave}
              onKeyDown={onEditKeyDown}
            />
          </div>
        ) : isGenerating && generatingLines ? (
          <div
            role="group"
            aria-label={`${note.title}, ${generatingLines.primary}`}
            className="flex min-w-0 flex-1 items-start gap-3"
          >
            <NoteIcon note={note} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-sm font-bold leading-tight text-foreground">
                {note.title}
              </p>
              <GeneratingStatus lines={generatingLines} preview={note.preview} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <NoteIcon note={note} popped={justFinished} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-sm font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                {note.title}
              </span>
              <span
                className={cn(
                  "mt-1 block truncate font-serif text-xs tabular-nums text-muted-foreground",
                  justFinished && "animate-in fade-in duration-500"
                )}
              >
                {note.preview}
              </span>
            </span>
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          {canPlayInline ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Play audio overview"
              onClick={() => onPlayAudio?.(note)}
            >
              <Play className="fill-current text-studio-audio" />
            </Button>
          ) : null}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="More options"
                title="More options"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              data-note-item-menu
              onCloseAutoFocus={(e) => {
                if (renameRequestedRef.current) {
                  renameRequestedRef.current = false;
                  e.preventDefault();
                }
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  renameRequestedRef.current = true;
                  onEditStart();
                }}
              >
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
};
```

Check before moving on:
- **`StudioGeneratingListLines`:** confirm it is exported from `../utils/studioGenerationLabels`; it is, as `export interface StudioGeneratingListLines`.
- **`Button` size `icon-sm`:** it exists; `SourceListItem` uses it.
- **`DropdownMenuItem` `variant="destructive"`:** it exists; `SourceListItem` uses it.

- [ ] **Step 4: Update `NoteListView.tsx`**

1. Replace the imports:

```tsx
import { PenTool, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/components/ui/input-group";
import { Note, StudioTool } from "@/shared/types/index";
import { NoteItem } from "./NoteItem";
import { ToolGrid } from "./ToolGrid";
```

2. Delete `const [activeMenuId, setActiveMenuId] = useState<string | null>(null);` and the whole `React.useEffect` that handles click-outside, from `// Handle click outside to close menus` to its closing `}, [activeMenuId]);`. Radix closes the menu itself.

3. Replace the search `<div className="relative flex items-center"> … </div>` (the `Search` icon plus the raw `<input>`) with:

```tsx
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search notes"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </InputGroup>
```

4. In the `<NoteItem … />` call, delete the three props `isMenuOpen`, `onMenuToggle` and `onMenuClose`.

`React` is still needed for `React.FC` and `React.KeyboardEvent` in the props. Keep the default import if Biome reports nothing.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `bun run test src/features/studio/components/NoteItem.test.tsx`
Expected: PASS (6 tests).

If "keeps focus in the title input after choosing Rename" fails because focus is on the trigger:
- confirm the `onCloseAutoFocus` guard is in place;
- confirm the effect focuses `inputRef`;
- confirm `Input` forwards `ref`. React 19 passes `ref` as a prop to function components, so shadcn's `Input` forwards it. If it doesn't, add `autoFocus` to the `Input` as in `SourceListItem`.

- [ ] **Step 6: Typecheck and run the Studio tests**

From the repo root: `bun run typecheck:web`. Then from `apps/web`: `bun run test src/features/studio`.
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/studio/components/NoteItem.tsx apps/web/src/features/studio/components/NoteItem.test.tsx apps/web/src/features/studio/components/NoteListView.tsx
git commit -m "feat(studio): Saved rows on Card with the generating Sheen and a shadcn menu"
```

---

### Task 8: `ToolGrid` tiles on `Card` and token colours

**Files:**
- Modify: `apps/web/src/shared/components/ui/card.tsx`, the `interactive` variant
- Modify: `apps/web/src/shared/components/ui/ui.smoke.test.tsx`
- Rewrite: `apps/web/src/features/studio/components/ToolGrid.tsx`
- Modify: `apps/web/src/shared/constants/index.ts`

- [ ] **Step 1: Write the failing test for the selected state**

Add to `ui.smoke.test.tsx`, next to the other `Card` tests (search for `variant="interactive"` or `Card`):

```tsx
  it("Card interactive shows a selected ring through data-selected", () => {
    render(
      <Card variant="interactive" data-selected data-testid="tile">
        x
      </Card>
    );
    expect(screen.getByTestId("tile").className).toContain(
      "data-[selected=true]:ring-primary/40"
    );
  });
```

`data-selected` with no value renders `data-selected="true"` in React, so the variant matches.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `bun run test src/shared/components/ui/ui.smoke.test.tsx -t "selected ring"`
Expected: FAIL. The class is missing.

- [ ] **Step 3: Extend the `interactive` variant in `card.tsx`**

```tsx
        // Clickable cards: the inner <button> carries the focus ring; the card lifts on hover.
        // data-selected marks the chosen card (e.g. the marketing preview's active tool).
        interactive:
          "relative gap-0 overflow-hidden py-0 shadow-xs transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-md motion-safe:active:scale-99 data-[selected=true]:shadow-md data-[selected=true]:ring-2 data-[selected=true]:ring-primary/40",
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `bun run test src/shared/components/ui/ui.smoke.test.tsx`
Expected: PASS.

- [ ] **Step 5: Replace `ToolGrid.tsx`**

```tsx
import {
  AudioLines,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  type LucideIcon,
  MessageSquareText,
  Presentation,
  Table2,
} from "lucide-react";
import type React from "react";
import { Card } from "@/shared/components/ui/card";
import { StudioTool } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";

interface ToolGridProps {
  tools: StudioTool[];
  onToolClick: (toolId: string) => void;
  /** When set, that tool card shows a selection ring (e.g. marketing preview). */
  activeToolId?: string | null;
}

const IconMap: Record<string, LucideIcon> = {
  AudioLines,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  Image,
  Presentation,
  MessageSquareText,
  Table2,
};

/**
 * ToolGrid component displays creation tool cards in a responsive grid.
 */
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onToolClick, activeToolId }) => {
  return (
    <div
      className="@container space-y-3"
      data-onboarding="studio-tool-grid"
      data-testid="studio-tool-grid"
    >
      <h3 className="px-1 font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Create
      </h3>
      <div className="grid grid-cols-2 gap-3 @min-[450px]:grid-cols-3">
        {tools.map((tool) => {
          const Icon = IconMap[tool.iconName] ?? FileText;
          const isActive = activeToolId != null && activeToolId === tool.id;
          return (
            <Card key={tool.id} variant="interactive" data-selected={isActive || undefined}>
              <button
                type="button"
                aria-label={tool.label}
                onClick={() => onToolClick(tool.id)}
                className="group flex h-22 flex-col justify-between p-3 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-5 opacity-90 transition-transform motion-safe:group-hover:scale-110",
                    tool.color
                  )}
                />
                <span className="line-clamp-2 font-display text-xs font-medium leading-tight tracking-tight text-foreground">
                  {tool.label}
                </span>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
```

- **The `Image` fix:** `IconMap` was missing `Image`, so the Infographic tile showed the fallback `FileText` icon. Adding it shows the right icon.
- **Keyboard:** the tile is a real `<button>`, so Enter and Space work natively and the hand-written `onKeyDown` is gone.

- [ ] **Step 6: Point the tool colours at the tokens in `shared/constants/index.ts`**

```ts
export const STUDIO_TOOLS: StudioTool[] = [
  { id: "audio", label: "Audio Overview", iconName: "AudioLines", color: "text-studio-audio" },
  { id: "mindmap", label: "Mind Map", iconName: "GitFork", color: "text-studio-mindmap" },
  { id: "reports", label: "Reports", iconName: "FileText", color: "text-studio-report" },
  { id: "flashcards", label: "Flashcards", iconName: "Layers", color: "text-studio-flashcard" },
  { id: "quiz", label: "Quiz", iconName: "HelpCircle", color: "text-studio-quiz" },
  { id: "infographic", label: "Infographic", iconName: "Image", color: "text-studio-infographic" },
  {
    id: "writtenQuestions",
    label: "Written Questions",
    iconName: "MessageSquareText",
    color: "text-studio-written",
  },
  {
    id: "spreadsheets",
    label: "Spreadsheets",
    iconName: "Table2",
    color: "text-studio-spreadsheet",
  },
];
```

- [ ] **Step 7: Check the other `ToolGrid` users still compile and pass**

Run from the repo root: `bun run typecheck:web`. Then from `apps/web`: `bun run test src/features/onboarding src/features/auth`.
Expected: PASS. The onboarding test targets `data-onboarding="studio-tool-grid"`, which is unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/shared/components/ui/card.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx apps/web/src/features/studio/components/ToolGrid.tsx apps/web/src/shared/constants/index.ts
git commit -m "feat(studio): Create grid tiles on interactive Card with studio colour tokens"
```

---

### Task 9: `ActiveNoteView` buttons and the panel edge

**Files:**
- Modify: `apps/web/src/features/studio/components/ActiveNoteView.tsx`, the report editor toolbar at about lines 52–80
- Modify: `apps/web/src/features/studio/components/StudioPanel.tsx`, about line 286

- [ ] **Step 1: Replace the two hand-rolled buttons in the report editor**

```tsx
      <div className="flex items-center justify-end gap-2 p-3 border-b border-border bg-card/50 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
          <Save />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
```

Add `import { Button } from "@/shared/components/ui/button";` if the file doesn't already import it.

- [ ] **Step 2: Fix the textarea's arbitrary height**

In the same component, change `min-h-[200px]` to `min-h-50` in the `<textarea>` className. Change nothing else.

- [ ] **Step 3: Drop the panel's thick edge in `StudioPanel.tsx`**

```tsx
      <div className="relative h-full w-full min-w-0 bg-sidebar flex flex-col overflow-hidden">
```

This removes `border-l-2 border-border` and the no-op `opacity-100`. It matches `SourcesPanel`, which separates panels with fill and the resize handle.

- [ ] **Step 4: Typecheck**

Run from the repo root: `bun run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/studio/components/ActiveNoteView.tsx apps/web/src/features/studio/components/StudioPanel.tsx
git commit -m "refactor(studio): report editor buttons on Button; panel edge by fill like Sources"
```

---

### Task 10: Lock the panel files into `MIGRATED`; note the spec change

**Files:**
- Modify: `apps/web/eslint.config.mjs`
- Regenerate: `apps/web/design-lint-baseline.json`
- Modify: `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`

- [ ] **Step 1: Confirm the seven files are clean**

Run from `apps/web`:

```bash
npx eslint src/features/studio/components/{StudioPanel,StudioPanelHeader,ToolGrid,NoteItem,NoteIcon,NoteListView,ActiveNoteView}.tsx
```

Expected: no output (0 problems). If anything is reported:
- fix it at the call site with layout-only classes or an existing variant, following the rules in `.agents/skills/shadcn/SKILL.md`;
- if `studio-sheen` or `studio-tone-*` is reported as unknown, fall back to static `@utility studio-tone-audio { … }` blocks (Task 2, Step 8);
- if `className="relative"` on `Card` is reported, remove it, because `interactive` already includes `relative`. For the `flush` variant, wrap the content in an inner `<div className="relative">` that holds the Sheen span.

- [ ] **Step 2: Add the files to `MIGRATED`**

In `apps/web/eslint.config.mjs`, append to the `MIGRATED` array:

```js
  // Studio (#264), migrated PR by PR; PR 8 replaces these with src/features/studio/**/*.tsx.
  "src/features/studio/components/StudioPanel.tsx",
  "src/features/studio/components/StudioPanelHeader.tsx",
  "src/features/studio/components/ToolGrid.tsx",
  "src/features/studio/components/NoteItem.tsx",
  "src/features/studio/components/NoteIcon.tsx",
  "src/features/studio/components/NoteListView.tsx",
  "src/features/studio/components/ActiveNoteView.tsx",
```

- [ ] **Step 3: Lower the baseline**

Run from `apps/web`: `bun run lint:design:update`, then `git diff design-lint-baseline.json`.
Expected: `features/studio` drops by 23, from 380 to 357. If the `shared` count changes, it can only go down. If it went up, a change in Task 3 or Task 8 added a finding to a primitive; fix that before continuing.

- [ ] **Step 4: Note the deviation in the spec**

In `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`, section "1. Motion foundation (PR 1)", change the sentence that introduces the helpers. Before:

```markdown
**Studio motion helpers** live in `features/studio/motion/`, so later PRs reuse them:
```

After:

```markdown
**Studio motion helpers** live in `features/studio/motion/` and ship in PR 2 with their first users (Knip fails CI on unused exports), so PRs 2 and 3 share them:
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/eslint.config.mjs apps/web/design-lint-baseline.json docs/superpowers/specs/2026-10-04-studio-redesign-design.md
git commit -m "chore(web): Studio panel files join MIGRATED; baseline drops by 23"
```

---

### Task 11: Gates and visual check

- [ ] **Step 1: Run every gate, one at a time, from the repo root**

```bash
bun run typecheck:web
bun run typecheck:convex
bun run lint
bun run --cwd apps/web lint:design
bun run --cwd apps/web test
bun run knip
```

Expected: all pass.

Run `bun run test:convex` too, even though PR 1 touches no Convex code, as the standard gate.

Then confirm the Playwright suites still parse with the unchanged selectors:

```bash
npx playwright test --list e2e/studio | tail -3
```

- [ ] **Step 2: Visual check in the browser pane**

Use the `web-studio` server from Task 1 at desktop (1440×900) and phone (`mobile` preset) widths. Light mode comes from the account preference; switch the app's theme to check dark as well. Check:

1. **Create grid:**
   - the tiles lift on hover;
   - the colours match `main`, with Infographic now showing its image icon;
   - keyboard Tab and Enter open a tool;
   - the auth page's tool-grid preview (`/auth`) still shows the selected ring.
2. **Saved list:**
   - rows are soft cards;
   - the ⋮ menu opens and closes on an outside click;
   - **Rename** puts the cursor in the title field (the earlier "Rename does nothing" report). Rename a note, then rename it back.
   - Don't click Delete in the shared browser; the unit test covers it.
3. **Generating:**
   - start a short generation (Flashcards on a small notebook), but only after asking the user, because generation spends credits;
   - or run this in the page's console on a live generating row:

     ```js
     document.querySelector('[aria-busy=true] .studio-sheen') !== null
     ```

   - Expected: the Sheen sweeps, the icon bobs, the step text rolls, and the bar sweeps then fills with a glint. When it finishes, the row glows once and the icon pops.
4. **Reduced motion is on in this pane by default:**
   - the Sheen and the glint are hidden, while the bar still sweeps;
   - the bob and pop are off;
   - dialogs fade without sliding.
5. **Report editor (Edit report):** the Cancel and Save buttons look like the rest of the app.

Take a screenshot of the Saved list and the Create grid for the PR.

- [ ] **Step 3: Remove the temporary launch configuration**

Delete the `web-studio` entry from `.claude/launch.json` once the PR is open, and stop its server by its preview id.

---

### Task 12: Open the PR

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feature/studio-foundation
gh pr create --title "feat(studio): motion foundation and Studio panel on the design system (#264, 1/8)" --body-file "$SCRATCHPAD/pr-studio-1.md"
```

`$SCRATCHPAD` is the session's scratchpad directory; write the body there first.

The body should cover:
- **What changed:**
  - reduced motion (and why);
  - the tokens;
  - the Sheen;
  - the `Progress` variants;
  - the `Card` selected state;
  - the menu rewrite and the Rename fix;
  - the Infographic icon fix;
  - the panel edge.
- **Out of scope:** the motion helpers, which move to PR 2.
- **Gates.**
- **What the visual check covered**, and what it didn't.

Finish with the `🤖 Generated with [Claude Code](https://claude.com/claude-code)` attribution line, and add "Part of #264" on its own line.

- [ ] **Step 2: Bind the PR in the app**

Use `ccd_pr get_status` / `bind_pr`.

- [ ] **Step 3: Merge**

Ask the user whether to merge once CI passes and reviews are done. Their earlier merge approvals covered specific PRs, not this one. If they agree, run `gh pr merge <n> --squash --auto` after review threads are resolved.
