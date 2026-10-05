# Studio Quiz and Written Questions (PR 2 of #264) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the quiz and written-question views the "Rewarding" feel the user chose, move both onto the design system at 0 lint findings, and fix #177.

The Rewarding feel adds:
- segmented progress;
- answer feedback: a tick that draws itself and a shake on a wrong answer;
- a burst of particles, a running score and a streak;
- an animated results screen.

**Architecture:**
- **Shared motion helpers** live in `features/studio/motion/`: `useCountUp`, `useStreak` and `<Burst />`. Flashcards (PR 3) will reuse them.
- **Shared practice pieces** live in `features/studio/components/practice/`: `QuestionProgress`, `StreakChip`, `QuizOption`, `ResultsSummary` and `scoreHeadline`. Both views use them.
- **`QuizView`** is rewritten around these pieces and keeps all of its data logic.
- **`WrittenQuestionsView`** keeps all of its data logic: grade-on-Finish, draft autosave and retries. Only its markup changes, and its 530-line test file must keep passing unchanged.

**Tech Stack:** React 19, Tailwind v4, `tw-animate-css`, shadcn/ui (Radix), `motion/react` (`useReducedMotion` only), Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md`, §1 ("Studio motion helpers") and §2. The interactive mockup the user approved is `.superpowers/brainstorm/*/content/quiz-feel.html`, direction B ("Rewarding").

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-quiz`, based on `origin/main` after PR 1 (#344). Dependencies are installed. Paths below are relative to the worktree. Run commands from `apps/web` unless stated otherwise:
- one test file: `bun run test <path>`
- typecheck, from the worktree root: `bun run typecheck:web`

**Contracts that must keep working:**

| Where | What |
|---|---|
| `WrittenQuestionsView.test.tsx` (unit) | button names `Next`, `Finish`, `Stop grading`, `Stopping…`, `Try Again` |
| `WrittenQuestionsView.test.tsx` (unit) | texts `You scored N out of M points`, `Graded N of M questions`, `Ungraded questions count as 0.`, `N answer(s) couldn't be graded`, `Grading your answers… N of M`, `Assessment Complete!`, `Answer Graded`, `0 / 0`, `0%` (as a single element's text), `0 of 2` |
| `WrittenQuestionsView.test.tsx` (unit) | placeholder `/Type your short answer/` |
| `e2e/studio/written-questions-grading.spec.ts` | `getByText("Question 1")` and `getByText("Question 2")` (substring match) |
| `e2e/studio/written-questions-grading.spec.ts` | `[role="progressbar"]` |

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/web/src/index.css` | Modify | `studio-shake`, `studio-draw`, `studio-burst` and `studio-nudge` keyframes, plus reduced-motion rules |
| `apps/web/src/features/studio/motion/useCountUp.ts` (+ `.test.ts`) | Create | Eased number from 0 to the target; instant under reduced motion |
| `apps/web/src/features/studio/motion/useStreak.ts` (+ `.test.ts`) | Create | Counts consecutive successes |
| `apps/web/src/features/studio/motion/Burst.tsx` (+ `.test.tsx`) | Create | One-shot particle burst; renders nothing under reduced motion |
| `apps/web/src/features/studio/components/practice/types.ts` | Create | `QuestionState` |
| `apps/web/src/features/studio/components/practice/scoreHeadline.ts` (+ `.test.ts`) | Create | Results headline for a score |
| `apps/web/src/features/studio/components/practice/QuestionProgress.tsx` (+ `.test.tsx`) | Create | "Question N of M" plus segmented bar (#177) |
| `apps/web/src/features/studio/components/practice/StreakChip.tsx` | Create | "🔥 3 in a row" chip, shown from 2 in a row |
| `apps/web/src/features/studio/components/practice/QuizOption.tsx` (+ `.test.tsx`) | Create | Answer option: A–D key, states, drawn tick or cross, pop and burst |
| `apps/web/src/features/studio/components/practice/ResultsSummary.tsx` (+ `.test.tsx`) | Create | Score ring, count-up, headline, question chips, actions |
| `apps/web/src/features/studio/components/views/QuizView.tsx` (+ new `.test.tsx`) | Rewrite | Quiz on the practice pieces |
| `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx` | Modify (markup only) | Written questions on the practice pieces |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | Modify | Both views join `MIGRATED`; baseline drops |

**Design-lint rules** (`.agents/skills/shadcn/SKILL.md`):
- Primitives (`Button`, `Card`, `Alert`, `Badge` and so on) get only layout classes at call sites. Sizing such as `flex-1` or `min-w-25` is fine. Colour, typography or padding is not.
- No raw palette colours, no arbitrary values (`[...]`), and no thick or loud borders. A `data-[…]` or focus gate is fine.
- `style` may only set CSS custom properties.

Biome warns on `key={index}`. The existing code does the same, and a warning is acceptable.

---

### Task 1: House keyframes for answer feedback

**Files:**
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add the keyframes.** In the `@theme { … }` block that holds `--animate-route-in` and the PR 1 keyframes, add these after `@keyframes progress-glint { … }`:

```css
  --animate-studio-shake: studio-shake 380ms var(--ease-out);
  --animate-studio-draw: studio-draw 450ms var(--ease-out) 120ms both;
  --animate-studio-burst: studio-burst 900ms var(--ease-out) forwards;
  --animate-studio-nudge: studio-nudge 1.6s var(--ease-out) 600ms 1;

  @keyframes studio-shake {
    20% {
      transform: translateX(-5px);
    }
    45% {
      transform: translateX(4px);
    }
    70% {
      transform: translateX(-2px);
    }
  }
  /* Pair with stroke-dasharray="30" on the path. */
  @keyframes studio-draw {
    from {
      stroke-dashoffset: 30;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  /* Each particle sets --burst-dx, --burst-dy and --burst-rotate. */
  @keyframes studio-burst {
    to {
      transform: translate(var(--burst-dx), var(--burst-dy)) rotate(var(--burst-rotate));
      opacity: 0;
    }
  }
  @keyframes studio-nudge {
    30% {
      transform: translateX(3px);
    }
    60% {
      transform: none;
    }
  }
```

- [ ] **Step 2: Turn the moving ones off under reduced motion.** In the `@media (prefers-reduced-motion: reduce)` block at the end of the file, extend the existing `.animate-studio-bob, .animate-studio-pop { animation: none; }` rule to read:

```css
  .animate-studio-bob,
  .animate-studio-pop,
  .animate-studio-shake,
  .animate-studio-nudge {
    animation: none;
  }

  .animate-studio-burst {
    display: none;
  }
```

`studio-draw` stays on under reduced motion, because a stroke drawing in is not movement.

- [ ] **Step 3: Verify.** From `apps/web`, run `bun run build 2>&1 | tail -3`. Expected: the build succeeds. The build rewrites `apps/web/public/sitemap.xml`; revert it with `git checkout -- apps/web/public/sitemap.xml`.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/index.css
git commit -m "feat(web): answer-feedback keyframes (shake, draw, burst, nudge)"
```

---

### Task 2: Motion helpers: `useCountUp`, `useStreak`, `<Burst />`

**Files:**
- Create: `apps/web/src/features/studio/motion/useCountUp.ts` and `useCountUp.test.ts`
- Create: `apps/web/src/features/studio/motion/useStreak.ts` and `useStreak.test.ts`
- Create: `apps/web/src/features/studio/motion/Burst.tsx` and `Burst.test.tsx`

- [ ] **Step 1: Write the failing tests.**

`useCountUp.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let reduceMotion = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => reduceMotion,
}));

import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  beforeEach(() => {
    reduceMotion = false;
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  it("eases from 0 up to the target over the duration", () => {
    const { result } = renderHook(() => useCountUp(10, 900));
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(10);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current).toBe(10);
  });

  it("shows the target at once under reduced motion", () => {
    reduceMotion = true;
    const { result } = renderHook(() => useCountUp(7));
    expect(result.current).toBe(7);
  });

  it("follows a new target", () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 100), {
      initialProps: { target: 3 },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(3);
    rerender({ target: 5 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(5);
  });
});
```

`useStreak.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStreak } from "./useStreak";

describe("useStreak", () => {
  it("counts consecutive successes and resets on a miss", () => {
    const { result } = renderHook(() => useStreak());
    act(() => result.current.record(true));
    act(() => result.current.record(true));
    expect(result.current.streak).toBe(2);
    act(() => result.current.record(false));
    expect(result.current.streak).toBe(0);
    act(() => result.current.record(true));
    expect(result.current.streak).toBe(1);
  });

  it("resets on demand", () => {
    const { result } = renderHook(() => useStreak());
    act(() => result.current.record(true));
    act(() => result.current.reset());
    expect(result.current.streak).toBe(0);
  });
});
```

`Burst.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let reduceMotion = false;
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => reduceMotion,
}));

import { Burst } from "./Burst";

describe("Burst", () => {
  beforeEach(() => {
    reduceMotion = false;
  });

  it("renders decorative particles with their own direction", () => {
    const { container } = render(<Burst />);
    const burst = container.querySelector("[data-slot=burst]");
    expect(burst).toHaveAttribute("aria-hidden", "true");
    const particles = burst?.querySelectorAll("span") ?? [];
    expect(particles.length).toBe(14);
    expect((particles[0] as HTMLElement).style.getPropertyValue("--burst-dx")).toMatch(/px$/);
  });

  it("renders nothing under reduced motion", () => {
    reduceMotion = true;
    const { container } = render(<Burst />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `bun run test src/features/studio/motion`. Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement.**

`useCountUp.ts`:

```ts
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Eases a number from 0 up to `target` (ease-out cubic) for scores and tallies. Jumps straight to
 * the target under reduced motion, or where requestAnimationFrame is unavailable.
 */
export function useCountUp(target: number, duration = 900): number {
  const reduceMotion = useReducedMotion();
  const instant = reduceMotion === true || typeof requestAnimationFrame === "undefined";
  const [value, setValue] = useState(instant ? target : 0);

  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, instant]);

  return value;
}
```

`useStreak.ts`:

```ts
import { useCallback, useState } from "react";

