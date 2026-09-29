# Design System Foundation — Design Spec

**Date:** 2026-09-28
**Status:** Approved 2026-09-28. Implementation plan: `docs/superpowers/plans/2026-09-28-design-system-foundation.md`
(its "Deviations from the spec" section supersedes this spec where they differ: keyed route fade
instead of `viewTransition`, cover-swatch `--vintage-*` tokens retained, tab indicator deferred).
**Scope:** `apps/web` (the mobile app is a WebView shell, so it inherits these changes)

## Goal

Make SolomindLM feel premium ahead of the App Store launch by (1) establishing one coherent
design system built on real shadcn/ui components, (2) adding a consistent, performant motion
system, and (3) enforcing both mechanically with `@shadcn/lint` so AI agents and humans can't
drift off-system again.

This is sub-project 1 of 5. Follow-ups, each with its own spec: design-system lint cleanup per
feature (rolled into the rollout below), premium landing page, in-app signature moments, native
mobile shell polish (splash → WebView handoff, haptics).

## Decisions

| Question | Decision |
|---|---|
| First sub-project | Foundation (tokens, components, motion, lint) |
| Enforcement | Ratchet: lint is error in migrated dirs, warn elsewhere, CI baseline can only go down |
| Visual direction | Refined editorial — keep warm paper + serif identity, tighten it |
| Motion stack | CSS-first (`tw-animate-css`, View Transitions) + lazy `motion/react` for signature moments |
| Linter host | ESLint 9 flat config running only `@shadcn/lint`; Biome stays primary |

## Audit baseline (2026-09-28, 192 `.tsx` files in `apps/web/src`)

| shadcn rule | Violations |
|---|---|
| Use `<Button>`, not native `<button>` | 449 native vs 21 `<Button>` (11 files import it) |
| Semantic tokens, no raw palette colors | 229 raw + 165 `--vintage-*` usages |
| No manual `dark:` color overrides | 149 |
| `gap-*`, not `space-x/y-*` | 262 |
| No arbitrary values | 468 |
| No manual z-index | 141 |
| Overlays via Dialog/Sheet/Popover | 35 files with hand-built `fixed inset-0` |
| `cn()`, not template-literal classNames | 191 template literals vs 44 `cn()` |
| No icon sizing inside components | 315 |
| Toast via `sonner`, loading via `Skeleton` | Custom `ToastContainer` (70 uses), 32 custom `animate-pulse` |

**Bug found:** 89 `animate-in` / `fade-in` / `zoom-in-95` usages are no-ops — `tw-animate-css`
is not installed and no CSS defines those utilities.

Project config is already correct: Vite, Tailwind v4, `radix` base, `new-york` style, lucide,
`src/index.css`. Only 5 components installed (`button`, `dialog`, `label`, `tabs`, `textarea`),
and `button.tsx` is not built on `cva`.

## 1. Tokens — refined editorial

All in `apps/web/src/index.css` (`:root`, `.dark`, `@theme inline`).

- **Keep:** warm paper background, `Libre Baskerville` display, `Lora` reading serif, `Inter` UI,
  `IBM Plex Mono`.
- **Status tokens:** add `--info`. For each of `success`, `warning`, `info`, `destructive` define
  `-foreground`, `-muted` (subtle bg) and `-border`, in both light and dark. Expose via `@theme`.
- **Retire `--vintage-*`:** green → success, red → destructive, blue → info, amber/orange →
  warning, brown → primary/muted. Remove the variables once usages hit zero.
- **Elevation:** replace the offset-shadow set with soft layered shadows (ambient + key) for
  `xs`, `sm`, `md`, `lg`, `xl`. Surface levels: `background` < `card` < `popover` < elevated.
- **Contrast:** raise `--foreground` / `--muted-foreground` contrast on paper to meet WCAG AA
  (4.5:1 body, 3:1 large text) in both themes.
- **Radius:** single `--radius`; `sm/md/lg/xl` derived from it.
- **Dark mode:** handled by tokens only; `dark:` overrides are removed as features migrate.

## 2. Component layer

Location: `@/shared/components/ui` (from `components.json`).

- **Button:** rebuild on `cva` via `bunx --bun shadcn@latest add button --diff`, preserving the
  current lift/press feel inside variants. Loading = `Spinner` + `disabled`, no `isLoading` prop.
- **Add (via CLI, reviewed after add):** `card`, `badge`, `input`, `field`, `input-group`,
  `select`, `dropdown-menu`, `popover`, `sheet`, `alert-dialog`, `tooltip`, `skeleton`,
  `spinner`, `sonner`, `empty`, `alert`, `separator`, `scroll-area`, `toggle-group`, `avatar`.
  Anything else is added only when a migration PR needs it.
