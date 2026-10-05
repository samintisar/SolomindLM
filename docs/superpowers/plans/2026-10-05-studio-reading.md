# Studio Reading Views (PR 6 of #264, closes #171) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four reading views reach 0 design-lint findings and join `MIGRATED`. Mind maps open at a readable size (#171), reports and notes read in the house `.prose`, and infographics fade in.

**Spec:** `docs/superpowers/specs/2026-10-04-studio-redesign-design.md` §6. The rules are in `.agents/skills/shadcn/SKILL.md` and `docs/design/principles.md`.

**Working directory:** worktree `.worktrees/studio`, branch `feature/studio-reading`, based on `origin/main` after PR 5 (#365).
- **One web test file:** `bun run test <path>`, from `apps/web`.
- **Typecheck:** `bun run typecheck:web`, from the root.
- **One file's design lint:** `bunx eslint --max-warnings 0 <file>`, from `apps/web`.
- **Never kill processes by name.** Don't use browser tools: the browser pane is shared with the user.

**Findings today (37):**
- `UserNoteView` has 32: about 30 dead `prose-*:` variants, `prose-sm`, `dark:prose-invert` and `active:scale-[0.97]`.
- `ReportView` has 3: `prose-stone`, `dark:prose-invert` and `active:scale-[0.97]`.
- `InfographicView` has 3: the hand-rolled `border-2 border-primary/30 border-t-primary` spinner.
- `MindMapView` has 0. It's in scope for #171, and its theme hard-codes hex colours, so the canvas stays white in dark mode.

**Contracts that must keep working:**
- **The mobile back button** is named "Back to Studio" (`e2e/helpers/navigation.ts:49`).
- **The props of all four views** stay the same. They're mounted from `ActiveNoteView.tsx`.
- **`InfographicViewControls`** (`download`, `toggleFullscreen`) and `registerControls`/`onFullscreenChange`: `StudioPanel` and `StudioPanelHeader` own the Download and Fullscreen buttons. Keep this contract.
- **`ReportView`'s Markdown overrides** drop images, video, audio and iframes, and render links as plain text (generated reports must not link out). Keep them. Only the table overrides go: the house `.prose table` styles tables.

**Mind Elixir facts** (the installed version is 5.6.1; check them in `node_modules/mind-elixir/dist/types`):
- Options include `scaleMin` and `scaleMax`. The defaults are 0.2 and 1.4.
- `mind.scale(v)` ignores a value beyond the limits when it moves further out.
- `mind.scaleFit()` ignores `scaleMin`. That is why a large map opened at 3% (#171).
- `mind.toCenter()` centres the map.
- `mind.bus.addListener("scale", (s) => …)` fires on every zoom, including the wheel. It replaces today's 100 ms polling `setInterval`.
- A node object with `expanded: false` starts collapsed.
- `theme.cssVar` values are set as CSS custom properties on the map, so `var(--card)` and other app tokens work there, and dark mode follows the app.

---

### Task 1: Mind map viewport helpers (pure, TDD)

**Files:**
- Create: `apps/web/src/features/studio/components/mindmap/mindMapViewport.ts`
- Test: `apps/web/src/features/studio/components/mindmap/mindMapViewport.test.ts`

```ts
export const MIN_READABLE_SCALE = 0.6; // opening zoom never goes below this (#171)
export const SCALE_MIN = 0.2;          // zoom-out floor for the buttons, the wheel and fit
export const SCALE_MAX = 2;
export const COLLAPSE_ABOVE_NODES = 40;

export interface MindNode { id: string; topic: string; children: MindNode[]; expanded?: boolean; [key: string]: unknown }

/** Moved from MindMapView unchanged in behaviour: fills in missing ids/topics, recursively. */
export function sanitizeNodeTree(node: unknown, fallbackTopic: string, isRoot?: boolean): MindNode;
/** All nodes, the root included. */
export function countNodes(root: MindNode): number;
/**
 * Above COLLAPSE_ABOVE_NODES, returns a copy whose root children that have children of their own
 * are marked `expanded: false`, so the map opens showing the root and its children only.
 * Otherwise returns the input unchanged (same reference). Never mutates.
 */
export function collapseLargeTree(root: MindNode): MindNode;
/** The zoom to open at: the fitted zoom, but never below MIN_READABLE_SCALE nor above 1. */
export function openingScale(fitScale: number): number;
/** Fit for the Fit button: the fitted zoom clamped to [SCALE_MIN, 1]. */
export function fitScale(fitScaleValue: number): number;
/** One zoom step: ×1.25 in, ÷1.25 out, clamped to [SCALE_MIN, SCALE_MAX], rounded to 2 decimals. */
export function stepScale(current: number, direction: "in" | "out"): number;
```

**Implementation note:**
- `sanitizeNodeTree` today uses `Math.random()` ids. Keep that behaviour; the tests only check that missing ids become non-empty strings.
- Type it with `unknown` input and the `MindNode` output. That removes the existing `any`s.

- [ ] **Step 1: Write the failing tests.** Cover:
  - `countNodes`;
  - `collapseLargeTree`:
    - with 40 nodes it returns the same reference;
    - with 41 or more, the root's children that have children are marked collapsed, leaf children aren't, and grandchildren aren't touched;
    - the input isn't mutated (freeze it);
  - `openingScale` at 0.03 → 0.6, at 0.8 → 0.8 and at 1.5 → 1;
  - `fitScale` at 0.03 → 0.2 and at 3 → 1;
  - `stepScale`, in and out, including the clamps at both ends;
  - `sanitizeNodeTree`: a non-object root becomes the fallback topic with id `"root"`; blank topics become "Untitled"; children are recursed.
- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass.**
- [ ] **Step 5: Commit.** `feat(studio): mind map viewport rules: readable opening zoom, collapse large maps (#171)`

---

### Task 2: `MindMapView` on the design system

**Files:**
- Modify: `apps/web/src/features/studio/components/views/MindMapView.tsx`
- Test: `apps/web/src/features/studio/components/views/MindMapView.test.tsx` (new). Mock `mind-elixir` with `vi.mock` as a constructor that records its options and exposes `init`, `scale`, `scaleFit`, `toCenter`, `scaleVal`, `bus.addListener`, `bus.removeListener` and `destroy?`.

**Opening (#171):**
1. `init({ nodeData: collapseLargeTree(sanitizeNodeTree(...)) })`.
2. In a `requestAnimationFrame`, call `scaleFit()`, read `mind.scaleVal`, and compute `openingScale(fitted)`.
3. If that differs from the fitted value, call `toCenter()` and then `scale(opening)`.
4. Set the displayed percentage from the result.

**Zoom:**
- Pass `scaleMin: SCALE_MIN` and `scaleMax: SCALE_MAX` in the options.
- Subscribe to `mind.bus.addListener("scale", setScale)`, and remove the listener on cleanup.
- Delete the `setInterval` polling and the `_cleanupSelection` expando.

**Controls:**
- **Zoom group:** a `ButtonGroup`, from `@/shared/components/ui/button-group` (check its variants; PR 3 used `variant="tray"`), holding three `Button variant="ghost" size="icon-sm"`:
  - **Zoom out** (`ZoomOut`, aria-label "Zoom out"): `mind.scale(stepScale(scale, "out"))`.
  - **Fit** (`Scan` or `Maximize` from lucide, aria-label "Fit to view"): `scaleFit()`, then, if `fitScale(scaleVal)` differs, `toCenter()` and `scale(fitScale(…))`.
  - **Zoom in** (`ZoomIn`, aria-label "Zoom in").
- **Percentage:** a `font-sans text-xs tabular-nums text-muted-foreground` label next to the group, with an `aria-live="polite"` region (or `role="status"`) reading e.g. "60%".
- **Full screen:** a `Button variant="ghost" size="icon-sm"`, aria-label "Expand to full screen" or "Exit full screen", that calls `onToggleExpanded`.
  - In expanded mode the floating duplicate control cluster (top-right) goes away. The one toolbar stays visible in both modes, since the bar is part of the expanded layout.
- **Mobile back:** a `Button variant="ghost" size="icon-sm" aria-label="Back to Studio"`, shown when `onBack && !isExpanded`.
- **The toolbar:** `flex items-center justify-between gap-2 px-3 py-2` on a soft surface, `bg-surface-raised` or the panel's existing header token. No `border-b`: separate it with fill or a `shadow-xs`, per the soft-surfaces rule.

**Theme:** replace the hex palette and `cssVar` with app tokens, so the canvas follows light and dark.
- `"--main-color": "var(--foreground)"`, `"--main-bgcolor": "var(--card)"`, `"--color": "var(--foreground)"`, `"--bgcolor": "var(--card)"`, `"--panel-color": "var(--foreground)"`, `"--panel-bgcolor": "var(--background)"` and `"--panel-border-color": "var(--border)"`.
- Keep the radii. The 12px, 8px and 8px are strings in a JS object, not classes, so the lint doesn't apply, but use `"var(--radius)"`-based values where a token fits.
- `palette` (the branch line colours): use the Studio mind-map token, if one exists (`grep -n "studio-mindmap\|--studio-" apps/web/src/index.css`), as `var(--studio-mindmap)`, plus `var(--muted-foreground)`. If Mind Elixir needs real colours for SVG strokes, check that a `var()` works as an SVG `stroke` attribute. If not, read the computed values with `getComputedStyle(document.documentElement)` at init time.

**States:**
- **Failed:** the `Alert variant="destructive"` primitive (title "Mind map generation failed", with the same message extraction), plus `Empty`.
- **No data:** `Empty` with the title "No mind map data available".
- **Tip line:** keep "Drag to pan, use the controls or Ctrl + scroll to zoom." as `px-4 py-2 font-sans text-xs text-muted-foreground`, without a border.
- **Entrance:** keep `animate-in fade-in slide-in-from-right-4 duration-300 ease-out`.

- [ ] **Step 1: Write the failing tests.** Cover:
  - the options passed include `scaleMin` 0.2, `scaleMax` 2, and theme `cssVar` values that start with `var(`;
  - with a fitted `scaleVal` of 0.03 after `scaleFit`, the view calls `scale(0.6)` and shows "60%" (flush `requestAnimationFrame` with fake timers or `vi.spyOn(window, "requestAnimationFrame")`);
  - with a 41-node tree, `init` gets root children with `expanded: false`;
  - the zoom buttons call `scale` with the stepped values;
  - Fit calls `scaleFit`;
  - a `scale` bus event updates the percentage;
  - unmount removes the listener;
  - failed → the alert; no data → the empty state;
  - the back button is named "Back to Studio".
- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass**, then `bunx eslint --max-warnings 0 src/features/studio/components/views/MindMapView.tsx src/features/studio/components/mindmap`.
- [ ] **Step 5: Commit.** `feat(studio): mind maps open at a readable zoom with fit and zoom controls, and follow the theme (#171)`

---

### Task 3: `ReportView` and `UserNoteView` read in the house prose

**Files:**
- Modify: `apps/web/src/features/studio/components/views/ReportView.tsx` and `UserNoteView.tsx`
- Test: `apps/web/src/features/studio/components/views/ReadingViews.test.tsx` (new). Cover both views; mock `@/shared/components/MarkdownRenderer` as a component that renders its children and `className`, so `lazy` resolves under `Suspense`.

**Both views:**
- **The body** is the house `.prose`, centred: `prose mx-auto font-serif select-text`. `.prose` already sets `max-width: 65ch`, which is the comfortable reading width; don't override it with `max-w-none`.
- **No dead classes:** none of `prose-*`, `dark:prose-*` or `[&_…]`.
- **Fade in on open:** the content wrapper gets `animate-in fade-in duration-300 ease-out`. (`ReportView`'s outer `slide-in-from-right-4` stays, matching the other views.)
- **Mobile back button:** a `Button variant="ghost" size="icon-sm" aria-label="Back to Studio"` in a sticky `md:hidden` bar, with no border (`bg-background/80 backdrop-blur-sm`).
  - `UserNoteView`'s bar is `absolute` today, with a `pt-16` offset; make it sticky like `ReportView`'s and drop the offset.
- **Loading fallback:** the `Skeleton` primitive (`h-4 w-full`, three lines) instead of the pulsing div or the "Loading..." text.

**`ReportView`:**
- **Failed:** the `Alert variant="destructive"` primitive, with the same message extraction.
- **Empty:** `Empty` ("No content available"); failed with no content → `Empty` with `XCircle` and "Report generation failed".
- **Overrides:** keep `img`, `video`, `audio` and `iframe` → `null`, and `a` → `<span>`. Remove the `table`, `thead`, `tbody`, `tr`, `th` and `td` overrides; the house `.prose table` styles tables.
- **Outer body:** the `bg-card border-t` becomes `bg-card` with no border, and the scroll container keeps `overflow-y-auto` if the parent relies on it. Check: today the body is `flex-1` without overflow. Keep whatever scrolls today.

**`UserNoteView`:**
- **Empty:** `Empty`, with a `FileText` icon and the title "Empty note".

- [ ] **Step 1: Write the failing tests.** Cover:
  - a report renders its Markdown inside an element with class `prose`;
  - a link renders as plain text with no `<a>`;
  - an image doesn't render;
  - failed → an alert with the error message;
  - an empty report → "No content available";
  - a user note renders in `.prose`, and an empty user note → "Empty note";
  - with `onBack`, the "Back to Studio" button calls it.
- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass**, plus `bunx eslint --max-warnings 0` on both files.
- [ ] **Step 5: Commit.** `feat(studio): reports and notes read in the house prose at a comfortable width`

---

### Task 4: `InfographicView`

**Files:**
- Modify: `apps/web/src/features/studio/components/views/InfographicView.tsx`
- Test: `apps/web/src/features/studio/components/views/InfographicView.test.tsx` (new)

**Changes:**
- **Generating:** the `Spinner` primitive (`@/shared/components/ui/spinner`) with "Generating your infographic…" and `currentStep`, instead of the bordered spinner.
- **Failed or image error:** `Empty` ("Infographic unavailable", with the error as `EmptyDescription` if that part exists).
- **The image fades in from a blur once loaded:**
  - The `<img>` starts with `opacity-0 blur-md scale-[...]`. No arbitrary values: use `blur-md opacity-0`, plus `scale-105` if you want a settle.
  - Add `transition duration-700 ease-out`.
  - On `onLoad`, set `loaded` and switch to `opacity-100 blur-none scale-100`.
  - Under reduced motion: `motion-reduce:blur-none motion-reduce:scale-100`, so only the opacity fades.
  - Until loaded, show a `Skeleton` that fills the frame behind the image.
- **Image frame:** `bg-black` becomes a token, e.g. `bg-muted`. Keep `rounded-xl overflow-hidden shadow-…` within the soft-surface rules: use the `shadow-md` scale or the card token, and no `shadow-2xl` unless lint allows it.
- **Full screen:** `fixed inset-0 z-50` for full screen stays, as layout.
- **Download and Fullscreen stay in `StudioPanelHeader`,** through `registerControls`. The spec's "zoom and download controls use `Button`" is already true there, and this view has no zoom; say so in the report.
- **Title:** `font-display`, not `font-serif font-bold`, per CLAUDE.md typography.

- [ ] **Step 1: Write the failing tests.** Cover:
  - generating → status text and a spinner (`role="status"` if the primitive has it);
  - failed → "Infographic unavailable" with the error;
  - before `load`, the image has `opacity-0`; after `fireEvent.load`, `opacity-100`;
  - an image error → the unavailable state;
  - `registerControls` is called with `download` and `toggleFullscreen` when completed, and with `null` when failed.
- [ ] **Step 2: Run them to make sure they fail. Step 3: Implement. Step 4: Run them until they pass**, plus eslint at `--max-warnings 0`.
- [ ] **Step 5: Commit.** `feat(studio): infographics fade in from a blur and use the design system's spinner and empty state`

---

### Task 5: `MIGRATED`, baseline and gates (controller)

- Add `ReportView.tsx`, `UserNoteView.tsx`, `MindMapView.tsx`, `InfographicView.tsx` and `src/features/studio/components/mindmap/**/*.tsx` to `MIGRATED` in `apps/web/eslint.config.mjs`.
- Run `bun run lint:design:update`, and check that the baseline diff only lowers counts (37 fewer).
- Gates:
  - `bun run typecheck:web`;
  - `bun run lint`, `bun run lint:design` and `bun run knip`;
  - `bun run test:web`;
  - `bunx playwright test --list`.
- PR: `Closes #171` and `Part of #264`.
- **Not checked by eye:** KaTeX, tables and code blocks in a real report; a real large mind map. These need the dev app; ask the user.
