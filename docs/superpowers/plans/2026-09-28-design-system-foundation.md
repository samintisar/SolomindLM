# Design System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/web` one coherent shadcn-based design system with a premium motion layer, enforced by `@shadcn/lint` through a ratcheting baseline.

**Architecture:** Four sequential PRs (one per phase), each merged before the next branches from `origin/main`. Phase 1 installs the missing animation utilities and a lazily loaded `motion/react` layer. Phase 2 consolidates tokens and adds a contrast test. Phase 3 rebuilds the component layer on real shadcn components (incl. a `sonner` adapter behind the existing `useToast` API). Phase 4 adds `@shadcn/lint` via a design-only ESLint config plus a baseline script that fails CI when violations increase.

**Tech Stack:** React 19.2, Vite 7, Tailwind v4, shadcn/ui (`radix` base, `new-york`), `tw-animate-css`, `motion` (`motion/react`), `sonner`, `@shadcn/lint` + ESLint 9, vitest, Bun.

**Spec:** `docs/superpowers/specs/2026-09-28-design-system-foundation-design.md`

---

## Deviations from the spec (decided while planning)

1. **Route transitions** use a fade wrapper keyed by the first path segment around `<Routes>`, not React Router `viewTransition`. The app uses declarative `<BrowserRouter>` and navigates through dozens of `navigate()` calls; a keyed wrapper covers every navigation with one change and works in every WebView. Opacity only, so the wrapper never becomes a containing block for `position: fixed` modals mid-animation.
2. **Duration tokens** are Tailwind's numeric utilities (`duration-120`, `duration-200`, `duration-320`, `duration-500`) plus JS constants for `motion`. Tailwind v4 has no duration theme namespace. Easing overrides Tailwind's own `--ease-out` / `--ease-in-out` theme variables, so `ease-out` means our curve everywhere.
3. **Animated tab indicator** moves to the "in-app signature moments" follow-up. Without it no layout animations are needed, so `LazyMotion` loads `domAnimation` (not `domMax`).
4. **16 `--vintage-*` cover swatches stay.** Folder and notebook cover colors are persisted in Convex (`notebooks.coverColor`, `folders.color`) as class strings such as `bg-vintage-brown-300`. Only the non-swatch shades are retired.
5. **`lint:design` is its own script**, not appended to `lint`. CI and the pre-push hook pass Biome flags through `bun run lint -- …`, which would break if `lint` chained two commands.
6. **Phase 4 errors apply to `src/shared/components/ui/**` and `src/shared/components/motion/**` only.** The rest of `src/shared/` still has violations (e.g. `GenerationProgress.tsx`) and becomes the first migration PR.
7. **`vitest.config.ts` include** gains `scripts/**/*.test.ts` so the baseline logic is testable.

## Branching

- Phase 1 reuses this worktree's branch: `git branch -m feature/ds-motion-foundation`. It already carries the spec + plan commits.
- Phases 2–4: after the previous PR merges, `git fetch origin && git switch -c feature/<name> origin/main`.
- Every PR: conventional-commit title, body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`, squash merge.

## File map

| File | Phase | Responsibility |
|---|---|---|
| `apps/web/src/index.css` | 1, 2, 3 | Imports, tokens (`:root`, `.dark`, `.auth-form-light`), `@theme`, reduced motion, sonner vars |
| `apps/web/src/shared/components/motion/tokens.ts` | 1 | JS easing/duration constants mirroring CSS |
| `apps/web/src/shared/components/motion/features.ts` | 1 | Async `domAnimation` export for `LazyMotion` |
| `apps/web/src/shared/components/motion/MotionProvider.tsx` | 1 | `MotionConfig` (reduced motion) + `LazyMotion strict` |
| `apps/web/src/shared/components/motion/Reveal.tsx` | 1 | Fade/slide-in on mount or on entering viewport |
| `apps/web/src/shared/components/motion/Stagger.tsx` | 1 | `Stagger` + `StaggerItem` staggered reveal |
| `apps/web/src/shared/components/motion/PresenceItem.tsx` | 1 | Enter/exit list item + `AnimatePresence` re-export |
| `apps/web/src/shared/components/motion/index.ts` | 1 | Barrel |
| `apps/web/src/shared/components/RouteTransition.tsx` | 1 | Keyed fade wrapper for `<Routes>` |
| `apps/web/src/App.tsx` | 1, 3 | Mount providers, route wrapper, `Toaster` |
| `apps/web/src/test/web/tokenContrast.test.ts` | 2 | WCAG AA contrast guard over `index.css` tokens |
| `apps/web/src/shared/notebook/coverColor.ts` (+ test) | 2 | Single source of `COVER_COLORS`; validates stored values |
| `apps/web/src/shared/components/ui/button.tsx` | 3 | `cva` Button with `buttonVariants` |
| `apps/web/src/shared/components/ui/*.tsx` (new) | 3 | shadcn components from the CLI |
| `apps/web/src/shared/components/ui/sonner.tsx` | 3 | `Toaster` bound to the app's `useTheme` |
| `apps/web/src/shared/contexts/useToast.ts`, `ToastContext.tsx` (+ test) | 3 | `useToast` API implemented over `sonner` |
| `apps/web/eslint.config.mjs` | 4 | `@shadcn/lint` rules only |
| `apps/web/scripts/design-lint/baseline.ts` (+ test) | 4 | Pure counting/comparison logic |
| `apps/web/scripts/design-lint-baseline.ts` | 4 | CLI: run ESLint, compare, update |
| `apps/web/design-lint-baseline.json` | 4 | Committed violation counts |

---

# Phase 1 — Motion foundation (PR: `feat(web): motion foundation`)

### Task 1.1: Branch and install dependencies

**Files:** Modify `apps/web/package.json`, `bun.lock`

- [ ] **Step 1: Rename the branch**

```bash
git branch -m feature/ds-motion-foundation
```

- [ ] **Step 2: Install**

```bash
bun add --cwd apps/web motion
bun add --cwd apps/web -d tw-animate-css
```

Expected: both appear in `apps/web/package.json`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "chore(web): add motion and tw-animate-css"
```

### Task 1.2: Import tw-animate-css, easing tokens, reduced motion

**Files:** Modify `apps/web/src/index.css`

- [ ] **Step 1: Add the import** directly under `@import "tailwindcss";` (line 1):

```css
@import "tailwindcss";
@import "tw-animate-css";
```

- [ ] **Step 2: Override Tailwind's easing theme variables.** Add a new non-inline `@theme` block immediately **before** the existing `@theme inline {` line:

```css
/* Motion tokens. Durations use Tailwind's numeric utilities: duration-120 (micro), duration-200
   (base), duration-320 (panels/routes), duration-500 (hero). Keep JS mirrors in
   src/shared/components/motion/tokens.ts in sync. */