/** Consecutive successes (a correct answer, full marks); any miss resets it. */
export function useStreak() {
  const [streak, setStreak] = useState(0);
  const record = useCallback((success: boolean) => {
    setStreak((current) => (success ? current + 1 : 0));
  }, []);
  const reset = useCallback(() => setStreak(0), []);
  return { streak, record, reset };
}
```

`Burst.tsx`:

```tsx
import { useReducedMotion } from "motion/react";
import type React from "react";
import { cn } from "@/shared/utils/cn";

const COLORS = ["bg-success", "bg-primary", "bg-warning", "bg-info"] as const;
const COUNT = 14;

// Fixed directions spread round the circle (with a little jitter), so renders are stable.
const PARTICLES = Array.from({ length: COUNT }, (_, n) => {
  const angle = (n / COUNT) * Math.PI * 2 + (n % 3) * 0.35;
  const distance = 44 + (n % 4) * 14;
  return {
    id: n,
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance - 12),
    rotate: (n * 47) % 360,
    color: COLORS[n % COLORS.length],
  };
});

/**
 * A one-shot particle burst from the centre of its positioned parent, for a correct answer or a
 * perfect score. Remount it (change its `key`) to play it again. Renders nothing under reduced motion.
 */
export function Burst({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <span
      aria-hidden="true"
      data-slot="burst"
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className
      )}
    >
      {PARTICLES.map((particle) => (
        <span
          key={particle.id}
          className={cn("absolute size-1.5 rounded-xs animate-studio-burst", particle.color)}
          style={
            {
              "--burst-dx": `${particle.dx}px`,
              "--burst-dy": `${particle.dy}px`,
              "--burst-rotate": `${particle.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `bun run test src/features/studio/motion`. Expected: PASS (7 tests).

If the fake requestAnimationFrame doesn't advance in `useCountUp.test.ts`, check that vitest supports `toFake: ["requestAnimationFrame"]` in this version, using the `find-docs` skill or `node_modules/vitest`. If it doesn't, stub it in the test with `vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(() => cb(performance.now()), 16))` and fake only the timers. Report which approach you used.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/studio/motion
git commit -m "feat(studio): count-up, streak and burst motion helpers"
```

These helpers have no non-test users until Task 4. Knip runs on the whole PR, so that's fine.

---

### Task 3: Practice pieces: progress header (#177), streak chip, option, results, headline

**Files:**
- Create the following in `apps/web/src/features/studio/components/practice/`:
  - `types.ts`
  - `scoreHeadline.ts` and `scoreHeadline.test.ts`
  - `QuestionProgress.tsx` and `QuestionProgress.test.tsx`
  - `StreakChip.tsx`
  - `QuizOption.tsx` and `QuizOption.test.tsx`
  - `ResultsSummary.tsx` and `ResultsSummary.test.tsx`

- [ ] **Step 1: Write the failing tests.**

`scoreHeadline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreHeadline } from "./scoreHeadline";

describe("scoreHeadline", () => {
  it.each([
    [1, "Perfect score"],
    [0.75, "Nicely done"],
    [0.5, "Good effort"],
    [0.1, "Keep practising"],
    [0, "Keep practising"],
  ])("%s → %s", (fraction, headline) => {
    expect(scoreHeadline(fraction)).toBe(headline);
  });
});
```

`QuestionProgress.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionProgress } from "./QuestionProgress";

describe("QuestionProgress", () => {
  it("keeps each header phrase whole so a narrow panel wraps between them (#177)", () => {
    render(
      <QuestionProgress
        currentIndex={0}
        states={[undefined, undefined, undefined, undefined, undefined]}
        trailing={<span className="whitespace-nowrap">1 of 5 answered</span>}
      />
    );
    const position = screen.getByText("Question 1 of 5");
    expect(position).toHaveClass("whitespace-nowrap");
    expect(position.parentElement).toHaveClass("flex-wrap");
    expect(screen.getByText("1 of 5 answered")).toBeInTheDocument();
  });

  it("colours one segment per question by result and marks the current one", () => {
    render(<QuestionProgress currentIndex={2} states={["correct", "incorrect", undefined, undefined]} />);
    const bar = screen.getByRole("progressbar", { name: "Question progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
    const states = [...bar.children].map((segment) => segment.getAttribute("data-state"));
    expect(states).toEqual(["correct", "incorrect", "current", "pending"]);
  });
});
```

`QuizOption.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuizOption } from "./QuizOption";

describe("QuizOption", () => {
  it("shows its letter and calls onSelect", async () => {
    const onSelect = vi.fn();
    render(
      <QuizOption position={1} state="idle" disabled={false} onSelect={onSelect}>
        UNION removes duplicates
      </QuizOption>
    );
    const option = screen.getByRole("button", { name: /UNION removes duplicates/ });
    expect(option).toHaveTextContent("B");
    await userEvent.click(option);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("announces a correct or incorrect result and draws its mark", () => {
    const { rerender } = render(
      <QuizOption position={0} state="correct" disabled onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "correct");
    expect(screen.getByText("Correct answer")).toHaveClass("sr-only");
    rerender(
      <QuizOption position={0} state="incorrect" disabled onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(screen.getByText("Your answer, incorrect")).toBeInTheDocument();
    expect(screen.getByRole("button").className).toContain("animate-studio-shake");
  });

  it("bursts when celebrating", () => {
    const { container } = render(
      <QuizOption position={0} state="correct" disabled celebrate onSelect={() => {}}>
        A
      </QuizOption>
    );
    expect(container.querySelector("[data-slot=burst]")).not.toBeNull();
  });
});
```

`ResultsSummary.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResultsSummary } from "./ResultsSummary";

describe("ResultsSummary", () => {
  it("shows the title, headline, score text and actions", () => {
    render(
      <ResultsSummary
        title="Quiz Complete!"
        fraction={2 / 3}
        value={2}
        caption="of 3"
        questions={[]}
        actions={<button type="button">Try Again</button>}
      >
        <p>You scored 2 out of 3</p>
      </ResultsSummary>
    );
    expect(screen.getByRole("heading", { name: "Quiz Complete!" })).toBeInTheDocument();
    expect(screen.getByText("Good effort")).toBeInTheDocument();
    expect(screen.getByText("You scored 2 out of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  });

  it("puts a value suffix in the same text as the number", () => {
    render(
      <ResultsSummary title="Done" fraction={0} value={0} valueSuffix="%" questions={[]} actions={null}>
        <p>x</p>
      </ResultsSummary>
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("offers one review chip per question", async () => {
    const onReview = vi.fn();
    render(
      <ResultsSummary
        title="Done"
        fraction={0.5}
        value={1}
        questions={[
          { state: "correct", onReview: () => {} },
          { state: "incorrect", onReview },
        ]}
        actions={null}
      >
        <p>x</p>
      </ResultsSummary>
    );
    await userEvent.click(screen.getByRole("button", { name: "Review question 2" }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Review question 1" })).toHaveAttribute(
      "data-state",
      "correct"
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `bun run test src/features/studio/components/practice`. Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Implement.**

`types.ts`:

```ts
/** A practice question's result: graded right, part-marks, wrong, or answered but not graded yet. */
export type QuestionState = "correct" | "partial" | "incorrect" | "answered";
```

`scoreHeadline.ts`:

```ts
/** Results headline for a score fraction from 0 to 1. */
export function scoreHeadline(fraction: number): string {
  if (fraction >= 1) return "Perfect score";
  if (fraction >= 0.7) return "Nicely done";
  if (fraction >= 0.4) return "Good effort";
  return "Keep practising";
}
```

`QuestionProgress.tsx`:

```tsx
import type React from "react";
import { cn } from "@/shared/utils/cn";
import type { QuestionState } from "./types";

const SEGMENT: Record<QuestionState, string> = {
  correct: "bg-success",
  partial: "bg-warning",
  incorrect: "bg-destructive",
  answered: "bg-primary/60",
};

interface QuestionProgressProps {
  currentIndex: number;
  /** One entry per question; undefined means not answered yet. */
  states: Array<QuestionState | undefined>;
  /** Right side of the header: answered count, streak chip. */
  trailing?: React.ReactNode;
}

/**
 * "Question 3 of 9" over a bar with one segment per question, coloured by result. Each header
 * phrase is nowrap and the row wraps between phrases, so a narrow Studio panel stacks them
 * cleanly instead of splitting a number from its words (#177).
 */
export function QuestionProgress({ currentIndex, states, trailing }: QuestionProgressProps) {
  const total = states.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-sans text-xs font-bold uppercase tracking-widest text-muted-foreground md:text-sm">
        <span className="whitespace-nowrap">
          Question {currentIndex + 1} of {total}
        </span>
        {trailing}
      </div>
      <div
        role="progressbar"
        aria-label="Question progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={currentIndex + 1}
        className="flex gap-1"
      >
        {states.map((state, position) => (
          <span
            key={position}
            data-state={state ?? (position === currentIndex ? "current" : "pending")}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-500 ease-out",
              state ? SEGMENT[state] : position === currentIndex ? "bg-primary/30" : "bg-muted"
            )}
          />
        ))}
      </div>
    </div>
  );
}
```

`getByText("Question 1 of 5")` in the test matches because Testing Library compares the element's whole text content, and the text nodes "Question ", "1", " of " and "5" sit inside one span.

`StreakChip.tsx`:

```tsx
import { Flame } from "lucide-react";

/** "3 in a row", shown once the learner has two in a row. */
export function StreakChip({ streak }: { streak: number }) {
  if (streak < 2) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 whitespace-nowrap normal-case tracking-normal text-primary animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <Flame aria-hidden className="size-3.5" />
      {streak} in a row
    </span>
  );
}
```

`QuizOption.tsx`:

```tsx
import { cva } from "class-variance-authority";
import type React from "react";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";