- **Toasts:** mount `<Toaster />` from `sonner`; reimplement the existing `useToast` API as a thin
  adapter over `toast()` so the 70 call sites keep working. `ToastContainer` is deleted.
- **Contract:** pages place components (layout: margin, width, flex/grid, visibility). Components
  own color, spacing, typography, shape, effects and motion. New looks = new variants, not
  `className` overrides.

## 3. Motion system

- **`tw-animate-css`:** add to `apps/web` and `@import` in `index.css`. Fixes the 89 no-op classes.
- **Tokens (`@theme`):** `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`,
  `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`; durations `--duration-fast: 120ms`,
  `--duration-base: 200ms`, `--duration-slow: 320ms`, `--duration-slower: 500ms`.
  Component animations use these, never ad-hoc values.
- **Route transitions:** React Router 7 `viewTransition` on navigations + `::view-transition-*`
  CSS (short crossfade + small upward slide). Unsupported browsers fall back to instant.
- **`motion/react`, lazy:** `LazyMotion` with async-loaded `domAnimation` features. Shared
  primitives in `@/shared/components/motion/`:
  - `Reveal` — fade/slide in on mount or on entering viewport
  - `Stagger` — staggered children reveal
  - `PresenceList` — enter/exit for list items (notebooks, sources, messages)
  - animated tab indicator (layout animation) used by `tabs`
- **Performance:** animate `transform` and `opacity` only; no animating layout properties.
- **Reduced motion:** global `@media (prefers-reduced-motion: reduce)` collapses durations;
  `MotionConfig reducedMotion="user"` at the app root.

## 4. Lint ratchet

- **Deps (`apps/web` devDependencies):** `@shadcn/lint`, `eslint` (≥ 9.30), `@typescript-eslint/parser`.
- **Config:** `apps/web/eslint.config.mjs` enabling only the six `@shadcn/lint` rules
  (`no-restyle`, `no-raw-colors`, `no-arbitrary-values`, `no-inline-styles`,
  `no-unknown-classes`, `require-static-classes`) on `src/**/*.tsx`.
  - `settings.shadcn`: `ui: "@/shared/components/ui"`, `mergeFunctions: ["cn"]`,
    `variantFunctions: ["cva"]`, `note` pointing to `.agents/skills/shadcn/SKILL.md`.
  - Severity: `error` for `src/shared/**` and each migrated feature dir (explicit list in the
    config); `warn` everywhere else.
  - Per-component `contracts` are added as components are adopted (e.g. `CardTitle` may change
    size but not weight/family).
- **Baseline:** `apps/web/scripts/design-lint-baseline.ts` runs ESLint with JSON output, counts
  violations per rule per feature dir, and compares against `apps/web/design-lint-baseline.json`.
  Fails if any count increases; `--update` rewrites the baseline (only allowed to go down).
  Unit-tested with vitest (deterministic logic).
- **Wiring:** new `lint:design` script; included in root `bun run lint`, the pre-push hook and CI.
- **Rules the linter can't see** (`gap` over `space-*`, `size-*`, `cn()`, `data-icon`, no manual
  z-index, full Card/Dialog composition): CLAUDE.md links to the shadcn skill rule files; code
  review enforces them during migration PRs.
- **Known limits:** plain CSS / `@apply` isn't checked; a newly added theme token is "on-system"
  by definition — token and variant additions need human review.

## 5. Rollout (one PR per issue)

1. **Motion fix** — `tw-animate-css`, motion tokens, reduced-motion.
2. **Tokens** — status tokens, retire `--vintage-*`, elevation and contrast.
3. **Component layer** — `cva` Button, core components, `sonner` adapter.
4. **Lint + ratchet** — config, baseline script + tests, CI wiring; `error` on `src/shared/**`.
5. **Feature migrations**, in order: `auth` + `onboarding` → `notebooks` → `chat` → `studio` →
   `sources` → `billing` → `legal`. Each PR flips that dir to `error` and lowers the baseline.
   `landing` is migrated as part of the separate landing-page redesign.

## Testing

- Every PR: `typecheck:web`, `lint` (Biome + design lint + baseline), `test:web`.
- Baseline script: vitest unit tests.
- Migration PRs: Playwright before/after screenshots of affected routes, light and dark.
- Motion: manual check in iOS simulator WebView and Android emulator for View Transitions,
  reduced-motion, and 60fps on list/stagger animations.

## Out of scope

Landing page redesign, in-app signature moments (streaming chat, studio generation), native
mobile shell polish — each gets its own spec after this foundation lands.