@theme {
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

- [ ] **Step 3: Add a global reduced-motion rule** at the very end of the file:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Verify the build emits the utilities**

Run: `bun run --cwd apps/web build 2>&1 | tail -5` then `grep -c "slide-in-from-bottom\|--tw-enter-opacity" apps/web/dist/assets/*.css`
Expected: build succeeds; count > 0 (previously these utilities did not exist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/index.css
git commit -m "fix(web): enable tw-animate-css utilities and add motion tokens"
```

### Task 1.3: Motion JS tokens and lazy feature bundle

**Files:** Create `apps/web/src/shared/components/motion/tokens.ts`, `apps/web/src/shared/components/motion/features.ts`

- [ ] **Step 1: Write `tokens.ts`**

```ts
/** Mirrors the CSS motion tokens in src/index.css. Seconds, as motion/react expects. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  slower: 0.5,
} as const;

/** Default distance (px) for enter slides. Small on purpose: premium motion is felt, not seen. */
export const ENTER_OFFSET = 8;
```

- [ ] **Step 2: Write `features.ts`**

```ts
import { domAnimation } from "motion/react";

// Loaded via dynamic import from MotionProvider so animation features stay out of the entry chunk.
export default domAnimation;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/components/motion/tokens.ts apps/web/src/shared/components/motion/features.ts
git commit -m "feat(web): add motion tokens and lazy feature bundle"
```

### Task 1.4: MotionProvider

**Files:** Create `apps/web/src/shared/components/motion/MotionProvider.tsx`

- [ ] **Step 1: Write the provider**

```tsx
import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT } from "./tokens";

const loadFeatures = () => import("./features").then((mod) => mod.default);

/**
 * App-wide motion defaults. `strict` makes `motion.*` components throw, so everything uses the
 * lightweight `m.*` components and the feature bundle loads lazily.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.base, ease: EASE_OUT }}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:web`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/components/motion/MotionProvider.tsx
git commit -m "feat(web): add MotionProvider with lazy features and reduced motion"
```

### Task 1.5: Reveal, Stagger, PresenceItem primitives

**Files:** Create `Reveal.tsx`, `Stagger.tsx`, `PresenceItem.tsx`, `index.ts` in `apps/web/src/shared/components/motion/`

- [ ] **Step 1: Write `Reveal.tsx`**

```tsx
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before animating. */
  delay?: number;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
}

export function Reveal({ children, className, delay = 0, inView = false }: RevealProps) {
  const hidden = { opacity: 0, y: ENTER_OFFSET };
  const shown = { opacity: 1, y: 0 };
  const transition = { duration: DURATION.slow, ease: EASE_OUT, delay };

  return inView ? (
    <m.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={transition}
    >
      {children}
    </m.div>
  ) : (
    <m.div className={className} initial={hidden} animate={shown} transition={transition}>
      {children}
    </m.div>
  );
}
```

- [ ] **Step 2: Write `Stagger.tsx`**

```tsx
import type { Variants } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: ENTER_OFFSET },
  shown: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE_OUT } },
};

interface StaggerProps {
  children: ReactNode;
  className?: string;
}

export function Stagger({ children, className }: StaggerProps) {
  return (
    <m.div className={className} variants={container} initial="hidden" animate="shown">
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: StaggerProps) {
  return (
    <m.div className={className} variants={item}>
      {children}
    </m.div>
  );
}
```

- [ ] **Step 3: Write `PresenceItem.tsx`**

```tsx
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { DURATION, EASE_OUT, ENTER_OFFSET } from "./tokens";

export { AnimatePresence } from "motion/react";

interface PresenceItemProps {
  children: ReactNode;
  className?: string;
}

/** List item with enter and exit motion. Render inside <AnimatePresence initial={false}> with a stable key. */
export function PresenceItem({ children, className }: PresenceItemProps) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: ENTER_OFFSET }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -ENTER_OFFSET / 2, transition: { duration: DURATION.fast } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </m.div>
  );
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
export { MotionProvider } from "./MotionProvider";
export { AnimatePresence, PresenceItem } from "./PresenceItem";
export { Reveal } from "./Reveal";
export { Stagger, StaggerItem } from "./Stagger";
export { DURATION, EASE_IN_OUT, EASE_OUT, ENTER_OFFSET } from "./tokens";
```

- [ ] **Step 5: Typecheck and lint**

Run: `bun run typecheck:web && bun run lint -- --diagnostic-level=error`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/components/motion
git commit -m "feat(web): add Reveal, Stagger and PresenceItem motion primitives"
```

### Task 1.6: RouteTransition wrapper and app wiring

**Files:** Create `apps/web/src/shared/components/RouteTransition.tsx`; Modify `apps/web/src/App.tsx` (`App` at lines ~524–545, `<Routes>` at ~400)

- [ ] **Step 1: Write `RouteTransition.tsx`**

```tsx
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/shared/utils/cn";

interface RouteTransitionProps {
  children: ReactNode;
  /** Apply the app-shell flex layout (non-public pages live in a flex column). */
  fill: boolean;
}

/**
 * Fades pages in when the top-level section changes. Keyed by the first path segment, so
 * /notebook/a → /notebook/b keeps the tree mounted (no lost chat/stream state), while
 * /home → /notebook/a gets a transition. Opacity only: a transform here would make this div the
 * containing block for fixed-position modals during the animation.
 */
export function RouteTransition({ children, fill }: RouteTransitionProps) {
  const { pathname } = useLocation();
  const section = pathname.split("/")[1] ?? "";

  return (
    <div
      key={section}
      className={cn(
        "animate-in fade-in duration-320 ease-out",
        fill && "flex min-h-0 flex-1 flex-col"
      )}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Wrap `<Routes>` in `AppContent`.** In `apps/web/src/App.tsx`, replace

```tsx
        <NotebookProvider value={notebookContextValue}>
          <Routes>
```

with

```tsx
        <NotebookProvider value={notebookContextValue}>
          <RouteTransition fill={!isPublicPage}>
          <Routes>
```

and replace the matching close

```tsx
          </Routes>
        </NotebookProvider>
```

with

```tsx
          </Routes>
          </RouteTransition>
        </NotebookProvider>