export type OptionState = "idle" | "correct" | "incorrect" | "dimmed";

const optionVariants = cva(
  "group relative flex w-full items-center gap-3 rounded-xl p-4 text-left font-serif shadow-xs ring-1 transition duration-200 ease-out disabled:cursor-default md:p-5",
  {
    variants: {
      state: {
        idle: "bg-card ring-hairline hover:shadow-md motion-safe:hover:-translate-y-px motion-safe:active:scale-99",
        correct: "bg-success-muted text-success-muted-foreground ring-success-border",
        incorrect:
          "bg-destructive-muted text-destructive-muted-foreground ring-destructive-border animate-studio-shake",
        dimmed: "bg-card opacity-50 ring-hairline",
      },
    },
  }
);

const keyVariants = cva(
  "flex size-7 shrink-0 items-center justify-center rounded-lg font-sans text-xs font-semibold transition-colors",
  {
    variants: {
      state: {
        idle: "bg-muted text-muted-foreground",
        correct: "bg-success text-success-foreground",
        incorrect: "bg-destructive text-destructive-foreground",
        dimmed: "bg-muted text-muted-foreground",
      },
    },
  }
);

interface QuizOptionProps {
  /** 0-based; shown as A, B, C… */
  position: number;
  state: OptionState;
  disabled: boolean;
  /** The option the learner just got right: plays a pop and a burst once. */
  celebrate?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

/** One multiple-choice answer: lifts on hover, then turns green with a drawn tick or shakes red. */
export function QuizOption({
  position,
  state,
  disabled,
  celebrate = false,
  onSelect,
  children,
}: QuizOptionProps) {
  return (
    <button
      type="button"
      data-state={state}
      disabled={disabled}
      onClick={onSelect}
      className={cn(optionVariants({ state }), celebrate && "animate-studio-pop")}
    >
      <span aria-hidden className={keyVariants({ state })}>
        {String.fromCharCode(65 + position)}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {state === "correct" ? <span className="sr-only">Correct answer</span> : null}
      {state === "incorrect" ? <span className="sr-only">Your answer, incorrect</span> : null}
      {state === "correct" || state === "incorrect" ? <ResultMark state={state} /> : null}
      {celebrate ? <Burst /> : null}
    </button>
  );
}

function ResultMark({ state }: { state: "correct" | "incorrect" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={state === "correct" ? "M5 12.5l4.5 4.5L19 7.5" : "M7 7l10 10M17 7L7 17"}
        strokeDasharray={30}
        className="animate-studio-draw"
      />
    </svg>
  );
}
```

`ResultsSummary.tsx`:

```tsx
import type React from "react";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";
import { useCountUp } from "../../motion/useCountUp";
import { scoreHeadline } from "./scoreHeadline";
import type { QuestionState } from "./types";

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CHIP: Record<QuestionState, string> = {
  correct: "bg-success-muted text-success-muted-foreground",
  partial: "bg-warning-muted text-warning-muted-foreground",
  incorrect: "bg-destructive-muted text-destructive-muted-foreground",
  answered: "bg-muted text-muted-foreground",
};

interface ResultsSummaryProps {
  title: string;
  /** 0–1: fills the ring and picks the headline. */
  fraction: number;
  /** The big number in the ring; counts up from 0. */
  value: number;
  /** Appended to the number in the same text, e.g. "%". */
  valueSuffix?: string;
  /** Small line under the number, e.g. "of 9". */
  caption?: string;
  /** One chip per question; tapping it reviews that question. */
  questions: Array<{ state: QuestionState | undefined; onReview: () => void }>;
  /** Score sentence and notes. Static text, so screen readers and tests get the final numbers. */
  children: React.ReactNode;
  actions: React.ReactNode;
}

/** End of a quiz or written set: the ring fills while the number counts up; a perfect score bursts. */
export function ResultsSummary({
  title,
  fraction,
  value,
  valueSuffix = "",
  caption,
  questions,
  children,
  actions,
}: ResultsSummaryProps) {
  const shown = useCountUp(value);
  const ring = useCountUp(Math.round(fraction * 1000), 1100) / 1000;

  return (
    <div className="flex h-full flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center gap-6 px-6 text-center">
          <div className="relative size-36">
            <svg viewBox="0 0 150 150" className="size-full -rotate-90" aria-hidden>
              <circle cx="75" cy="75" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
              <circle
                cx="75"
                cy="75"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-success"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - ring)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-4xl font-semibold tabular-nums">{`${shown}${valueSuffix}`}</span>
              {caption ? (
                <span className="font-sans text-xs text-muted-foreground">{caption}</span>
              ) : null}
            </div>
            {fraction >= 1 ? <Burst /> : null}
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-2xl font-semibold">{title}</h3>
            <p className="font-display text-lg text-primary">{scoreHeadline(fraction)}</p>
            {children}
          </div>
          {questions.length > 0 ? (
            <div role="group" aria-label="Review a question" className="flex flex-wrap justify-center gap-1.5">
              {questions.map((question, position) => (
                <button
                  key={position}
                  type="button"
                  data-state={question.state ?? "unanswered"}
                  aria-label={`Review question ${position + 1}`}
                  onClick={question.onReview}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg font-sans text-xs font-semibold outline-hidden transition-transform animate-in fade-in slide-in-from-bottom-2 duration-300 focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-px",
                    question.state ? CHIP[question.state] : "bg-muted text-muted-foreground"
                  )}
                >
                  {position + 1}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex w-full gap-3">{actions}</div>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run `bun run test src/features/studio/components/practice`. Expected: PASS (14 tests).

- [ ] **Step 5: Lint.** From `apps/web`, run `npx eslint src/features/studio/components/practice src/features/studio/motion`. Expected: 0 errors.

These files aren't in `MIGRATED` yet, so findings show as warnings. Fix every one now: the folder joins `MIGRATED` in Task 6. If a `bg-*` or `ring-*` token is reported as unknown, check that it exists in `index.css` (`--color-success-border`, `--color-destructive-border` and so on). Use the nearest existing token rather than inventing one.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/features/studio/components/practice
git commit -m "feat(studio): practice pieces: question progress, option, results, streak chip"
```

---

### Task 4: `QuizView` on the practice pieces

**Files:**
- Rewrite: `apps/web/src/features/studio/components/views/QuizView.tsx`
- Create: `apps/web/src/features/studio/components/views/QuizView.test.tsx`

**What stays:**
- the props (`note`, `onNoteUpdate`, `onBack`);
- every hook call and effect from the current file: index restore, `useUpdateQuizProgress`, the server-answer sync and `selectedForDisplay`;
- `handleSelect`'s optimistic submit and revert;
- `resetQuiz`, `reviewQuiz`, and the "No questions available" state.

**What's new:**
- streak;
- a celebrate state;
- a running score;
- per-question states;
- a `reviewQuestion(i)` for results chips;
- the hint moves to `Popover`;
- the review banner becomes `Alert`;
- buttons become `Button`;
- dead `prose-*` modifiers are removed.

- [ ] **Step 1: Write the failing tests** (`QuizView.test.tsx`):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizNote } from "@/shared/types/index";
import { QuizView } from "./QuizView";

const submitAnswer = vi.fn().mockResolvedValue(undefined);
const resetAnswers = vi.fn().mockResolvedValue(undefined);
let latestNote: QuizNote | null = null;

vi.mock("@/features/studio/services/quizzesApi", () => ({
  useSubmitQuizAnswer: () => submitAnswer,
  useResetQuizAnswers: () => resetAnswers,
  useUpdateQuizProgress: () => undefined,
  useQuiz: () => latestNote,
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/shared/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/utils")>()),
  sanitizeMarkdown: (s: string) => s,
}));

function makeQuiz(): QuizNote {
  return {
    id: "quiz1",
    title: "SQL",
    preview: "",
    type: "quiz",
    status: "completed",
    questions: [
      { question: "Q1?", options: ["Right one", "Wrong one"], answer: 0, hint: "h1", explanation: "E1" },
      { question: "Q2?", options: ["Nope", "Yes"], answer: 1, hint: "h2", explanation: "E2" },
      { question: "Q3?", options: ["Yes", "No"], answer: 0, hint: "h3", explanation: "E3" },
    ],
    userAnswers: {},
    metadata: {},
  } as unknown as QuizNote;
}

beforeEach(() => {
  vi.clearAllMocks();
  latestNote = null;
});

describe("QuizView", () => {
  it("marks the right answer, counts the score and explains", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute("data-state", "correct");
    expect(screen.getByRole("button", { name: /Wrong one/ })).toHaveAttribute("data-state", "dimmed");
    expect(screen.getByText("Score 1")).toBeInTheDocument();
    expect(await screen.findByText("E1")).toBeInTheDocument();
    expect(submitAnswer).toHaveBeenCalledWith("quiz1", 0, 0);
  });

  it("shakes a wrong pick and still shows the right answer", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Wrong one/ }));
    expect(screen.getByRole("button", { name: /Wrong one/ })).toHaveAttribute("data-state", "incorrect");
    expect(screen.getByRole("button", { name: /Right one/ })).toHaveAttribute("data-state", "correct");
    expect(screen.getByText("Score 0")).toBeInTheDocument();
  });

  it("shows a streak after two right answers in a row", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /Yes/ }));
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
  });

  it("finishes on a results screen whose chips open a question for review", async () => {
    const user = userEvent.setup();
    render(<QuizView note={makeQuiz()} />);
    await user.click(await screen.findByRole("button", { name: /Right one/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /Nope/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("button", { name: /^C?\s*Yes/ }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("heading", { name: "Quiz Complete!" })).toBeInTheDocument();
    expect(screen.getByText("You scored 2 out of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review question 2" }));
    expect(await screen.findByText("Review Mode")).toBeInTheDocument();
    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
  });
});
```

The option names include the hidden A–D letter, and "Correct answer" once marked, so the tests match the visible text with a regex. In the last test, Q3's "Yes" is the first option. If `/^C?\s*Yes/` is ambiguous, select it with `screen.getAllByRole("button", { name: /Yes/ })[0]`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `bun run test src/features/studio/components/views/QuizView.test.tsx`. Expected: FAIL. There's no `data-state` on the options, no "Score" text and no review chips.

- [ ] **Step 3: Rewrite `QuizView.tsx`.** Keep lines 33–92 of the current file exactly as they are: the state, the index-restore effect, `useUpdateQuizProgress`, the server sync, `questions`, `currentQuestion`, `displayQuestion`, `selectedForDisplay` and `isAnswered`. Replace everything else with:

```tsx
import { ArrowLeft, Eye, Info, Lightbulb, RotateCcw } from "lucide-react";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  useQuiz,
  useResetQuizAnswers,
  useSubmitQuizAnswer,
  useUpdateQuizProgress,
} from "@/features/studio/services/quizzesApi";
import type { MarkdownRendererProps } from "@/shared/components/MarkdownRenderer.utils";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Spinner } from "@/shared/components/ui/spinner";
import { QuizNote } from "@/shared/types/index";
import { sanitizeMarkdown } from "@/shared/utils";
import { cn } from "@/shared/utils/cn";
import { normalizeStoredQuizQuestion, stripQuizOptionLabel } from "@/shared/utils/quizOptionLabels";
import { useStreak } from "../../motion/useStreak";
import { QuestionProgress } from "../practice/QuestionProgress";
import { type OptionState, QuizOption } from "../practice/QuizOption";
import { ResultsSummary } from "../practice/ResultsSummary";
import { StreakChip } from "../practice/StreakChip";
import type { QuestionState } from "../practice/types";

const MarkdownRenderer = lazy(() =>
  import("@/shared/components/MarkdownRenderer").then((m) => ({ default: m.default }))
);

// Generated content may carry tables; links, media and embeds are dropped.
const contentComponents: MarkdownRendererProps["components"] = {
  img: () => null,
  a: ({ children }) => <span>{children}</span>,
  video: () => null,
  audio: () => null,
  iframe: () => null,
  table: ({ children }) => (
    <table className="w-full border-collapse overflow-hidden rounded-lg border border-border">
      {children}
    </table>
  ),
  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border px-4 py-2 text-left font-semibold last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border px-4 py-2 last:border-r-0">{children}</td>
  ),
};

// Options read inline: paragraphs collapse to spans.
const optionComponents: MarkdownRendererProps["components"] = {
  ...contentComponents,
  p: ({ children }) => <span className="font-medium">{children}</span>,
};

export interface QuizViewProps {
  note: QuizNote;
  onNoteUpdate?: (note: QuizNote) => void;
  onBack?: () => void;
}

export const QuizView: React.FC<QuizViewProps> = ({ note, onNoteUpdate, onBack }) => {
  // ── keep lines 33–92 of the original file here, unchanged ──

  const { streak, record, reset: resetStreak } = useStreak();
  // The option just answered correctly on this question: plays its pop and burst once.
  const [celebrated, setCelebrated] = useState<{ question: number; option: number } | null>(null);

  const questionStates = useMemo<Array<QuestionState | undefined>>(
    () =>
      questions.map((question, position) => {
        const picked = userAnswers[position];
        if (picked === undefined) return undefined;
        return picked === question.answer ? "correct" : "incorrect";
      }),
    [questions, userAnswers]
  );
  const score = questionStates.filter((state) => state === "correct").length;

  const handleSelect = async (index: number) => {
    if (isAnswered || reviewMode) return;

    // Update local state immediately for responsiveness
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: index }));
    const correct = index === displayQuestion.answer;
    record(correct);
    if (correct) setCelebrated({ question: currentIndex, option: index });

    // Submit to server in the background
    try {
      await submitAnswer(note.id, currentIndex, index);
      // Notify parent of the update (syncs with notes list)
      if (latestNote && onNoteUpdate) {
        onNoteUpdate(latestNote);
      }
    } catch (error) {
      console.error("Failed to submit answer:", error);
      // Revert the local state on error
      setUserAnswers((prev) => {
        const newState = { ...prev };
        delete newState[currentIndex];
        return newState;
      });
    }
  };

  const handleNext = () => {
    setShowHint(false);
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setShowResults(true);
    }
  };

  const handlePrev = () => {
    setShowHint(false);
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const resetQuiz = async () => {
    setIsResetting(true);
    try {
      // Call API to reset all answers on the server (also resets lastViewedIndex)
      await resetAnswers(note.id);
      setCurrentIndex(0);
      setUserAnswers({});
      setShowResults(false);
      setShowHint(false);
      setReviewMode(false);
      setCelebrated(null);
      resetStreak();
      if (latestNote && onNoteUpdate) {
        onNoteUpdate(latestNote);
      }
    } catch (error) {
      console.error("Failed to reset answers:", error);
      alert(error instanceof Error ? error.message : "Failed to reset answers");
    } finally {
      setIsResetting(false);
    }
  };

  const reviewQuestion = (position: number) => {
    setCurrentIndex(position);
    setShowResults(false);
    setReviewMode(true);
    setShowHint(false);
  };

  const optionState = (position: number): OptionState => {
    if (!isAnswered && !reviewMode) return "idle";
    if (position === displayQuestion.answer) return "correct";
    if (position === selectedForDisplay) return "incorrect";
    return "dimmed";
  };

  if (questions.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
        <p className="font-serif italic text-muted-foreground">No questions available</p>
      </div>
    );

  if (showResults) {
    return (
      <ResultsSummary
        title="Quiz Complete!"
        fraction={score / questions.length}
        value={score}
        caption={`of ${questions.length}`}
        questions={questionStates.map((state, position) => ({
          state,
          onReview: () => reviewQuestion(position),
        }))}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => reviewQuestion(0)}>
              <Eye />
              Review
            </Button>
            <Button className="flex-1" onClick={resetQuiz} disabled={isResetting}>
              {isResetting ? <Spinner /> : <RotateCcw />}
              {isResetting ? "Resetting…" : "Try Again"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          You scored {score} out of {questions.length}
        </p>
      </ResultsSummary>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio">
            <ArrowLeft />
          </Button>
          <span className="truncate text-sm font-semibold text-foreground">{note.title}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto bg-card">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 md:p-12">
          {reviewMode && (
            <Alert variant="warning">
              <Eye />
              <AlertTitle>Review Mode</AlertTitle>
              <AlertDescription>
                You are viewing your previous answers. Selection is disabled.
              </AlertDescription>
            </Alert>
          )}

          <QuestionProgress
            currentIndex={currentIndex}
            states={questionStates}
            trailing={<StreakChip streak={streak} />}
          />

          <div
            key={currentIndex}
            className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <div className="prose max-w-none font-serif text-lg leading-relaxed text-foreground md:text-2xl">
              <Suspense fallback={<div className="h-6 w-full animate-pulse rounded bg-secondary/30" />}>
                <MarkdownRenderer components={contentComponents}>
                  {sanitizeMarkdown(currentQuestion.question)}
                </MarkdownRenderer>
              </Suspense>
            </div>

            <div className="space-y-3">
              {displayQuestion.options.map((option, idx) => (
                <QuizOption
                  key={idx}
                  position={idx}
                  state={optionState(idx)}
                  disabled={isAnswered || reviewMode}
                  celebrate={celebrated?.question === currentIndex && celebrated.option === idx}
                  onSelect={() => handleSelect(idx)}
                >
                  <span className="prose block max-w-none font-serif text-base md:text-lg">
                    <Suspense fallback={<span className="block h-5 w-full animate-pulse rounded bg-secondary/30" />}>
                      <MarkdownRenderer components={optionComponents}>
                        {sanitizeMarkdown(stripQuizOptionLabel(option))}
                      </MarkdownRenderer>
                    </Suspense>
                  </span>
                </QuizOption>
              ))}
            </div>

            {isAnswered && (
              <div className="flex items-start gap-3 rounded-xl bg-info-muted p-5 text-info-muted-foreground animate-in fade-in slide-in-from-top-2 duration-300">
                <Info aria-hidden className="mt-1 size-5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-xs font-bold uppercase tracking-wide">Explanation</p>
                  <div className="prose mt-2 max-w-none wrap-break-word text-base leading-relaxed">
                    <Suspense fallback={<div className="h-4 w-full animate-pulse rounded bg-secondary/30" />}>
                      <MarkdownRenderer components={contentComponents}>
                        {sanitizeMarkdown(currentQuestion.explanation)}
                      </MarkdownRenderer>
                    </Suspense>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="z-10 shrink-0 border-t border-border bg-background/80 p-4 backdrop-blur-md md:px-12 md:py-6">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          {reviewMode ? (
            <span />
          ) : (
            <Popover open={showHint} onOpenChange={setShowHint}>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Lightbulb />
                  Hint
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-72">
                <p className="mb-1 font-sans text-xs font-bold uppercase tracking-wide text-primary">
                  Hint
                </p>
                <p className="text-sm leading-relaxed">
                  {currentQuestion.hint || "Try to recall the definition from your notes."}
                </p>
              </PopoverContent>
            </Popover>
          )}
          <span
            key={score}
            className="font-sans text-xs font-semibold tabular-nums text-muted-foreground animate-studio-pop"
          >
            Score {score}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>
              Previous
            </Button>
            <Button
              key={`next-${currentIndex}-${isAnswered}`}
              size="sm"
              className={cn("min-w-25", isAnswered && !reviewMode && "animate-studio-nudge")}
              onClick={handleNext}
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

Notes:
- **`reviewQuiz` is dropped.** It's replaced by `reviewQuestion(0)`. Remove `Sparkles`, `CheckCircle2`, `XCircle` and `ChevronUp` from the imports if nothing uses them any more.
- **`score` is now derived from `questionStates`.** It compares against `question.answer` exactly as the old results reduce did, so the count is unchanged.
- **Check the `PopoverContent` props.** Open `apps/web/src/shared/components/ui/popover.tsx` and confirm `PopoverContent` accepts `side` and `align`. Radix `Content` does.
- **Types.** If `MarkdownRendererProps["components"]` rejects a component's props type, type the parameters as `{ children?: React.ReactNode }`. Do not use `any`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `bun run test src/features/studio/components/views/QuizView.test.tsx`. Expected: PASS (4 tests).

- [ ] **Step 5: Run the wider checks.**
  - From the root: `bun run typecheck:web`.
  - `bun run test src/features/studio`.
  - From `apps/web`: `npx eslint src/features/studio/components/views/QuizView.tsx`. Expected: 0 problems. The file joins `MIGRATED` in Task 6, so every warning has to go now.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/features/studio/components/views/QuizView.tsx apps/web/src/features/studio/components/views/QuizView.test.tsx
git commit -m "feat(studio): quiz answering feels rewarding: drawn ticks, shake, burst, streak, results ring"
```

---

### Task 5: `WrittenQuestionsView` on the practice pieces (markup only, plus #177)

**Files:**
- Modify: `apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx`
- Test: the existing `WrittenQuestionsView.test.tsx` must pass with no edits. Add only the new tests below.

Do not change any of the following:
- the grade-on-Finish loop (`runGradeAllThenShowResults`);
- the draft autosave (`flushDraft` and its effects);
- `latestNoteRef`;
- `selectPendingGradeIds` and `summarizeWrittenQuestions`;
- any `use*` hook call order.

New hooks go next to the existing ones, before any early `return`.

- [ ] **Step 1: Write the failing tests.** Append a new `describe` block to `WrittenQuestionsView.test.tsx`, reusing its existing mocks and `makeNote`:

```tsx
describe("WrittenQuestionsView redesign", () => {
  it("keeps the header phrases whole for narrow panels (#177)", () => {
    render(<WrittenQuestionsView note={makeNote()} />);
    expect(screen.getByText("Question 1 of 2")).toHaveClass("whitespace-nowrap");
    expect(screen.getByText("0 of 2 answered")).toHaveClass("whitespace-nowrap");
  });

  it("builds a streak from full-mark answers", async () => {
    // Once per Submit: vi.clearAllMocks() doesn't reset implementations, so a persistent mock would leak.
    submitAnswer
      .mockResolvedValueOnce({ score: 5, maxScore: 5 })
      .mockResolvedValueOnce({ score: 5, maxScore: 5 });
    const user = userEvent.setup();
    const note = makeNote();
    render(<WrittenQuestionsView note={note} />);
    await user.type(screen.getByPlaceholderText(/Type your short answer/i), "a");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByPlaceholderText(/Type your short answer/i), "b");
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("2 in a row")).toBeInTheDocument();
  });

  it("finishes on the results ring with review chips", async () => {
    const note = makeNote({
      userAnswers: {
        q1: { answer: "a", graded: true, score: 5, maxScore: 5 },
        q2: { answer: "b", graded: true, score: 2, maxScore: 5 },
      },
    });
    latestNote = note;
    const user = userEvent.setup();
    render(<WrittenQuestionsView note={note} />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText("Assessment Complete!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review question 1" })).toHaveAttribute("data-state", "correct");
    expect(screen.getByRole("button", { name: "Review question 2" })).toHaveAttribute("data-state", "partial");
  });
});
```

The streak test depends on the local `userAnswers` not flipping to graded right after Submit. Today the view relies on the reactive echo, which is `latestNote` and stays `null` in the test. The streak is recorded straight from the submit result, so the test does not need the echo.

- [ ] **Step 2: Run the tests and confirm the new ones fail.** Run `bun run test src/features/studio/components/views/WrittenQuestionsView.test.tsx`. Expected: the new tests FAIL and the existing ones PASS.

- [ ] **Step 3: Imports and state.** Make these changes:
  - **Imports:** change the lucide import to `{ AlertCircle, ArrowLeft, CheckCircle2, Eye, MessageSquareText, RotateCcw }`, dropping `Award`.
  - **New imports:**

```tsx
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Progress } from "@/shared/components/ui/progress";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/utils/cn";
import { Burst } from "../../motion/Burst";
import { useCountUp } from "../../motion/useCountUp";
import { useStreak } from "../../motion/useStreak";
import { QuestionProgress } from "../practice/QuestionProgress";
import { ResultsSummary } from "../practice/ResultsSummary";
import { StreakChip } from "../practice/StreakChip";
import type { QuestionState } from "../practice/types";
```

  - **`GradedScore`:** add this small component above `WrittenQuestionsView`. It's a separate component so its hook stays out of the view's early returns.

```tsx
/** "7 / 10", counting up when a grade arrives. */
function GradedScore({ score, maxScore }: { score: number; maxScore: number }) {
  const shown = useCountUp(score);
  return (
    <>
      {shown} / {maxScore}
    </>
  );
}
```

  - **New state:** inside the component, right after `const latestNote = useWrittenQuestionSet(note.id);`, add:

```tsx
  const { streak, record, reset: resetStreak } = useStreak();
  // The question that just earned full marks: its score banner bursts once.
  const [celebratedId, setCelebratedId] = useState<string | null>(null);
```

- [ ] **Step 4: Derived states and handlers.** After `const totalCount = questions.length;`, add:

```tsx
  const questionStates: Array<QuestionState | undefined> = questions.map((question) => {
    const entry = userAnswers[question.id];
    if (!entry?.answer?.trim()) return undefined;
    if (!entry.graded) return "answered";
    const max = entry.maxScore ?? 0;
    const got = entry.score ?? 0;
    if (max > 0 && got >= max) return "correct";
    return got > 0 ? "partial" : "incorrect";
  });
```

In `handleSubmitAnswer`, right after `const result = await submitAnswerMutation({ … });`, replace `console.log("Grading complete:", result);` with:

```tsx
      const fullMarks = result.maxScore > 0 && result.score >= result.maxScore;
      record(fullMarks);
      setCelebratedId(fullMarks ? currentQuestion.id : null);
```

In `resetQuestions`, after `setGradingAll(GRADING_ALL_IDLE);`, add `resetStreak();` and `setCelebratedId(null);`.

After `reviewAnswers`, add:

```tsx
  const reviewQuestion = (position: number) => {
    setCurrentIndex(position);
    setShowResults(false);
    setReviewMode(true);
  };
```

- [ ] **Step 5: The grading-all screen.** Replace the body of `if (gradingAll.active) { return (…) }` with:

```tsx
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
          <span className="text-primary" aria-hidden="true">
            <Spinner className="size-8" />
          </span>
          <p className="text-muted-foreground">
            Grading your answers… {gradingAll.done} of {gradingAll.total}
          </p>
          <Progress
            value={gradingAll.total > 0 ? (gradingAll.done / gradingAll.total) * 100 : null}
            size="sm"
            glint
            aria-label="Grading progress"
            className="w-48"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              gradingCancelledRef.current = true;
              // Reflect the stop in render state right away; the loop only
              // notices at the top of its next iteration, which can be tens of
              // seconds out with real grading in flight.
              setGradingAll((s) => ({ ...s, stopping: true }));
            }}
            disabled={gradingAll.stopping}
          >
            {gradingAll.stopping ? "Stopping…" : "Stop grading"}
          </Button>
        </div>
      </div>
    );
```

If `Spinner className="size-8"` is flagged by design lint, drop the class and keep the default size.

- [ ] **Step 6: The results screen.** Replace the `return (…)` inside `if (showResults) { … }` with the code below. Keep the existing `summarizeWrittenQuestions` line above it.

```tsx
    return (
      <ResultsSummary
        title="Assessment Complete!"
        fraction={percentage / 100}
        value={percentage}
        valueSuffix="%"
        questions={questionStates.map((state, position) => ({
          state,
          onReview: () => reviewQuestion(position),
        }))}
        actions={
          <>
            <Button variant="secondary" className="flex-1" onClick={reviewAnswers}>
              <Eye />
              Review
            </Button>
            <Button className="flex-1" onClick={resetQuestions} disabled={isResetting}>
              {isResetting ? <Spinner /> : <RotateCcw />}
              {isResetting ? "Resetting…" : "Try Again"}
            </Button>
          </>
        }
      >
        <p className="text-muted-foreground">
          You scored {score} out of {maxScore} points
        </p>
        <p className="text-xs text-muted-foreground">
          Graded {gradedCount} of {totalCount} questions
        </p>
        {gradedCount < totalCount && (
          <p className="text-xs text-muted-foreground">Ungraded questions count as 0.</p>
        )}
        {gradingAll.failed > 0 && (
          <p className="text-xs text-warning-muted-foreground">
            {gradingAll.failed} answer(s) couldn't be graded — press Finish again to retry.
          </p>
        )}
      </ResultsSummary>
    );
```

The ring shows `{percentage}%` in a single text node, which keeps the existing `getByText("0%")` and `/^0\s*%$/` assertions working.

- [ ] **Step 7: The main view.** Make these replacements in the final `return (…)`:

1. **Mobile back button:**
   - Replace the `<button onClick={onBack} …>` with `<Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to Studio"><ArrowLeft /></Button>`.
   - In the scroll area, change `className="flex-1 bg-card border-t border-border min-h-0 overflow-y-auto"` to `className="min-h-0 flex-1 overflow-y-auto bg-card"`.
2. **Review banner:**

```tsx
          {reviewMode && (
            <Alert variant="warning" className="mb-6">
              <Eye />
              <AlertTitle>Review Mode</AlertTitle>
              <AlertDescription>
                You are viewing your previous answers. Editing is disabled.
              </AlertDescription>
            </Alert>
          )}
```

   Design lint may reject `className="mb-6"` on `Alert`. If it does, wrap the `Alert` in `<div className="mb-6">` instead.

3. **Progress header**, replacing the whole `{/* Progress Header */}` block:

```tsx
          <div className="mb-8">
            <QuestionProgress
              currentIndex={currentIndex}
              states={questionStates}
              trailing={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="whitespace-nowrap">
                    {answeredCount} of {totalCount} answered
                  </span>
                  <StreakChip streak={streak} />
                </span>
              }
            />
          </div>
```

4. **Question type badge,** replacing the `{/* Question Type Badge */}` block:

```tsx
          <div className="mb-4">
            <Badge variant="secondary">
              <MessageSquareText />
              {currentQuestion.questionType === "short" ? "Short answer" : "Essay"}
              {currentQuestion.questionType === "short" ? null : (
                <span className="text-muted-foreground">· {currentQuestion.rubric.maxPoints} pts</span>
              )}
            </Badge>
          </div>
```

5. **Question:**
   - Wrap the question `div` and the answer/graded block in `<div key={currentIndex} className="flex flex-1 flex-col animate-in fade-in slide-in-from-right-4 duration-300">…</div>`.
   - Change the question `div`'s classes to `prose mb-6 w-full max-w-none font-serif text-lg leading-relaxed text-foreground md:text-xl`. That drops `prose-stone` and `dark:prose-invert`.
6. **Answer input,** replacing the `!isGraded` branch:

```tsx
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative flex min-h-50 flex-1">
                <textarea
                  value={currentAnswer}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  placeholder={
                    currentQuestion.questionType === "short"
                      ? "Type your short answer here (1-3 sentences)..."
                      : "Type your detailed answer here..."
                  }
                  disabled={reviewMode}
                  data-answered={isAnswered ? "true" : undefined}
                  className="w-full flex-1 resize-none rounded-xl bg-background p-6 font-serif text-base leading-relaxed shadow-xs ring-1 ring-hairline outline-hidden transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-70 data-[answered=true]:ring-primary/40"
                />
                {isSubmitting ? (
                  <span aria-hidden className="studio-sheen pointer-events-none absolute inset-0 rounded-xl" />
                ) : null}
              </div>
              <div className="mt-2 flex shrink-0 items-center justify-between font-mono text-xs text-muted-foreground">
                <span>{currentAnswer.length} characters</span>
                <span>{currentAnswer.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
```

7. **Graded result:**
   - Replace the `{/* Score Banner */}` div with:

```tsx
              <div className="relative rounded-xl bg-primary/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-6 text-primary" />
                    <div>
                      <span className="text-sm font-semibold text-primary">Answer Graded</span>
                      <div className="mt-0.5 text-2xl font-bold tabular-nums text-primary">
                        <GradedScore
                          score={currentGradedResult.score}
                          maxScore={currentGradedResult.maxScore}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Score</div>
                    <div className="text-lg font-bold text-foreground">
                      {currentGradedResult.maxScore > 0
                        ? Math.round((currentGradedResult.score / currentGradedResult.maxScore) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                </div>
                {celebratedId === currentQuestion.id ? <Burst /> : null}
              </div>
```

   - Add `animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-300` to each of the four result cards:
     - "Your Answer" gets `delay-100`;
     - "Feedback" gets `delay-150`;
     - "Strengths" gets `delay-200`;
     - "Areas for Improvement" gets `delay-300`.
   - Leave their content and their `border-*-border` token borders alone.

8. **Footer buttons:**
   - **Previous:** `<Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentIndex === 0}>Previous</Button>`.
   - **Next/Finish:**

```tsx
            <Button
              key={`next-${currentIndex}-${isGraded}`}
              size="sm"
              className={cn("min-w-25", isGraded && !reviewMode && "animate-studio-nudge")}
              onClick={handleNext}
            >
              {currentIndex === questions.length - 1 ? "Finish" : "Next"}
            </Button>
```

   - **Submit:**

```tsx
          {!isGraded && !reviewMode && (
            <Button size="sm" className="min-w-25" onClick={handleSubmitAnswer} disabled={!isAnswered || isSubmitting}>
              {isSubmitting ? <Spinner /> : <CheckCircle2 />}
              {isSubmitting ? "Grading…" : "Submit"}
            </Button>
          )}
```

- [ ] **Step 8: Run the tests and confirm they pass.** Run `bun run test src/features/studio/components/views/WrittenQuestionsView.test.tsx`. Expected: all the old tests and the 3 new tests PASS.

If an old test fails, the markup broke a contract (see the table at the top of this plan). Fix the markup. Never change an old test.

- [ ] **Step 9: Run the wider checks.**
  - `bun run typecheck:web`.
  - `bun run test src/features/studio`.
  - `npx eslint src/features/studio/components/views/WrittenQuestionsView.tsx`. Expected: 0 problems. Remove anything that's left using layout-only classes or existing tokens.

- [ ] **Step 10: Commit.**

```bash
git add apps/web/src/features/studio/components/views/WrittenQuestionsView.tsx apps/web/src/features/studio/components/views/WrittenQuestionsView.test.tsx
git commit -m "feat(studio): written questions get the rewarding feel; header wraps cleanly (#177)"
```

---

### Task 6: Lock in, gates and PR

**Files:**
- Modify: `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json`

- [ ] **Step 1: Add to `MIGRATED`.** After the PR 1 Studio entries in `MIGRATED`, add:

```js
  "src/features/studio/motion/**/*.tsx",
  "src/features/studio/components/practice/**/*.tsx",
  "src/features/studio/components/views/QuizView.tsx",
  "src/features/studio/components/views/WrittenQuestionsView.tsx",
```

- [ ] **Step 2: Lower the baseline.** From `apps/web`, run `bun run lint:design:update` and check `git diff design-lint-baseline.json`. Expected: `features/studio` drops by about 37, from 357 to about 320. No count may rise.

- [ ] **Step 3: Run the gates** from the root, one at a time:
  - `bun run typecheck:web`
  - `bun run typecheck:convex`
  - `bun run lint`
  - `bun run --cwd apps/web lint:design`
  - `bun run --cwd apps/web test`
  - `bun run knip`
  - `npx playwright test --list e2e/studio`, which only parses the suite.

Everything must pass. `test:convex` isn't affected: no `convex/` changes.

- [ ] **Step 4: Commit.**

```bash
git add apps/web/eslint.config.mjs apps/web/design-lint-baseline.json
git commit -m "chore(web): quiz and written-question views join MIGRATED; baseline drops"
```

- [ ] **Step 5: Visual check.** This is done by the controller in the browser pane. It points the session checkout at the branch head (detached) and uses the running dev server on :5173.

Check these at 1440px and 375px, in light and with reduced motion (the pane reports reduced motion):
- **Quiz:**
  - answer right and wrong, then check the tick, shake, burst and score pop;
  - streak after 2 right answers;
  - Next nudge;
  - results ring, chips, then review mode;
  - hint popover.
- **Written questions:**
  - header at a narrow panel width (#177);
  - grading sheen while submitting.

  Submitting spends credits on grading, so ask the user before a live submit. Otherwise, review an already graded set.
- **Reduced motion:** the shake, burst and nudge are off, and the rest fades.

- [ ] **Step 6: Open the PR.** Push and run `gh pr create` with the title `feat(studio): quiz and written questions feel rewarding (#264, 2/8)`.

  The body covers:
  - what changed;
  - the contracts kept;
  - tests;
  - the visual check;
  - "Fixes #177";
  - "Part of #264";
  - the Claude Code attribution line.

  Bind the PR in the app. Ask the user before merging.
