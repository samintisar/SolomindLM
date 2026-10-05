# Studio Flashcards "Deck" (PR 3 of #264) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give flashcards the "Deck" feel the user chose, and move the four flashcard files onto the design system at 0 lint findings.

**What "Deck" means:**
- a real 3D flip that also works on desktop with reduced motion on;
- the next cards peek out behind the current one;
- a rating throws the card off in its direction;
- a progress bar stacked by rating colour, a streak chip, and bursts on Good and Easy;
- a session-complete screen with a medal and a per-rating tally.

**Architecture:**
- **Shared flashcard pieces** live in `features/studio/components/flashcards/`. Browse mode and study mode both use them.
  - `ratings.ts`: the four ratings, their keys, colours and throw directions.
  - `FlashcardContent.tsx`: the front and back renderers. This removes the duplicate copies in `FlashcardView` and `StudyMode`.
  - `FlipCard.tsx`: the 3D card.
  - `RatingButton.tsx`.
  - `TallyTile.tsx`.
- **`StudyMode`** is rewritten around them. Its rating logic and the `onComplete` stats stay the same.
- **`FlashcardView`:**
  - It keeps all of its data logic: hooks, index restore, progress saving, the show-mastered sync, and card add, edit and delete.
  - Its markup moves to `Toggle`, `Button`, `Progress` and `Empty`.
  - The inline `<style>` block goes away.
- **`EditCardModal`** moves to the shared `Dialog`, with `Field`, `Textarea` and an `AlertDialog` to confirm Delete.
- **`ProficiencyBadge`** uses semantic tokens.

**Reused from PR 2:**
- `features/studio/motion/`: `useStreak`, `useCountUp` and `<Burst />`.
- `features/studio/components/practice/StreakChip`.

**Tech Stack:** React 19, Tailwind v4 (native `perspective-*`, `transform-3d`, `backface-hidden`, `rotate-y-*`), `tw-animate-css` (`animate-in` and `animate-out` with `slide-*`, `spin-*`, `zoom-*` and `fade-*`), shadcn/ui (Radix), Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md` §3. Mockup: `.superpowers/brainstorm/*/content/flashcards-v3.html`, option A "Deck".

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-flashcards`, based on `origin/main` after PR 2 (#346).
- **One test file:** `bun run test <path>`, from `apps/web`.
- **Typecheck:** `bun run typecheck:web`, from the root.

**Reduced motion (the policy from PR 1):**
- `tw-animate-css` `animate-in` and `animate-out` keep their fade and lose their slide, zoom and spin. A global rule in `index.css` resets those variables, so throws and rises turn into fades for free.
- The flip itself is a Tailwind `rotate-y-*` transform, which that rule does not reach. It needs explicit `motion-reduce:` guards so the faces cross-fade instead of turning.

**Contracts that must keep working** (`e2e/studio/flashcards-study.spec.ts`):

| What | Detail |
|---|---|
| Mode buttons | buttons named `Study Mode` and `Browse Mode` (role `button`) |
| Reveal | a button named `Reveal answer` |
| Rating buttons | names that match `/Again\s+in 1 min/`, `/Hard\s+in 6 min/`, `/Good\s+in 10 min/` and `/Easy\s+in 4 days/`. There must be whitespace between the label and the interval in the accessible name. |
| Progress text | `1 of 3 reviewed`, as one element's text |
| Card text | the current card's front text is visible and appears only once. The peeking cards behind it are blank shapes. |
| Badge | `Progressing` appears in browse mode after a Good rating |

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`):
- Primitives get layout and sizing classes only.
- No palette colours.
- No arbitrary values (`[...]`), including `h-[min(...)]`, `[scrollbar-gutter:stable]` and `[&_code]:…`. Remove them.
- No `dark:`.
- No thick or loud borders. A raw `<button>` gets no border at all: use a ring or shadow.
- `style` may only set CSS custom properties.

Biome warns on `key={index}`. That's acceptable.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/index.css` | Modify | `@utility studio-segment` (width from `--studio-segment`) |
| `components/flashcards/ratings.ts` (+ test) | Create | `RATINGS` config and `ratingForKey` |
| `components/flashcards/FlashcardContent.tsx` | Create | `FlashcardFront` and `FlashcardBack` markdown renderers |
| `components/flashcards/FlipCard.tsx` (+ test) | Create | 3D flip card with a reduced-motion cross-fade |
| `components/flashcards/RatingButton.tsx` (+ test) | Create | Rating button with interval subtext, key hint tooltip and `aria-keyshortcuts` |
| `components/flashcards/TallyTile.tsx` | Create | One rating's count-up tile on the complete screen |
| `components/views/StudyMode.tsx` (+ new test) | Rewrite | Deck, throw, stacked progress, streak, keys and complete screen |
| `components/views/FlashcardView.tsx` (+ new test) | Rewrite markup | Mode toggles, browse card, navigation, empty states |
| `components/views/EditCardModal.tsx` (+ new test) | Rewrite | `Dialog` + `Field` + `AlertDialog` |
| `components/views/ProficiencyBadge.tsx` (+ new test) | Modify | Token colours |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | Modify | The four files and `components/flashcards/**` join `MIGRATED`; the baseline drops |

All `components/…` paths are under `apps/web/src/features/studio/`.

---

### Task 1: Shared flashcard pieces

**Files:**
- Create:
  - `ratings.ts`, `ratings.test.ts`
  - `FlashcardContent.tsx`
  - `FlipCard.tsx`, `FlipCard.test.tsx`
  - `RatingButton.tsx`, `RatingButton.test.tsx`
  - `TallyTile.tsx`

  All under `components/flashcards/`.
- Modify: `apps/web/src/index.css` (one `@utility`).

- [ ] **Step 1: `ratings.ts`.**

```ts
import type { SrsRating } from "@/features/studio/utils/srsReviewLabels";

export type { SrsRating };

export interface RatingConfig {
  rating: SrsRating;
  label: string;
  /** Keyboard shortcut while the answer is showing. */
  key: "1" | "2" | "3" | "4";
  /** Text colour of the label and tally number. */
  toneText: string;
  /** Hover fill of the button. */
  toneHover: string;
  /** Fill of this rating's slice of the stacked progress bar. */
  toneBar: string;
  /** tw-animate-css exit classes: where a card rated this way is thrown. */
  throwClass: string;
}