```

Add the import next to the other `./shared/components/*` imports:

```tsx
import { RouteTransition } from "./shared/components/RouteTransition";
```

(`isPublicPage` is already in scope in `AppContent` — it drives the container `className` at line ~367.)

- [ ] **Step 3: Mount `MotionProvider` in `App`.** Replace the `<ThemeProvider>` subtree so it reads:

```tsx
        <ThemeProvider>
          <MotionProvider>
            <AuthProvider>
              <ToastProvider>
                <FeedbackProvider>
                  <AppContent />
                  <FeedbackModal />
                </FeedbackProvider>
                <ToastContainer />
              </ToastProvider>
            </AuthProvider>
          </MotionProvider>
        </ThemeProvider>
```

Import: `import { MotionProvider } from "./shared/components/motion";`

- [ ] **Step 4: Format, typecheck, test**

Run: `bunx biome check --write apps/web/src/App.tsx apps/web/src/shared/components/RouteTransition.tsx && bun run typecheck:web && bun run test:web`
Expected: all pass.

- [ ] **Step 5: Verify in the browser.** Start the dev server with `preview_start` (`bun run dev:web`, port 5173). Check:
  - Navigating `/home` → a notebook fades in (~320ms); switching between two notebooks does **not** re-fade or reset chat.
  - A dialog that uses `animate-in fade-in zoom-in-95` (e.g. the auth page dropdown, `AuthPage.tsx:302`) now animates.
  - With DevTools "Emulate CSS prefers-reduced-motion: reduce", animations are instant.
  - `read_console_messages` shows no errors (in particular no `LazyMotion strict` error).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/shared/components/RouteTransition.tsx
git commit -m "feat(web): fade route sections and mount MotionProvider"
```

### Task 1.7: Phase 1 verification and PR

- [ ] **Step 1:** Invoke `superpowers:verification-before-completion`. Run `bun run typecheck:web`, `bun run typecheck:convex`, `bun run lint -- --diagnostic-level=error`, `bun run test:web`. All must pass.
- [ ] **Step 2:** Check the bundle: `bun run --cwd apps/web build` and confirm `motion` features land in a separate chunk (`ls apps/web/dist/assets | grep -i features`, or inspect the build output for a lazy chunk).
- [ ] **Step 3:** `git push -u origin feature/ds-motion-foundation` and `gh pr create --title "feat(web): motion foundation" --body …` summarizing: the 89 no-op animation classes now work, motion tokens, lazy `motion/react`, route fades, reduced motion. Include the spec + plan links.

---

# Phase 2 — Tokens (PR: `feat(web): semantic status tokens and elevation`)

Branch: `git fetch origin && git switch -c feature/ds-tokens origin/main`

### Task 2.1: Contrast guard test (failing first)

**Files:** Create `apps/web/src/test/web/tokenContrast.test.ts`; Modify `apps/web/package.json`

- [ ] **Step 1: Install culori**

```bash
bun add --cwd apps/web -d culori @types/culori
```

- [ ] **Step 2: Write the test**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../../index.css", import.meta.url)), "utf8");

function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`No ${selector} block in index.css`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const light = tokens(":root");
const dark = { ...light, ...tokens(".dark") };

// [text, background, minimum ratio]
const PAIRS: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["card-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success-foreground", "success", 4.5],
  ["warning-foreground", "warning", 4.5],
  ["info-foreground", "info", 4.5],
  ["success-muted-foreground", "success-muted", 4.5],
  ["warning-muted-foreground", "warning-muted", 4.5],
  ["info-muted-foreground", "info-muted", 4.5],
  ["destructive-muted-foreground", "destructive-muted", 4.5],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast (WCAG AA)", (_theme, t) => {
  it.each(PAIRS)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(t[fg], `missing --${fg}`).toBeDefined();
    expect(t[bg], `missing --${bg}`).toBeDefined();
    expect(wcagContrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `bun run --cwd apps/web test src/test/web/tokenContrast.test.ts`
Expected: FAIL — `missing --info`, `missing --success-muted`, etc., and light `muted-foreground on background` below 4.5.

- [ ] **Step 4: Commit the failing test**

```bash
git add apps/web/package.json bun.lock apps/web/src/test/web/tokenContrast.test.ts
git commit -m "test(web): add WCAG contrast guard for theme tokens"
```

### Task 2.2: Status tokens, contrast fix, elevation

**Files:** Modify `apps/web/src/index.css`

- [ ] **Step 1: Light tokens.** In `:root`, change `--muted-foreground` and add the status set directly after `--warning-foreground`:

```css
    --muted-foreground: oklch(0.5 0.038 71.1655);
```

```css
    --info: oklch(0.52 0.08 245);
    --info-foreground: oklch(1 0 0);
    --success-muted: oklch(0.95 0.03 145);
    --success-muted-foreground: oklch(0.33 0.07 145);
    --success-border: oklch(0.85 0.05 145);
    --warning-muted: oklch(0.95 0.04 85);
    --warning-muted-foreground: oklch(0.36 0.07 70);
    --warning-border: oklch(0.86 0.06 85);
    --info-muted: oklch(0.95 0.025 245);
    --info-muted-foreground: oklch(0.33 0.07 245);
    --info-border: oklch(0.85 0.04 245);
    --destructive-muted: oklch(0.95 0.025 30);
    --destructive-muted-foreground: oklch(0.36 0.09 30);
    --destructive-border: oklch(0.85 0.045 30);
```

- [ ] **Step 2: Dark tokens.** In `.dark`, add directly after `--destructive-foreground`:

```css
    --success: oklch(0.62 0.09 145);
    --success-foreground: oklch(0.19 0.006 65);
    --warning: oklch(0.72 0.09 80);
    --warning-foreground: oklch(0.19 0.006 65);
    --info: oklch(0.64 0.08 245);
    --info-foreground: oklch(0.19 0.006 65);
    --success-muted: oklch(0.26 0.03 145);
    --success-muted-foreground: oklch(0.85 0.06 145);
    --success-border: oklch(0.36 0.04 145);
    --warning-muted: oklch(0.27 0.03 80);
    --warning-muted-foreground: oklch(0.87 0.07 85);
    --warning-border: oklch(0.38 0.045 80);
    --info-muted: oklch(0.26 0.03 245);
    --info-muted-foreground: oklch(0.85 0.05 245);
    --info-border: oklch(0.37 0.04 245);
    --destructive-muted: oklch(0.26 0.035 25);
    --destructive-muted-foreground: oklch(0.85 0.06 25);
    --destructive-border: oklch(0.38 0.05 25);
```

- [ ] **Step 3: Expose in `@theme inline`**, directly after `--color-warning-foreground: var(--warning-foreground);`:

```css
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);
  --color-success-muted: var(--success-muted);
  --color-success-muted-foreground: var(--success-muted-foreground);
  --color-success-border: var(--success-border);
  --color-warning-muted: var(--warning-muted);
  --color-warning-muted-foreground: var(--warning-muted-foreground);
  --color-warning-border: var(--warning-border);
  --color-info-muted: var(--info-muted);
  --color-info-muted-foreground: var(--info-muted-foreground);
  --color-info-border: var(--info-border);
  --color-destructive-muted: var(--destructive-muted);
  --color-destructive-muted-foreground: var(--destructive-muted-foreground);
  --color-destructive-border: var(--destructive-border);
```

- [ ] **Step 4: Run the contrast test**

Run: `bun run --cwd apps/web test src/test/web/tokenContrast.test.ts`
Expected: PASS. If a pair fails, lower that foreground's lightness (light theme) or raise it (dark theme) in 0.02 steps until it passes — change only the failing token.

- [ ] **Step 5: Layered shadows.** Replace the `--shadow-2xs` … `--shadow-2xl` values in `:root` with:

```css
    --shadow-2xs: 0 1px 1px 0 hsl(28 20% 20% / 0.04);
    --shadow-xs: 0 1px 2px 0 hsl(28 20% 20% / 0.06);
    --shadow-sm: 0 1px 2px 0 hsl(28 20% 20% / 0.06), 0 1px 3px 0 hsl(28 20% 20% / 0.08);
    --shadow: 0 1px 2px 0 hsl(28 20% 20% / 0.06), 0 1px 3px 0 hsl(28 20% 20% / 0.08);
    --shadow-md: 0 2px 4px -1px hsl(28 20% 20% / 0.06), 0 4px 8px -2px hsl(28 20% 20% / 0.08);
    --shadow-lg: 0 4px 6px -2px hsl(28 20% 20% / 0.05), 0 12px 24px -4px hsl(28 20% 20% / 0.1);
    --shadow-xl: 0 8px 12px -4px hsl(28 20% 20% / 0.06), 0 24px 48px -8px hsl(28 20% 20% / 0.14);
    --shadow-2xl: 0 32px 64px -12px hsl(28 20% 20% / 0.22);
```

and in `.dark` with:

```css
    --shadow-2xs: 0 1px 1px 0 hsl(35 30% 4% / 0.2);
    --shadow-xs: 0 1px 2px 0 hsl(35 30% 4% / 0.25);
    --shadow-sm: 0 1px 2px 0 hsl(35 30% 4% / 0.25), 0 1px 3px 0 hsl(35 30% 4% / 0.3);
    --shadow: 0 1px 2px 0 hsl(35 30% 4% / 0.25), 0 1px 3px 0 hsl(35 30% 4% / 0.3);
    --shadow-md: 0 2px 4px -1px hsl(35 30% 4% / 0.3), 0 4px 8px -2px hsl(35 30% 4% / 0.35);
    --shadow-lg: 0 4px 6px -2px hsl(35 30% 4% / 0.3), 0 12px 24px -4px hsl(35 30% 4% / 0.4);
    --shadow-xl: 0 8px 12px -4px hsl(35 30% 4% / 0.35), 0 24px 48px -8px hsl(35 30% 4% / 0.5);
    --shadow-2xl: 0 32px 64px -12px hsl(35 30% 4% / 0.6);
```

Then run `grep -rn "var(--shadow-\(x\|y\|blur\|spread\|opacity\|color\))" apps/web/src`. If there are no matches, delete the `--shadow-x`, `--shadow-y`, `--shadow-blur`, `--shadow-spread`, `--shadow-opacity`, `--shadow-color` lines from both blocks.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/index.css
git commit -m "feat(web): add semantic status tokens, fix muted contrast, layered shadows"
```

### Task 2.3: Single source of cover colors

**Files:** Modify `apps/web/src/shared/notebook/coverColor.ts`, `coverColor.test.ts`, `features/notebooks/components/modals/CustomizeNotebookModal.tsx`, `CustomizeFolderModal.tsx`

- [ ] **Step 1: Add failing tests** to `coverColor.test.ts`:

```ts
import { COVER_COLORS } from "./coverColor";

describe("COVER_COLORS", () => {
  it("contains the default cover", () => {
    expect(COVER_COLORS).toContain(DEFAULT_COVER_COLOR);
  });

  it("has 16 unique swatches", () => {
    expect(new Set(COVER_COLORS).size).toBe(16);
  });
});

describe("coverFillClass with unknown classes", () => {
  it("falls back when a stored bg- class is not a known swatch", () => {
    expect(coverFillClass("bg-pink-500")).toBe(DEFAULT_COVER_COLOR);
  });
});
```

(Merge the `COVER_COLORS` import into the existing import line.)

- [ ] **Step 2: Run to confirm failure**

Run: `bun run --cwd apps/web test src/shared/notebook/coverColor.test.ts`
Expected: FAIL — `COVER_COLORS` is not exported; `bg-pink-500` is returned unchanged.

- [ ] **Step 3: Implement** — replace the contents of `coverColor.ts`:

```ts
/**
 * Cover swatches. These exact class strings are persisted in Convex (`notebooks.coverColor`,
 * `folders.color`), so never rename them; the matching `--vintage-*` tokens in index.css must stay.
 */
export const COVER_COLORS = [
  "bg-vintage-brown-300",
  "bg-vintage-red-300",
  "bg-vintage-orange-300",
  "bg-vintage-amber-300",
  "bg-vintage-amber-400",
  "bg-vintage-green-300",
  "bg-vintage-green-400",
  "bg-vintage-blue-300",
  "bg-vintage-blue-400",
  "bg-vintage-blue-500",
  "bg-vintage-brown-400",
  "bg-vintage-red-400",
  "bg-vintage-orange-400",
  "bg-vintage-amber-500",
  "bg-vintage-green-500",
  "bg-vintage-blue-200",
] as const;

export const DEFAULT_COVER_COLOR = "bg-vintage-brown-300";
export const COVER_ICON_CLASS = "text-foreground";

const KNOWN = new Set<string>(COVER_COLORS);

export function coverFillClass(coverColor?: string | null): string {
  return coverColor && KNOWN.has(coverColor) ? coverColor : DEFAULT_COVER_COLOR;
}
```

- [ ] **Step 4: Run tests**

Run: `bun run --cwd apps/web test src/shared/notebook/coverColor.test.ts`
Expected: PASS (existing tests still pass: `bg-vintage-blue-400` is a swatch).

- [ ] **Step 5: Use it in both modals.** In `CustomizeNotebookModal.tsx` and `CustomizeFolderModal.tsx`, delete the local `const COVER_COLORS = [ … ];` array and add `import { COVER_COLORS, DEFAULT_COVER_COLOR } from "@/shared/notebook/coverColor";`. Replace each literal `"bg-vintage-brown-300"` default in those files with `DEFAULT_COVER_COLOR`. Use Serena `replace_content` for these edits.

- [ ] **Step 6: Typecheck, test, commit**

```bash
bun run typecheck:web && bun run test:web
git add apps/web/src/shared/notebook apps/web/src/features/notebooks/components/modals
git commit -m "refactor(web): single source for persisted cover color swatches"
```

### Task 2.4: Retire non-swatch vintage usages

**Files:** The files listed by `grep -rlE "vintage-" apps/web/src --include=*.tsx --include=*.ts | grep -v shared/notebook/coverColor` (20 files at audit time).

- [ ] **Step 1: Apply this mapping** in every listed file. `S` = `success` for green, `destructive` for red, `info` for blue, `warning` for amber and orange. Keep any variant prefix (`hover:`, `dark:`, `group-hover:` …) and opacity suffix as is. Delete a `dark:` variant entirely when it only re-sets the same semantic class (tokens handle dark mode).

| Old class | New class |
|---|---|
| `bg-vintage-*-50`, `-100`, `-200`, `-300`, `-200/50`, `-900/20`, `-600/15` | `bg-S-muted` |
| `bg-vintage-*-400`, `-500`, `-600`, `-700` | `bg-S` |
| `text-vintage-*-200`, `-300`, `-500`, `-600` | `text-S` |
| `text-vintage-*-700`, `-800` | `text-S-muted-foreground` |
| `border-vintage-*-200`, `-300` | `border-S-border` |
| `border-vintage-*-600`, `-800` | `border-S` |
| `fill-vintage-*-500/25`, `-600/30` | `fill-S/25`, `fill-S/30` |
| `bg-vintage-brown-*` outside `COVER_COLORS` | `bg-muted` |

Do **not** touch strings inside `COVER_COLORS` or `DEFAULT_COVER_COLOR`.

- [ ] **Step 2: Confirm only swatches remain**

Run: `grep -rnoE "[a-z-]+-vintage-[a-z]+-[0-9]+" apps/web/src --include=*.tsx --include=*.ts | grep -v "shared/notebook/coverColor"`
Expected: no output.

- [ ] **Step 3: Prune CSS.** In `index.css`, delete every `--vintage-*` variable in `:root`, `.dark` and `@theme inline` **except** the 16 swatch shades (brown 300/400; red 300/400; orange 300/400; amber 300/400/500; green 300/400/500; blue 200/300/400/500). In `.auth-form-light`, replace the `--vintage-*` lines with:

```css
    --muted-foreground: oklch(0.5 0.038 71.1655);
    --destructive-muted: oklch(0.95 0.025 30);
    --destructive-muted-foreground: oklch(0.36 0.09 30);
    --destructive-border: oklch(0.85 0.045 30);
    --warning-muted: oklch(0.95 0.04 85);
    --warning-muted-foreground: oklch(0.36 0.07 70);
    --warning-border: oklch(0.86 0.06 85);