export const RATINGS: readonly RatingConfig[] = [
  {
    rating: "again",
    label: "Again",
    key: "1",
    toneText: "text-destructive",
    toneHover: "hover:bg-destructive-muted",
    toneBar: "bg-destructive",
    throwClass: "slide-out-to-left -spin-out-12",
  },
  {
    rating: "hard",
    label: "Hard",
    key: "2",
    toneText: "text-warning",
    toneHover: "hover:bg-warning-muted",
    toneBar: "bg-warning",
    throwClass: "zoom-out-95",
  },
  {
    rating: "good",
    label: "Good",
    key: "3",
    toneText: "text-success",
    toneHover: "hover:bg-success-muted",
    toneBar: "bg-success",
    throwClass: "slide-out-to-right spin-out-12",
  },
  {
    rating: "easy",
    label: "Easy",
    key: "4",
    toneText: "text-info",
    toneHover: "hover:bg-info-muted",
    toneBar: "bg-info",
    throwClass: "slide-out-to-top -spin-out-3",
  },
];

export function ratingForKey(key: string): RatingConfig | undefined {
  return RATINGS.find((r) => r.key === key);
}
```

Check that `SrsRating` is exported from `srsReviewLabels.ts`; it is, as `export type SrsRating`. Test (`ratings.test.ts`):
- `ratingForKey("1")` is again, `ratingForKey("4")` is easy, and `ratingForKey("5")` is undefined;
- the four ratings are in order;
- the four keys are unique.

- [ ] **Step 2: `index.css`.** Next to the other studio utilities, add:

```css
/* One slice of a stacked progress bar; width comes from --studio-segment (style may only set custom properties). */
@utility studio-segment {
  width: var(--studio-segment, 0%);
}
```

- [ ] **Step 3: `FlashcardContent.tsx`.**
  - Move `renderCardFront` from `StudyMode` (the cleaner copy) into `export function FlashcardFront({ card }: { card: Flashcard })`.
  - Move the answer renderer into `export function FlashcardBack({ card }: { card: Flashcard })`, using `answerMarkdownComponents` from `StudyMode`.
  - Both lazy-load `MarkdownRenderer` the way the current files do, and use `sanitizeMarkdown`.
  - Changes:
    - Drop `prose-base` and `sm:prose-lg`: they're dead, because there's no typography plugin. Keep `prose max-w-none text-center`.
    - Drop the `[&_code]…` and `[&_.katex]…` arbitrary chains on the back. The house `.prose` in `index.css` styles code.
    - Wrap the back in `overflow-x-auto` so wide KaTeX scrolls.
    - True/false chips: `text-success` for "✓ True" and `text-destructive` for "✗ False". No palette and no `dark:`.
    - Fill-blank keeps the `card.front.replace(/_+/g, "______")` transform.
    - Suspense fallbacks use `bg-muted` pulses.

- [ ] **Step 4: Write the failing `FlipCard` test** (`FlipCard.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FlipCard } from "./FlipCard";