```

(and delete its old `--muted-foreground` line so the property is not duplicated). Add above the remaining vintage variables in `:root`: `/* Cover swatches — persisted in Convex as class names. See shared/notebook/coverColor.ts. */`

- [ ] **Step 4: Verify**

Run: `bun run typecheck:web && bun run lint -- --diagnostic-level=error && bun run test:web`
Expected: pass. Then with `preview_start`, screenshot in light and dark: the auth page error state, a success/warning toast, notebook cards with covers, and one studio view that used vintage colors. Compare against `main`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "refactor(web): replace vintage status colors with semantic tokens"
```

### Task 2.5: Phase 2 verification and PR

- [ ] Invoke `superpowers:verification-before-completion`; run typecheck (web + convex), lint, `test:web`.
- [ ] `gh pr create --title "feat(web): semantic status tokens and elevation"` with before/after screenshots (light + dark).

---

# Phase 3 — Component layer (PR: `feat(web): shadcn component layer`)

Branch: `git fetch origin && git switch -c feature/ds-components origin/main`

### Task 3.1: `cva` Button

**Files:** Modify `apps/web/src/shared/components/ui/button.tsx`

- [ ] **Step 1: Review upstream first**

Run: `cd apps/web && bunx --bun shadcn@latest add button --diff button.tsx`
Expected: a diff against upstream (do not apply it).

- [ ] **Step 2: Replace the file**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-semibold tracking-wide",
    "transition-all duration-200 ease-out outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:-translate-y-px hover:bg-primary/88 hover:shadow-lg hover:shadow-primary/35 active:translate-y-0 active:scale-98 active:shadow-md",
        destructive:
          "rounded-xl bg-destructive text-destructive-foreground shadow-md shadow-destructive/25 hover:-translate-y-px hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/35 active:translate-y-0 active:scale-98",
        outline:
          "rounded-xl border-2 border-input bg-background hover:border-primary/40 hover:bg-accent/60 hover:text-accent-foreground active:scale-98",
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-98",
        ghost: "rounded-lg hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, type ButtonProps, buttonVariants };
```

- [ ] **Step 3: Typecheck and test**

Run: `bun run typecheck:web && bun run test:web`
Expected: pass. The 11 importing files only use `variant`, `size`, `className` and button attributes, which are all still supported.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/components/ui/button.tsx
git commit -m "refactor(web): rebuild Button on cva with buttonVariants"
```

### Task 3.2: Add core shadcn components

**Files:** Create files in `apps/web/src/shared/components/ui/`; Modify `apps/web/package.json`

- [ ] **Step 1: Add**

```bash
cd apps/web
bunx --bun shadcn@latest add card badge input field input-group select dropdown-menu popover sheet alert-dialog tooltip skeleton spinner sonner empty alert separator scroll-area toggle-group avatar --yes
```

- [ ] **Step 2: Protect existing components**

Run: `git status --short src/shared/components/ui`
Expected: only `??` (new) files. If `button.tsx`, `label.tsx`, `textarea.tsx`, `dialog.tsx` or `tabs.tsx` show `M`, run `git checkout -- <file>` for each.

- [ ] **Step 3: Review every added file** (shadcn skill workflow step 7): imports use `@/shared/utils/cn` and `@/shared/components/ui/*`; icons come from `lucide-react`; `alert-dialog.tsx` imports `buttonVariants` from `./button` (exported in Task 3.1). Fix any `@/components/ui/…` or `@/lib/utils` imports to the project aliases.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck:web`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json bun.lock apps/web/src/shared/components/ui
git commit -m "feat(web): add core shadcn components"
```

### Task 3.3: Theme-aware Toaster without next-themes

**Files:** Modify `apps/web/src/shared/components/ui/sonner.tsx`, `apps/web/src/index.css`, `apps/web/package.json`

- [ ] **Step 1: Replace `sonner.tsx`**

```tsx
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/shared/contexts/useTheme";

function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      {...props}
    />
  );
}

export { Toaster };
```

- [ ] **Step 2: Move sonner's theme variables to CSS** (no inline styles). Add to `index.css` after the `@theme inline` block:

```css
/* Sonner reads these; the :root prefix outranks its [data-sonner-toaster][data-sonner-theme] rules. */
:root [data-sonner-toaster].toaster {
  --normal-bg: var(--popover);
  --normal-text: var(--popover-foreground);
  --normal-border: var(--border);
  --border-radius: var(--radius);
}
```

- [ ] **Step 3: Drop next-themes if the CLI added it**

Run: `grep -rn "next-themes" apps/web/src || bun remove --cwd apps/web next-themes`
Expected: no source references; the package is removed if it was installed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/components/ui/sonner.tsx apps/web/src/index.css apps/web/package.json bun.lock
git commit -m "feat(web): theme-aware sonner Toaster"
```

### Task 3.4: `useToast` over sonner (TDD)

**Files:** Modify `apps/web/src/shared/contexts/useToast.ts`, `ToastContext.tsx`, `ToastContext.test.tsx`

- [ ] **Step 1: Replace `ToastContext.test.tsx`**

```tsx
import { renderHook } from "@testing-library/react";
import { toast as sonner } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { useToast } from "@/shared/contexts/useToast";

vi.mock("sonner", () => {
  const toast = Object.assign(
    vi.fn(() => "id-default"),
    {
      success: vi.fn(() => "id-success"),
      error: vi.fn(() => "id-error"),
      info: vi.fn(() => 7),
      loading: vi.fn(() => "id-loading"),
      dismiss: vi.fn(),
    }
  );
  return { toast };
});

function renderToastHook() {
  return renderHook(() => useToast(), { wrapper: ToastProvider });
}

describe("ToastProvider (sonner adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when useToast is used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within a ToastProvider"
    );
    spy.mockRestore();
  });

  it("success uses the default 4000ms duration and returns the id", () => {
    const { result } = renderToastHook();
    expect(result.current.success("Done!")).toBe("id-success");
    expect(sonner.success).toHaveBeenCalledWith("Done!", expect.objectContaining({ duration: 4000 }));
  });

  it("error defaults to 6000ms and respects an override", () => {
    const { result } = renderToastHook();
    result.current.error("Failed");
    expect(sonner.error).toHaveBeenLastCalledWith("Failed", expect.objectContaining({ duration: 6000 }));
    result.current.error("Failed", { duration: 3000 });
    expect(sonner.error).toHaveBeenLastCalledWith("Failed", expect.objectContaining({ duration: 3000 }));
  });

  it("loading never auto-dismisses, even when a duration is passed", () => {
    const { result } = renderToastHook();
    result.current.loading("Working", { duration: 1000 });
    expect(sonner.loading).toHaveBeenCalledWith("Working", expect.objectContaining({ duration: Infinity }));
  });

  it("toast() defaults to info and stringifies numeric ids", () => {
    const { result } = renderToastHook();
    expect(result.current.toast("Hello")).toBe("7");
    expect(sonner.info).toHaveBeenCalledWith("Hello", expect.objectContaining({ duration: 4000 }));
  });

  it("toast() routes by type", () => {
    const { result } = renderToastHook();
    result.current.toast("Saved", { type: "success" });
    expect(sonner.success).toHaveBeenCalledWith("Saved", expect.anything());
  });

  it("passes id and action through", () => {
    const { result } = renderToastHook();
    const onClick = vi.fn();
    result.current.info("Undo?", { id: "undo-1", action: { label: "Undo", onClick } });
    expect(sonner.info).toHaveBeenCalledWith(
      "Undo?",
      expect.objectContaining({ id: "undo-1", action: { label: "Undo", onClick } })
    );
  });

  it("dismiss forwards to sonner", () => {
    const { result } = renderToastHook();
    result.current.dismiss("id-loading");
    expect(sonner.dismiss).toHaveBeenCalledWith("id-loading");
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `bun run --cwd apps/web test src/shared/contexts/ToastContext.test.tsx`
Expected: FAIL — sonner mocks are never called (the provider still keeps local state).

- [ ] **Step 3: Update `useToast.ts`** — replace `ToastContextValue` (keep `ToastType`, `Toast`, `ToastContext`, `useToast` unchanged):

```ts
export interface ToastContextValue {
  toast: (message: string, options?: Partial<Toast>) => string;
  success: (message: string, options?: Partial<Toast>) => string;
  error: (message: string, options?: Partial<Toast>) => string;
  info: (message: string, options?: Partial<Toast>) => string;
  loading: (message: string, options?: Partial<Toast>) => string;
  dismiss: (id?: string) => void;
}
```

- [ ] **Step 4: Replace `ToastContext.tsx`**

```tsx
import type { ReactNode } from "react";
import { toast as sonner } from "sonner";
import { type Toast, ToastContext, type ToastContextValue, type ToastType } from "./useToast";

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;

function durationFor(type: ToastType, requested?: number): number {
  if (type === "loading") return Infinity;
  if (type === "error") return requested ?? ERROR_DURATION;
  return requested ?? DEFAULT_DURATION;
}

function show(message: string, options: Partial<Toast> = {}): string {
  const type = options.type ?? "info";
  const external = {
    id: options.id,
    action: options.action,
    duration: durationFor(type, options.duration),
  };
  return String(sonner[type](message, external));
}

// Stateless: sonner owns the toast queue, so the context value never changes.
const value: ToastContextValue = {
  toast: show,
  success: (message, options) => show(message, { ...options, type: "success" }),
  error: (message, options) => show(message, { ...options, type: "error" }),
  info: (message, options) => show(message, { ...options, type: "info" }),
  loading: (message, options) => show(message, { ...options, type: "loading" }),
  dismiss: (id) => {
    sonner.dismiss(id);
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
```

- [ ] **Step 5: Run tests**

Run: `bun run --cwd apps/web test src/shared/contexts/ToastContext.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/contexts
git commit -m "refactor(web): implement useToast over sonner"
```

### Task 3.5: Swap ToastContainer for Toaster

**Files:** Modify `apps/web/src/App.tsx`, `apps/web/src/shared/components/index.ts`; Delete `apps/web/src/shared/components/ToastContainer.tsx`

- [ ] **Step 1:** In `App.tsx`, replace `<ToastContainer />` with `<Toaster position="bottom-right" />` and the import `import { ToastContainer } from "./shared/components/ToastContainer";` with `import { Toaster } from "./shared/components/ui/sonner";`.
- [ ] **Step 2:** In `shared/components/index.ts`, delete `export { ToastContainer } from "./ToastContainer";`.
- [ ] **Step 3:** `git rm apps/web/src/shared/components/ToastContainer.tsx`
- [ ] **Step 4: Verify**

Run: `bun run typecheck:web && bun run test:web && bun run lint -- --diagnostic-level=error`
Expected: pass. Check `grep -rn "\.toasts\b" apps/web/src` returns nothing.

Then with `preview_start`: trigger a success toast (e.g. rename a notebook), an error toast, and a loading toast (studio generation). Confirm styling in light and dark mode, enter/exit animation, and that the loading toast is dismissed when generation finishes.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/App.tsx apps/web/src/shared/components
git commit -m "feat(web): render toasts with sonner"
```

### Task 3.6: Phase 3 verification and PR

- [ ] Invoke `superpowers:verification-before-completion`; run typecheck (web + convex), lint, `test:web`, `test:e2e` (toasts and buttons are on e2e paths).
- [ ] `gh pr create --title "feat(web): shadcn component layer"` with screenshots of buttons and toasts in both themes.

---

# Phase 4 — Lint ratchet (PR: `feat(web): enforce design system with shadcn/lint`)

Branch: `git fetch origin && git switch -c feature/ds-lint origin/main`

### Task 4.1: Install and configure `@shadcn/lint`

**Files:** Create `apps/web/eslint.config.mjs`; Modify `apps/web/package.json`

- [ ] **Step 1: Install**

```bash
bun add --cwd apps/web -d @shadcn/lint eslint @typescript-eslint/parser
```

Expected: `eslint` resolves to ≥ 9.30.

- [ ] **Step 2: Write `apps/web/eslint.config.mjs`**

```js
// Design-system lint only. Biome remains the primary linter; this config runs @shadcn/lint.
import { plugin as shadcn } from "@shadcn/lint";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

/** Migrated to the design system: violations are errors. Add a feature dir when its PR lands. */
const MIGRATED = ["src/shared/components/ui/**/*.tsx", "src/shared/components/motion/**/*.tsx"];

const rules = (level) => ({
  "shadcn/no-restyle": [level, { allow: ["layout"] }],
  "shadcn/no-raw-colors": level,
  "shadcn/no-arbitrary-values": level,
  "shadcn/no-inline-styles": level,
  "shadcn/no-unknown-classes": level,
  "shadcn/require-static-classes": level,
});

export default defineConfig([
  { ignores: ["dist/**", "node_modules/**", "**/*.test.tsx"] },
  {
    files: ["src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    settings: {
      shadcn: {
        ui: "@/shared/components/ui",
        mergeFunctions: ["cn"],
        variantFunctions: ["cva"],
        note: "Design rules: .agents/skills/shadcn/SKILL.md. Pages place components (layout only); new looks are new variants in src/shared/components/ui. Use semantic tokens (bg-success-muted, text-info), never palette colors.",
      },
    },
    rules: rules("warn"),
  },
  { files: MIGRATED, rules: rules("error") },
]);
```

- [ ] **Step 3: Prove the rules fire.** Create a scratch file `apps/web/src/shared/components/motion/__lint_probe.tsx`:

```tsx
import { Button } from "@/shared/components/ui/button";

export function Probe() {
  return <Button className="bg-pink-500 p-[13px]">x</Button>;
}
```

Run: `cd apps/web && bunx eslint src/shared/components/motion/__lint_probe.tsx`
Expected: errors from `shadcn/no-raw-colors`, `shadcn/no-arbitrary-values` and `shadcn/no-restyle` (padding/color on Button). Then delete the probe: `rm apps/web/src/shared/components/motion/__lint_probe.tsx`.

- [ ] **Step 4: Check the migrated dirs are clean**

Run: `cd apps/web && bunx eslint "src/shared/components/ui/**/*.tsx" "src/shared/components/motion/**/*.tsx"`
Expected: 0 errors. Fix any finding in files we wrote (Button, sonner, motion). For findings inside CLI-generated shadcn files, do **not** hand-edit upstream markup. Move those files from `MIGRATED` into an explicit `ignores` entry on the error block and list them in the PR description.

- [ ] **Step 5: Commit**

```bash
git add apps/web/eslint.config.mjs apps/web/package.json bun.lock
git commit -m "feat(web): add @shadcn/lint design-system config"
```

### Task 4.2: Baseline logic (TDD)

**Files:** Create `apps/web/scripts/design-lint/baseline.ts`, `apps/web/scripts/design-lint/baseline.test.ts`; Modify `apps/web/vitest.config.ts`

- [ ] **Step 1: Let vitest see scripts.** In `vitest.config.ts` change

```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
```

to

```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"],
```

- [ ] **Step 2: Write the failing tests** (`baseline.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { areaOf, compareCounts, countViolations, type LintResult, sortCounts } from "./baseline";

const msg = (ruleId: string | null, severity = 1) => ({ ruleId, severity, message: "m", line: 1 });

describe("areaOf", () => {
  it("groups feature files by feature", () => {
    expect(areaOf("C:\\repo\\apps\\web\\src\\features\\chat\\components\\X.tsx")).toBe("features/chat");
  });
  it("groups shared files under shared", () => {
    expect(areaOf("/repo/apps/web/src/shared/components/ui/button.tsx")).toBe("shared");
  });
  it("puts top-level src files under root", () => {
    expect(areaOf("/repo/apps/web/src/App.tsx")).toBe("root");
  });
  it("uses the first dir for other src dirs", () => {
    expect(areaOf("/repo/apps/web/src/hooks/useX.tsx")).toBe("hooks");
  });
});

describe("countViolations", () => {
  const results: LintResult[] = [
    {
      filePath: "/r/src/features/chat/A.tsx",
      messages: [msg("shadcn/no-raw-colors"), msg("shadcn/no-raw-colors", 2), msg("other/rule")],
    },
    { filePath: "/r/src/shared/B.tsx", messages: [msg("shadcn/no-inline-styles")] },
    { filePath: "/r/src/C.tsx", messages: [{ ...msg(null, 2), fatal: true, message: "Parse error" }] },
  ];

  it("counts shadcn warnings and errors per area and rule", () => {
    expect(countViolations(results).counts).toEqual({
      "features/chat": { "shadcn/no-raw-colors": 2 },
      shared: { "shadcn/no-inline-styles": 1 },
    });
  });

  it("collects fatal parse errors", () => {
    expect(countViolations(results).fatal).toEqual(["/r/src/C.tsx: Parse error"]);
  });
});

describe("compareCounts", () => {
  const baseline = { "features/chat": { "shadcn/no-raw-colors": 5, "shadcn/no-inline-styles": 1 } };

  it("reports increases, including new areas and rules", () => {
    const current = {
      "features/chat": { "shadcn/no-raw-colors": 6, "shadcn/no-inline-styles": 1 },
      "features/studio": { "shadcn/no-arbitrary-values": 1 },
    };
    expect(compareCounts(current, baseline).increases).toEqual([
      { area: "features/chat", rule: "shadcn/no-raw-colors", baseline: 5, current: 6 },
      { area: "features/studio", rule: "shadcn/no-arbitrary-values", baseline: 0, current: 1 },
    ]);
  });

  it("reports decreases, including rules that reached zero", () => {
    const current = { "features/chat": { "shadcn/no-raw-colors": 3 } };
    const { increases, decreases } = compareCounts(current, baseline);
    expect(increases).toEqual([]);
    expect(decreases).toEqual([
      { area: "features/chat", rule: "shadcn/no-inline-styles", baseline: 1, current: 0 },
      { area: "features/chat", rule: "shadcn/no-raw-colors", baseline: 5, current: 3 },
    ]);
  });
});

describe("sortCounts", () => {
  it("sorts areas and rules and drops zeros and empty areas", () => {
    const sorted = sortCounts({ b: { "r/z": 1, "r/a": 0 }, a: { "r/b": 2, "r/a": 1 }, c: { "r/x": 0 } });
    expect(JSON.stringify(sorted)).toBe('{"a":{"r/a":1,"r/b":2},"b":{"r/z":1}}');
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `bun run --cwd apps/web test scripts/design-lint/baseline.test.ts`
Expected: FAIL — cannot resolve `./baseline`.

- [ ] **Step 4: Implement `baseline.ts`**

```ts
export interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  fatal?: boolean;
}

export interface LintResult {
  filePath: string;
  messages: LintMessage[];
}

/** area → rule → violation count */
export type Counts = Record<string, Record<string, number>>;

export interface CountChange {
  area: string;
  rule: string;
  baseline: number;
  current: number;
}

const RULE_PREFIX = "shadcn/";

export function areaOf(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/src/");
  const parts = (idx === -1 ? normalized : normalized.slice(idx + "/src/".length)).split("/");
  if (parts.length === 1) return "root";
  if (parts[0] === "features" && parts.length > 2) return `features/${parts[1]}`;
  return parts[0];
}

export function countViolations(results: LintResult[]): { counts: Counts; fatal: string[] } {
  const counts: Counts = {};
  const fatal: string[] = [];
  for (const result of results) {
    for (const message of result.messages) {
      if (message.fatal) {
        fatal.push(`${result.filePath}: ${message.message}`);
        continue;
      }
      if (!message.ruleId?.startsWith(RULE_PREFIX)) continue;
      const area = areaOf(result.filePath);
      counts[area] ??= {};
      counts[area][message.ruleId] = (counts[area][message.ruleId] ?? 0) + 1;
    }
  }
  return { counts, fatal };
}

export function compareCounts(
  current: Counts,
  baseline: Counts
): { increases: CountChange[]; decreases: CountChange[] } {
  const increases: CountChange[] = [];
  const decreases: CountChange[] = [];
  const areas = [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort();
  for (const area of areas) {
    const rules = [
      ...new Set([...Object.keys(current[area] ?? {}), ...Object.keys(baseline[area] ?? {})]),
    ].sort();
    for (const rule of rules) {
      const now = current[area]?.[rule] ?? 0;
      const before = baseline[area]?.[rule] ?? 0;
      if (now > before) increases.push({ area, rule, baseline: before, current: now });
      if (now < before) decreases.push({ area, rule, baseline: before, current: now });
    }
  }
  return { increases, decreases };
}

export function sortCounts(counts: Counts): Counts {
  const sorted: Counts = {};
  for (const area of Object.keys(counts).sort()) {
    const rules = Object.keys(counts[area])
      .sort()
      .filter((rule) => counts[area][rule] > 0);
    if (rules.length === 0) continue;
    sorted[area] = Object.fromEntries(rules.map((rule) => [rule, counts[area][rule]]));
  }
  return sorted;
}
```

- [ ] **Step 5: Run tests**

Run: `bun run --cwd apps/web test scripts/design-lint/baseline.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/scripts/design-lint
git commit -m "feat(web): design-lint baseline counting and comparison"
```

### Task 4.3: Baseline CLI and scripts

**Files:** Create `apps/web/scripts/design-lint-baseline.ts`, `apps/web/design-lint-baseline.json`; Modify `apps/web/package.json`, root `package.json`, `biome.json`

- [ ] **Step 1: Write the CLI**

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type CountChange,
  type Counts,
  compareCounts,
  countViolations,
  type LintResult,
  sortCounts,
} from "./design-lint/baseline";

const webRoot = path.resolve(import.meta.dir, "..");
const baselinePath = path.join(webRoot, "design-lint-baseline.json");
const update = process.argv.includes("--update");

const proc = Bun.spawnSync(["bun", "x", "eslint", "src", "--format", "json"], {
  cwd: webRoot,
  stdout: "pipe",
  stderr: "inherit",
});

let results: LintResult[];
try {
  results = JSON.parse(proc.stdout.toString());
} catch {
  console.error("design-lint: could not parse ESLint output");
  console.error(proc.stdout.toString().slice(0, 2000));
  process.exit(2);
}

const { counts, fatal } = countViolations(results);
if (fatal.length > 0) {
  console.error("design-lint: ESLint could not parse some files:");
  for (const line of fatal) console.error(`  ${line}`);
  process.exit(1);
}

const format = (c: CountChange) => `  ${c.area}  ${c.rule}: ${c.baseline} → ${c.current}`;
const hasBaseline = existsSync(baselinePath);
const baseline: Counts = hasBaseline ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
const { increases, decreases } = compareCounts(counts, baseline);

if (hasBaseline && increases.length > 0) {
  console.error("design-lint: design-system violations increased (fix them, don't add new ones):");
  for (const change of increases) console.error(format(change));
  if (update) console.error("design-lint: refusing to update a baseline that would go up.");
  process.exit(1);
}

if (update) {
  writeFileSync(baselinePath, `${JSON.stringify(sortCounts(counts), null, 2)}\n`);
  console.log(`design-lint: baseline ${hasBaseline ? "lowered" : "created"} at ${baselinePath}`);
} else if (decreases.length > 0) {
  console.log("design-lint: violations went down — run `bun run lint:design:update` to lock it in:");
  for (const change of decreases) console.log(format(change));
}

const errors = results.flatMap((r) =>
  r.messages
    .filter((m) => m.severity === 2)
    .map((m) => `  ${path.relative(webRoot, r.filePath)}:${m.line ?? 0}  ${m.ruleId}  ${m.message}`)
);
if (errors.length > 0) {
  console.error(`design-lint: ${errors.length} error(s) in migrated directories:`);
  for (const line of errors) console.error(line);
  process.exit(1);
}

console.log("design-lint: OK");
```

- [ ] **Step 2: Add scripts.** `apps/web/package.json` `scripts`:

```json
    "lint:design": "bun run scripts/design-lint-baseline.ts",
    "lint:design:update": "bun run scripts/design-lint-baseline.ts --update",
```

Root `package.json` `scripts` (next to `lint`):

```json
    "lint:design": "bun run --cwd apps/web lint:design",
    "lint:design:update": "bun run --cwd apps/web lint:design:update",
```

- [ ] **Step 3: Keep Biome off the generated baseline.** In `biome.json` `files.includes`, add `"!apps/web/design-lint-baseline.json"` after `"!apps/web/src/convex-generated-dataModel.d.ts"`.

- [ ] **Step 4: Create the baseline**

Run: `bun run lint:design:update`
Expected: `design-lint: baseline created at …/design-lint-baseline.json`. The file lists counts per `features/*`, `shared`, `root`, etc.

- [ ] **Step 5: Prove the ratchet.** Add `<div className="bg-pink-500" />` inside any JSX return in `apps/web/src/features/legal/components/PrivacyPolicy.tsx`, then run `bun run lint:design`.
Expected: exit 1 with `features/legal  shadcn/no-raw-colors: N → N+1`. Revert: `git checkout -- apps/web/src/features/legal/components/PrivacyPolicy.tsx`. Run `bun run lint:design` again → `design-lint: OK`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/scripts/design-lint-baseline.ts apps/web/design-lint-baseline.json apps/web/package.json package.json biome.json
git commit -m "feat(web): design-lint ratchet with committed baseline"
```

### Task 4.4: Wire into CI, pre-push, and agent docs

**Files:** Modify `.github/workflows/ci.yml`, `.githooks/pre-push`, `CLAUDE.md`

- [ ] **Step 1: CI.** In `.github/workflows/ci.yml`, in the `lint` job, add after the `Biome check` step (same job, so no new required check is needed):

```yaml
      - name: Design-system lint (shadcn/lint ratchet)
        run: bun run lint:design
```

- [ ] **Step 2: Pre-push.** In `.githooks/pre-push`, after `bun run lint -- --diagnostic-level=error`, add:

```sh
bun run lint:design
```

and update the echo line to `echo "pre-push: typecheck + lint + design-lint  (bypass: git push --no-verify)"`.

- [ ] **Step 3: CLAUDE.md.** Under `## Gotchas`, add:

```markdown
- **Design system (shadcn):** UI primitives live in `apps/web/src/shared/components/ui` (add via `bunx --bun shadcn@latest add`, from `apps/web`). Pages place components (layout classes only); new looks are new `cva` variants. Use semantic tokens (`bg-success-muted`, `text-info`, `border-destructive-border`), never palette colors or `--vintage-*` (those are persisted cover swatches only — see `shared/notebook/coverColor.ts`). Motion: `tw-animate-css` utilities with `duration-120/200/320/500` + `ease-out`, or `m.*` primitives from `@/shared/components/motion` (never `motion.*`; `LazyMotion strict`). Rules: `.agents/skills/shadcn/SKILL.md`.
- **Design lint ratchet:** `bun run lint:design` runs `@shadcn/lint` (ESLint, `apps/web/eslint.config.mjs`) and fails if counts in `apps/web/design-lint-baseline.json` go up; after cleanup run `bun run lint:design:update`. Migrated dirs are listed in `MIGRATED` in the config and are errors.
```

- [ ] **Step 4: Validate the workflow**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7` (or rely on the CI `workflow-lint` job if Docker isn't available).
Expected: no findings.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .githooks/pre-push CLAUDE.md
git commit -m "ci: run design-system lint ratchet in CI and pre-push"
```

### Task 4.5: Phase 4 verification and PR

- [ ] Invoke `superpowers:verification-before-completion`; run typecheck (web + convex), `lint`, `lint:design`, `test:web`.
- [ ] `gh pr create --title "feat(web): enforce design system with shadcn/lint"`, including the initial baseline totals per area in the body.

---

## After this plan: feature migrations

Each migration is its own issue, plan and PR, written against the real `lint:design` output once Phase 4 lands. Order: `shared` (rest) → `auth` + `onboarding` → `notebooks` → `chat` → `studio` → `sources` → `billing` → `legal`. Each PR:

1. Replaces native `<button>`/`<input>`/overlays/toasts/pulses with the Phase 3 components and fixes the linter-invisible rules (`gap-*`, `size-*`, `cn()`, `data-icon`, no manual z-index).
2. Adds the directory to `MIGRATED` in `apps/web/eslint.config.mjs`.
3. Runs `bun run lint:design:update` so the baseline drops.
4. Attaches Playwright before/after screenshots (light + dark).