describe("FlipCard", () => {
  it("shows the front until flipped, then the back", () => {
    const { rerender } = render(<FlipCard flipped={false} front={<p>Q</p>} back={<p>A</p>} />);
    expect(screen.getByText("Q").closest("[data-face]")).toHaveAttribute("data-shown", "true");
    expect(screen.getByText("A").closest("[data-face]")).toHaveAttribute("data-shown", "false");
    rerender(<FlipCard flipped front={<p>Q</p>} back={<p>A</p>} />);
    expect(screen.getByText("A").closest("[data-face]")).toHaveAttribute("data-shown", "true");
  });

  it("activates on click, Enter and Space when interactive", async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<FlipCard flipped={false} front="Q" back="A" onActivate={onActivate} label="Flashcard question" />);
    const card = screen.getByRole("button", { name: "Flashcard question" });
    await user.click(card);
    card.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it("is not a button when it has no action", () => {
    render(<FlipCard flipped={false} front="Q" back="A" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

Run `bun run test src/features/studio/components/flashcards/FlipCard.test.tsx`. Expected: FAIL, because the module doesn't exist yet.

- [ ] **Step 5: Implement `FlipCard.tsx`.**

```tsx
import type React from "react";
import { cn } from "@/shared/utils/cn";

interface FlipCardProps {
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  /** Small line under each face ("Tap or Space to flip"). */
  frontFooter?: React.ReactNode;
  backFooter?: React.ReactNode;
  /** Makes the card a button (click, Enter, Space). */
  onActivate?: () => void;
  label?: string;
  /** "edit" rings the card in the primary colour. */
  tone?: "default" | "edit";
  className?: string;
}

// The swap lands when the card is edge-on: the house ease-out reaches 90° about 245ms into the
// 700ms turn. backface-visibility alone is unreliable (composited children such as the scroll area
// can bleed through mirrored), so the hidden face is also made invisible. Under reduced motion
// nothing turns and the faces cross-fade over 200ms.
const FACE =
  "absolute inset-0 flex flex-col items-center overflow-hidden rounded-2xl p-5 text-center shadow-lg ring-1 ring-hairline backface-hidden transition-[visibility,opacity] delay-245 duration-0 data-[shown=false]:invisible data-[shown=false]:opacity-0 sm:p-6 motion-reduce:delay-0 motion-reduce:duration-200";

export function FlipCard({
  flipped,
  front,
  back,
  frontFooter,
  backFooter,
  onActivate,
  label,
  tone = "default",
  className,
}: FlipCardProps) {
  const interactive = Boolean(onActivate);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (!onActivate) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "group h-72 w-full shrink-0 rounded-2xl outline-hidden perspective-distant focus-visible:ring-2 focus-visible:ring-ring sm:h-80",
        interactive && "cursor-pointer",
        className
      )}
    >
      <div
        data-flipped={flipped}
        className="relative size-full rounded-2xl transition-transform duration-700 ease-out transform-3d group-hover:-translate-y-1 data-[flipped=true]:rotate-y-180 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:data-[flipped=true]:rotate-y-0"
      >
        <div
          data-face="front"
          data-shown={!flipped}
          className={cn(FACE, "bg-card", tone === "edit" && "ring-2 ring-primary/40")}
        >
          <span className="mb-2 shrink-0 font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Question
          </span>
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full w-full flex-col items-center justify-center py-1 text-base font-medium text-foreground sm:text-lg">
              {front}
            </div>
          </div>
          {frontFooter}
        </div>
        <div
          data-face="back"
          data-shown={flipped}
          className={cn(FACE, "bg-muted/40 rotate-y-180 motion-reduce:rotate-y-0", tone === "edit" && "ring-2 ring-primary/40")}
        >
          <span className="mb-2 shrink-0 font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Answer
          </span>
          <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden">
            <div className="flex min-h-full w-full flex-col items-center justify-center py-1 text-base font-medium text-foreground sm:text-lg">
              {back}
            </div>
          </div>
          {backFooter}
        </div>
      </div>
    </div>
  );
}
```

Notes:
- **Tailwind classes:** `perspective-distant` (1200px), `transform-3d`, `backface-hidden`, `rotate-y-180` and `rotate-y-0` are native Tailwind v4 utilities. After implementing, open the app (or run `bun run build`) and check that the generated CSS contains them. If one is missing, add an `@utility` for it in `index.css` next to `studio-segment`.
- **Rotation:** `rotate-y-*` drives `transform`, and the hover lift drives `translate`. They compose. `transition-transform` covers both in v4.
- **Delay:** `delay-245` is a numeric transition delay. The current file already uses it.

Run the test. Expected: PASS (3).

- [ ] **Step 6: Write the failing `RatingButton` test** (`RatingButton.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RATINGS } from "./ratings";
import { RatingButton } from "./RatingButton";

describe("RatingButton", () => {
  it("names the button with the label and the interval, separated by a space", () => {
    render(<RatingButton config={RATINGS[0]} subtext="in 1 min" onRate={() => {}} />);
    expect(screen.getByRole("button", { name: /Again\s+in 1 min/ })).toHaveAttribute("aria-keyshortcuts", "1");
  });

  it("rates on click and not when disabled", async () => {
    const onRate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<RatingButton config={RATINGS[2]} subtext="in 10 min" onRate={onRate} />);
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(onRate).toHaveBeenCalledWith("good");
    rerender(<RatingButton config={RATINGS[2]} subtext="in 10 min" onRate={onRate} disabled />);
    await user.click(screen.getByRole("button", { name: /Good/ }));
    expect(onRate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Implement `RatingButton.tsx`.**
  - **Element:** a raw `<button type="button">` styled through a local `cva`, the same way `practice/QuizOption.tsx` does it.
  - **Base classes:** `flex flex-col items-center gap-0.5 rounded-xl bg-card px-2 py-2.5 font-sans shadow-xs ring-1 ring-hairline outline-hidden transition duration-200 ease-out hover:-translate-y-0.5 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100`.
  - **Rating colours:** add `config.toneHover` to the button, and `config.toneText` to the label.
  - **Content:**
    - `<span className="text-sm font-semibold …toneText">{label}</span>{" "}<span className="text-xs font-medium tabular-nums text-muted-foreground">{subtext}</span>`;
    - the `{" "}` text node gives the accessible name its space. It is invisible between flex items.
  - **Shortcut:** `aria-keyshortcuts={config.key}`. No visible number badge.
  - **Tooltip:** wrap the button in `Tooltip` > `TooltipTrigger asChild` > button. `TooltipContent` says `Press {config.key}`. Read `shared/components/ui/tooltip.tsx` to check whether `Tooltip` needs a provider. The shadcn version wraps its own.
  - **Props:** `{ config: RatingConfig; subtext: string; onRate: (rating: SrsRating) => void; disabled?: boolean; ref?: React.Ref<HTMLButtonElement> }`. Pass `ref` to the button (React 19 ref-as-prop).

  Run the test. Expected: PASS (2). If the Tooltip's portal breaks the role query in jsdom, open nothing: the test only needs the trigger.

- [ ] **Step 8: Implement `TallyTile.tsx`.**

```tsx
import { useCountUp } from "../../motion/useCountUp";
import type { RatingConfig } from "./ratings";
import { cn } from "@/shared/utils/cn";

/** One rating's count on the session-complete screen; counts up when it appears. */
export function TallyTile({ config, value, className }: { config: RatingConfig; value: number; className?: string }) {
  const shown = useCountUp(value, 700);
  return (
    <div className={cn("flex flex-col items-center rounded-xl bg-card py-3 shadow-xs ring-1 ring-hairline", className)}>
      <span className={cn("font-display text-xl font-semibold tabular-nums", config.toneText)}>{shown}</span>
      <span className="font-sans text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}
```

- [ ] **Step 9: Run the checks.**
  - `bun run test src/features/studio/components/flashcards`
  - `bun run typecheck:web`
  - `npx eslint src/features/studio/components/flashcards`, expecting 0 problems.

  Knip will flag these exports as unused until Task 2 imports them. That's expected inside the branch, and the PR as a whole uses them.

- [ ] **Step 10: Commit.**

```bash
git add apps/web/src/index.css apps/web/src/features/studio/components/flashcards
git commit -m "feat(studio): flashcard pieces: flip card, rating button, tally tile, ratings"
```

---

### Task 2: `StudyMode` as a deck

**Files:**
- Rewrite: `components/views/StudyMode.tsx`
- Create: `components/views/StudyMode.test.tsx`

**What stays:**
- the props (`cards`, `onComplete`, `onRateCard`, `onExit`) and the `DueFlashcard` export;
- `handleRating`'s flow: it awaits `onRateCard`, then counts, then moves to the next unreviewed card, then calls `onComplete` with the same `{ reviewed, correct, incorrect, longestStreak }`. Hard counts as correct, as it does today.
- `handleReset`, Previous and Next.

**What's new:**
- **Per-rating tally:** `useState<Record<SrsRating, number>>({ again: 0, hard: 0, good: 0, easy: 0 })`, incremented in `handleRating` and cleared in `handleReset`.
- **Streak chip:** use `useStreak`. Good and Easy call `record(true)`, Again calls `record(false)`, and Hard leaves the streak alone. Reset clears it. The chip is `practice/StreakChip`. Keep the existing `currentStreak` and `longestStreak` state for the stats; it's separate.
- **Thrown card:** add `const [thrown, setThrown] = useState<{ id: number; card: Flashcard; rating: SrsRating } | null>(null)`. Set it after `onRateCard` resolves, using an incrementing `id`. Clear it on `onAnimationEnd`, and also with a 700ms `setTimeout` fallback, since jsdom never fires animation events. Clear the timer on unmount.
- **Burst:** shown on Good and Easy (`thrown.rating === "good" || "easy"`), keyed by `thrown.id`.
- **Keyboard:**
  - Space or Enter reveals the answer.
  - 1–4 rate while the answer is showing.
  - Ignore events with modifiers, `repeat`, or `defaultPrevented`.
  - Ignore targets inside `input, textarea, select, [contenteditable='true'], [role='dialog']`.
  - For Space and Enter, also ignore targets inside `button, a, [role='button']`, so a focused control handles its own key.
- **Focus:** after Reveal, focus the Good button. After the card changes (rating, Previous or Next), focus `Reveal answer`. Use `{ preventScroll: true }`, and skip the very first mount: never steal focus on open.

- [ ] **Step 1: Write the failing tests** (`StudyMode.test.tsx`).

Build the cards with a helper:

```tsx
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard } from "@/shared/types";
import { StudyMode, type DueFlashcard } from "./StudyMode";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function deck(n: number): DueFlashcard[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    card: { front: `Front ${i + 1}`, back: `Back ${i + 1}`, type: "basic" } as unknown as Flashcard,
  }));
}

let onRateCard: ReturnType<typeof vi.fn>;
let onComplete: ReturnType<typeof vi.fn>;
beforeEach(() => {
  onRateCard = vi.fn().mockResolvedValue(undefined);
  onComplete = vi.fn();
});

function renderStudy(n = 3) {
  return render(<StudyMode cards={deck(n)} onRateCard={onRateCard} onComplete={onComplete} onExit={() => {}} />);
}
```

Tests:
1. **"reveals, then offers four ratings with their next interval"**
   - Click `Reveal answer`.
   - Expect buttons matching `/Again\s+in 1 min/`, `/Hard\s+in 6 min/`, `/Good\s+in 10 min/` and `/Easy\s+in 4 days/`. These are the new-card intervals the e2e spec uses. If a card with no `proficiency` gives different text, read `srsSubtextForRating` and match its output for a new card.
   - Expect the Good button to have focus.
2. **"rating moves to the next card and counts it"**
   - Reveal, then click Good.
   - `onRateCard` was called with `(0, "good")`.
   - `await screen.findByText("Front 2")`, and `1 of 3 reviewed` is shown.
   - `Reveal answer` has focus.
3. **"throws the rated card in the rating's direction"**
   - Reveal, then click Again.
   - A `[data-thrown]` element exists with `data-rating="again"` and contains "Back 1".
4. **"keyboard: Space reveals and 3 rates Good"**
   - `await user.keyboard(" ")`. The rating buttons appear.
   - `await user.keyboard("3")`. `onRateCard` was called with `(0, "good")`.
5. **"shows a streak after two Good ratings"**
   - Rate Good twice. `getByRole("status")` has the text `2 in a row`.
6. **"completes with a per-rating tally and the same stats as before"**
   - Rate a 3-card deck Again, Hard, Good.
   - `onComplete` was called with `{ reviewed: 3, correct: 2, incorrect: 1, longestStreak: 2 }`. Hard counts as correct.
   - `Session complete` is shown.
   - Each tally tile shows its count. Find each tile by its label and check its number with `within`.
7. **"Study again resets the session"**
   - After completing, click `Study again`.
   - `0 of 3 reviewed` and "Front 1" are shown.
8. **"the peeking cards are blank"**
   - With 3 cards, there are 2 `[data-peek]` elements, `aria-hidden`, with no text.
   - The text "Front 1" appears exactly once: `getAllByText("Front 1")` has length 1.

Run them and confirm they fail.

- [ ] **Step 2: Implement.** Layout, top to bottom, inside `flex w-full min-w-0 max-w-xl flex-col gap-5`:

1. **Header row:**
   - `flex items-center justify-between gap-3 font-sans text-sm text-muted-foreground`;
   - on the left, `<span className="whitespace-nowrap">{reviewed} of {total} reviewed</span>`, as a single text node;
   - on the right, `<StreakChip streak={streak} />`.
2. **Stacked progress:**
   - Wrapper: `<div role="progressbar" aria-label="Cards reviewed" aria-valuemin={0} aria-valuemax={total} aria-valuenow={reviewed} aria-valuetext={`${reviewed} of ${total} cards reviewed`} className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">`.
   - Inside it, one `<span>` per rating in `RATINGS` order: `className={cn("studio-segment h-full transition-[width] duration-500 ease-out", r.toneBar)} style={{ "--studio-segment": `${(tally[r.rating] / total) * 100}%` } as React.CSSProperties}`.
3. **Stage:** `<div className="relative pb-6">`.
   - **Peeks:** when 3 or more cards remain, `<div data-peek aria-hidden className="absolute inset-x-0 top-0 h-72 translate-y-6 scale-90 rounded-2xl bg-card opacity-40 shadow-md ring-1 ring-hairline sm:h-80" />`. When 2 or more remain, a second one with `translate-y-3 scale-95 opacity-70`. Render the deeper one first.
   - **Current card:**
     - Wrapper: `<div key={currentIndex} className="relative animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-300">`.
     - Inside it, `<FlipCard flipped={showAnswer} front={<FlashcardFront card={currentCard} />} back={<FlashcardBack card={currentCard} />} />`. It isn't clickable in study mode: Reveal is the action, and Space works too.
   - **Thrown card:** when `thrown` is set, `<div data-thrown data-rating={thrown.rating} aria-hidden onAnimationEnd={() => setThrown(null)} className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 flex h-72 flex-col items-center justify-center overflow-hidden rounded-2xl bg-muted p-6 text-center shadow-lg ring-1 ring-hairline animate-out fade-out fill-mode-forwards duration-500 ease-out sm:h-80", RATINGS.find(r => r.rating === thrown.rating)!.throwClass)}><FlashcardBack card={thrown.card} /></div>`. Use a lookup that doesn't need a non-null assertion: build a `Record` from `RATINGS`, or default to the first entry.
   - **Burst:** `{thrown && (thrown.rating === "good" || thrown.rating === "easy") ? <Burst key={thrown.id} /> : null}`, inside the stage. Burst is `absolute inset-0`.
4. **Card navigation:**
   - `flex items-center justify-center gap-3`;
   - `Button variant="ghost" size="icon-sm" aria-label="Previous card"` with `<ChevronLeft />`;
   - `<span className="font-sans text-sm tabular-nums text-muted-foreground">Card {currentIndex + 1} of {total}</span>`;
   - Next works the same way.
   - Both arrows are disabled at the ends and while a rating is saving.
   - The old second progress bar is removed.
5. **Actions:**
   - **Before the answer is shown:** `<Button ref={revealRef} className="w-full sm:w-auto sm:min-w-50" onClick={handleShowAnswer}>Reveal answer</Button>`. If lint flags `sm:min-w-50`, use `sm:min-w-48`.
   - **After:**
     - a `<p className="text-center font-sans text-sm text-muted-foreground">How well did you know this?</p>`;
     - then `<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">` holding the four `RatingButton`s, with `ref` on Good, `subtext={srsSubtextForRating(currentCard.proficiency, r.rating)}`, and `disabled={isSubmittingRating}`.
     - The grid enters with `animate-in fade-in slide-in-from-bottom-2 duration-300`.

**Complete screen.** It replaces the `isComplete` branch:

```tsx
<div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-8 text-center animate-in fade-in duration-500">
  <div className="flex size-16 items-center justify-center rounded-2xl bg-success-muted text-success animate-in zoom-in-50 spin-in-12 fade-in duration-700 ease-out">
    <CheckCircle2 className="size-8" />
  </div>
  <div className="space-y-1">
    <h2 className="font-display text-2xl font-semibold tracking-tight">Session complete</h2>
    <p className="font-sans text-sm text-muted-foreground">
      {reviewedCards.length} cards reviewed · best streak {longestStreak}
    </p>
  </div>
  <div className="grid w-full grid-cols-4 gap-2">
    {RATINGS.map((r, k) => (
      <TallyTile
        key={r.rating}
        config={r}
        value={tally[r.rating]}
        className={cn("animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500", TALLY_DELAY[k])}
      />
    ))}
  </div>
  <div className="flex flex-wrap justify-center gap-3">
    <Button variant="secondary" onClick={handleReset}>Study again</Button>
    <Button onClick={onExit}>Back to browse</Button>
  </div>
</div>
```

with `const TALLY_DELAY = ["delay-300", "delay-400", "delay-500", "delay-600"];`. Tailwind needs whole class strings in the source, which this gives it.

**Empty state.** The `!currentCard` branch uses `Empty`, `EmptyHeader`, `EmptyMedia` (`BookOpen`), and `EmptyTitle` "No cards available for study." Read `ui/empty.tsx` for the API.

- [ ] **Step 3: Run the tests.** All 8 pass.
- [ ] **Step 4: Run the checks.**
  - `bun run typecheck:web`.
  - `bun run test src/features/studio`.
  - `npx eslint src/features/studio/components/views/StudyMode.tsx`, expecting 0 problems.
- [ ] **Step 5: Commit.** `git commit -m "feat(studio): study mode is a deck: peeking cards, throws by rating, stacked progress, streak, tally"`

---

### Task 3: `FlashcardView`, `EditCardModal` and `ProficiencyBadge` on the design system

**Files:**
- Modify: `FlashcardView.tsx`, `EditCardModal.tsx` and `ProficiencyBadge.tsx`
- Create: `FlashcardView.test.tsx`, `EditCardModal.test.tsx` and `ProficiencyBadge.test.tsx`

All under `components/views/`.

**`FlashcardView`: what stays.**
- Every hook and effect, and their order. That covers state, the `flashcardsApi` hooks, due cards, `filteredCards`, index restore, the clamp effect, `useUpdateFlashcardProgress`, and the show-mastered sync.
- All handlers, including the 200ms `setTimeout` in Next and Previous.
- `boundedBrowseIndex` and `activeStudyCards`.

**`FlashcardView`: markup changes.**
1. **Mobile back.** Use a `Button variant="ghost" size="icon-sm" aria-label="Back to Studio"` with `<ArrowLeft />`. The bar keeps `border-b border-border` (a hairline).
2. **Mode switcher.**
   - The container is `<div role="group" aria-label="Mode" className="flex items-center gap-1 rounded-xl bg-muted p-1">`.
   - It holds three `Toggle size="sm"`s from `ui/toggle.tsx`. Each has `pressed={mode === x}`, `onPressedChange={() => handleModeChange(x)}`, `aria-label="Browse Mode"`, `"Study Mode"` or `"Edit Mode"`, and an icon child.
   - Study is `disabled={dueCards.length === 0}`.
   - `Toggle` renders a `button` with `aria-pressed`, so the e2e `getByRole("button", { name: "Study Mode" })` keeps working. Do NOT use `ToggleGroup type="single"`: its items are `role="radio"`.
   - Each Toggle sits in a `Tooltip` showing its name ("Browse", "Study" or "Edit").
3. **Due/All.** The same pattern: a `role="group" aria-label="Which cards to show"` container with two `Toggle size="sm"`s labelled "Due" and "All".
4. **"N due" counter (study).** Keep it, in sans.
5. **Add Card (edit).** Use a `Button size="sm"` with `<Plus />`.
6. **Browse/edit card.**
   - Use `<FlipCard flipped={isFlipped} front={<FlashcardFront card={currentCard} />} back={<FlashcardBack card={currentCard} />} onActivate={…} label={…} tone={mode === "edit" ? "edit" : "default"} className="mx-auto max-w-xl" />`.
   - `onActivate` and `label` keep today's behaviour and wording. `frontFooter` and `backFooter` hold today's "Tap or Space to flip" / "Tap to edit" lines, as `<p className="mt-2 flex shrink-0 items-center gap-1.5 font-sans text-sm text-muted-foreground">`, using `text-primary` in edit mode.
   - Remove `renderCardFront`, the inline answer `MarkdownRenderer` and the `<style>` block. `FlashcardContent` covers them.
7. **Navigation.**
   - The row holds `Button variant="secondary" size="icon"` for Previous and Next, keeping their aria-labels, with `<Progress value={((boundedBrowseIndex + 1) / filteredCards.length) * 100} size="sm" aria-label={`Card ${boundedBrowseIndex + 1} of ${filteredCards.length}`} className="flex-1" />` between them.
   - Below the row, `<p className="text-center font-sans text-sm tabular-nums text-muted-foreground">{boundedBrowseIndex + 1} of {filteredCards.length}</p>`.
8. **Empty states.**
   - "All caught up" (study), "Generation failed" and "No flashcards available" use `Empty`, `EmptyHeader`, `EmptyMedia variant="icon"`, `EmptyTitle`, `EmptyDescription` and `EmptyContent`, with their current wording.
   - Their buttons become `Button`.
   - The icon tiles drop the palette colours. The failed state uses `text-destructive`.
9. **Root.**
   - Replace the template string with `cn(...)`.
   - Keep `animate-in fade-in duration-300`.
   - Drop `min-h-[50vh]` and `min-h-[40vh]`; `flex-1` with centring is enough.
   - Replace `w-4.5 h-4.5` with icon defaults or `size-4`.

**`EditCardModal`.** Rewrite on `Dialog`, keeping the same props:

```tsx
<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
  <DialogContent className="sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle>{isNewCard ? "Add New Card" : "Edit Card"}</DialogTitle>
      <DialogDescription>{isNewCard ? "Create a new flashcard" : "Edit flashcard content"}</DialogDescription>
    </DialogHeader>
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="flashcard-front">Front (question)</FieldLabel>
        <Textarea id="flashcard-front" rows={5} value={front} onChange={(e) => setFront(e.target.value)} placeholder="Enter the question or prompt..." autoFocus={isNewCard} />
      </Field>
      <Field>
        <FieldLabel htmlFor="flashcard-back">Back (answer)</FieldLabel>
        <Textarea id="flashcard-back" rows={5} value={back} onChange={(e) => setBack(e.target.value)} placeholder="Enter the answer or explanation..." />
      </Field>
    </FieldGroup>
    <DialogFooter className="sm:justify-between">
      {/* Delete with AlertDialog confirm when editing; an empty <span /> otherwise to keep the layout */}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!front.trim() || !back.trim()}><Save />{isNewCard ? "Add Card" : "Save Changes"}</Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Delete:** an `AlertDialog` replaces `confirm()`.
  - The trigger is `Button variant="ghost"` with `<Trash2 />` and the text "Delete Card". Give the destructive look through a `destructive` variant: check `button.tsx`'s variants; use `variant="destructive"` if a ghost-destructive look doesn't exist.
  - The content is `AlertDialogTitle` "Delete this card?" and `AlertDialogDescription` "This can't be undone." with `AlertDialogCancel` and `AlertDialogAction` "Delete", which calls `onDelete`.
- **Draft reset:** keep the `useEffect` that resets fields from `card`. Also reset the fields when the dialog opens: add `isOpen` to the effect's dependencies, so a second "Add Card" starts empty.
- **Lint:** if `DialogContent className="sm:max-w-2xl"` or `DialogFooter className="sm:justify-between"` is flagged, keep only what lint allows. Width is layout, so it should pass.

**`ProficiencyBadge`.** The labels are unchanged, because the e2e checks "Progressing". The dots change:

| Label | Dot |
|---|---|
| Mastered | `bg-success` |
| Learning | `bg-info` |
| N-day streak | `bg-warning` |
| Progressing | `bg-primary` |
| New | `bg-muted-foreground/50` |

Also replace `h-1.5 w-1.5 rounded-xl` with `size-1.5 rounded-full`.

- [ ] **Step 1: Write the failing tests.**
  - **`ProficiencyBadge.test.tsx`:** one case per label.
    - Mastered: interval 21.
    - Learning: interval 7.
    - "3-day streak": streak 3.
    - Progressing: `totalReviews` 10, `correctCount` 8.
    - Learning: accuracy 0.5.
    - New: no proficiency.
  - **`EditCardModal.test.tsx`:**
    - Open as new: the dialog is titled "Add New Card", and Save is disabled until both fields are filled. Save calls `onSave` with trimmed values.
    - Open with a card: the title is "Edit Card" and the fields are prefilled.
    - Delete → confirm "Delete" calls `onDelete`.
    - Escape calls `onCancel`.
  - **`FlashcardView.test.tsx`:**
    - Mock `@/features/studio/services/flashcardsApi`, the way `QuizView.test.tsx` mocks `quizzesApi`:
      - `useFlashcard` returns null;
      - `useDueCards` returns a module-level `due` array;
      - the mutation hooks return `vi.fn()`s;
      - `useUpdateFlashcardProgress` is a no-op.
    - Also mock `MarkdownRenderer`.
    - Tests:
      - **(a)** It renders the first card front and `1 of 2`. Clicking the card flips it (the back face gets `data-shown="true"`).
      - **(b)** With `due = []`, the `Study Mode` button is disabled. With due cards, clicking it shows `Reveal answer`.
      - **(c)** In Edit Mode, clicking the card opens the dialog titled "Edit Card".
      - **(d)** The "Due"/"All" toggles have `aria-pressed` that reflects `showMastered`.
- [ ] **Step 2: Implement** all three files as described above.
- [ ] **Step 3: Run the checks.**
  - `bun run test src/features/studio`
  - `bun run typecheck:web`
  - `npx eslint` on the three files, expecting 0 problems.
  - `bun run knip` from the root. Everything should now be used.
- [ ] **Step 4: Commit.** `git commit -m "feat(studio): flashcard browse, edit dialog and badges on the design system"`

---

### Task 4: Lock in, gates and PR

- [ ] **Step 1: Add to `MIGRATED`.** In `apps/web/eslint.config.mjs`, after the PR 2 entries, add:

```js
  "src/features/studio/components/flashcards/**/*.tsx",
  "src/features/studio/components/views/FlashcardView.tsx",
  "src/features/studio/components/views/StudyMode.tsx",
  "src/features/studio/components/views/EditCardModal.tsx",
  "src/features/studio/components/views/ProficiencyBadge.tsx",
```

- [ ] **Step 2: Update the baseline.** From `apps/web`, run `bun run lint:design:update`. Expected: `features/studio` drops by about 92, from 330 to about 238. No count may rise.
- [ ] **Step 3: Run the gates** from the root, one at a time:
  - `typecheck:web`
  - `typecheck:convex`
  - `lint`
  - `bun run --cwd apps/web lint:design`
  - `bun run --cwd apps/web test`
  - `knip`
  - `npx playwright test --list e2e/studio`
- [ ] **Step 4: Commit.** `chore(web): flashcard views join MIGRATED; baseline drops`
- [ ] **Step 5: Visual check** (the controller does this in the browser pane). Point the session checkout at the branch head.
  - **Browse:**
    - flip by click and Space;
    - hover lift;
    - Due/All;
    - Previous/Next;
    - Edit Mode → the dialog (open and cancel only, no save).
  - **Study:**
    - the peeks;
    - Reveal;
    - keys;
    - the throw directions;
    - the stacked bar;
    - the streak;
    - the complete screen.

    Rating writes SRS progress, but it costs no credits. Ask the user before rating cards in their real deck, or pick a deck they agree to use.
  - **Sizes:** 1440px and 375px, with reduced motion (the pane reports it).
- [ ] **Step 6: Open the PR.** Push and open it with the title `feat(studio): flashcards become a deck (#264, 3/8)`. The body covers what changed, the contracts kept, tests, the visual check, `Part of #264`, and the attribution line. Ask the user before merging.
