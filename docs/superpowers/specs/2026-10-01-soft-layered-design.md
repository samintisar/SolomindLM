# Soft layered design principles

**Status:** approved direction (2026-10-01). Option A of three mockups (soft layered / editorial ruled / tactile).
**Scope:** the whole web front end. The look lives in `apps/web/src/shared/components/ui`, so every migrated screen (auth, onboarding, notebooks home, chat) picks it up; unmigrated screens adopt it when their area migrates (#261 sources, #262 shared, #263 landing, #264 studio).
**Why:** after the shadcn migration the UI read as too plain and boxed in. Outline buttons carried a 2px border, cards and the composer were outlined, and dropdown options had nothing distinguishing one from the next.

## 1. Principles

1. **No outlines on controls.** Buttons, fields, toggles and menus separate from their surroundings by fill tone and shadow, never by a visible border. A hairline (`border-border/50` or `ring-border/50`) is allowed only where content meets content: list rows, table cells, a card edge on the paper background.
2. **Elevation ladder.** Each layer has one treatment:

   | Layer | Used by | Treatment |
   |---|---|---|
   | Page | app background | `bg-background` (paper) |
   | In-flow surface | cards, list rows, fields | `bg-card` + `shadow-xs` + 1px hairline ring at 50% |
   | Raised | composer, hovered interactive card, tray | `bg-card` + `shadow-md`…`shadow-lg`, no border |
   | Floating | dropdown, select, popover, tooltip | `bg-popover` + `shadow-xl` + hairline ring at 50% |
   | Modal | dialog, alert dialog, sheet | `bg-card` + `shadow-xl`, warm overlay `bg-foreground/25` + `backdrop-blur-xs` |

3. **Hierarchy through fill.** One solid primary action per view (`default` button, brown). Secondary actions use a tinted fill (`secondary`). Icon actions are `ghost`. Related icon actions sit in a **tray**: a `bg-secondary` segmented pill, with the active or open item raised to `bg-card shadow-xs`.
4. **Soft, larger radii.** Controls `rounded-xl`; cards, menus, popovers and dialogs `rounded-2xl`; menu items and tray segments `rounded-lg`.
5. **Rich, distinct menu items.** Items are tall (min 36px), pill-highlighted on hover/focus (`bg-muted`), and the checked item holds a tinted pill (`bg-accent/60`) plus a check. Menus that choose between modes or models use an icon tile and a one-line description per item.
6. **Dark mode.** Same model; because shadows disappear on dark paper, every elevated surface also carries a faint light ring (`dark:ring-foreground/8`).
7. **Type rule unchanged.** Content in the serif body face (Lora; headings `font-display`), controls in sans.

### Never do (enforced, see §3)

- `border-2`/`border-4`/`border-8` (any side) in feature code
- `border-input`, `border-foreground`, `border-black`, `border-primary` as a resting border on a control in feature code
- hand-rolled shadows (`shadow-[…]`) or `bg-black/…` overlays
- a bordered `<button>` in feature code (use a `Button` variant)
- restyling a ui component's look at the call site (already `shadcn/no-restyle`)

## 2. Component changes (shared variants)

All in `apps/web/src/shared/components/ui`. Variant names stay the same so call sites don't change.

- **`button.tsx`**
  - `outline` → soft surface: `bg-card shadow-xs ring-1 ring-border/50 hover:bg-muted active:scale-98 aria-expanded:bg-accent/60`. No `border-2`.
  - `secondary` → keeps the tinted fill, with `hover:bg-secondary/70`.
  - `ghost` and `ghost-*` unchanged apart from radius consistency.
- **`button-group.tsx`**: new `variant="tray"` → `rounded-xl bg-secondary p-0.5 gap-0.5`. Ghost children render `rounded-lg`; a child with `aria-expanded="true"` or `aria-pressed="true"` gets `bg-card shadow-xs`.
- **`dropdown-menu.tsx`, `select.tsx` (content and items)**
  - Panel: `rounded-xl p-1.5 shadow-xl ring-1 ring-border/50`, no `border`.
  - Item: `rounded-lg px-2.5 py-2 min-h-9 gap-2.5 focus:bg-muted`. Radio and checkbox items that are checked: `data-[state=checked]:bg-accent/60`. The indicator is a trailing check, not a leading dot.
  - Label: `px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground`. Separator: `my-1.5 bg-border/60`.
  - New parts:
    - `DropdownMenuItemIcon`: a `size-7 rounded-lg bg-secondary` tile; checked → `bg-primary text-primary-foreground`.
    - `DropdownMenuItemText` (title + description stack) and `DropdownMenuItemDescription` (`text-xs text-muted-foreground`).
- **`popover.tsx`**: `rounded-2xl shadow-xl ring-1 ring-border/50`, no `border`; the `padding` variant is kept.
- **`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`**: no `border`, `rounded-2xl` (sheets keep square edges on their attached side), `shadow-xl`, overlay `bg-foreground/25` + `backdrop-blur-xs`.
- **`card.tsx`**: base `ring-1 ring-border/50 shadow-xs`, no `border`. `interactive` lifts to `shadow-md` on hover. `rounded-2xl`.
- **`input.tsx`, `textarea.tsx`, `select.tsx` trigger**: soft field `bg-muted/40 ring-1 ring-border/50 shadow-none` with no `border`. Focus: `ring-2 ring-ring/40 bg-card`.
- **`input-group.tsx`**
  - The base field follows the soft-field rule.
  - The `composer` variant drops the border: `ring-1 ring-border/40 shadow-lg`.
- **`toggle.tsx` / `toggle-group.tsx` `outline`**: soft surface like button `outline`. `badge.tsx` `outline` → `bg-card ring-1 ring-border/50` with no border.
- **`tabs.tsx`**: already soft; the active trigger gets `shadow-xs`. No other change.
- **`tooltip.tsx`**: unchanged.

### Feature call sites

- **Chat mode menu (`composer/ModeMenu.tsx`):** icon tile and description per item. The copy lives in `composer/constants.ts`:
  - Chat: "Answers from your sources"
  - Deep research: "Multi-step web research"
  - Literature review: "Find and screen papers"
- **Model menu and chat options menu:** icon tiles, no descriptions.
- **Chat header:** history, new chat and options become one `ButtonGroup variant="tray"` of ghost icon buttons. The panel toggles stay outside it.
- **Notebooks home header:** its split button is unchanged; the grid/list toggle adopts the soft toggle.
- Any feature className that now fights the new look (e.g. leftover `border` on a `<button>`) is fixed when the lint rule (§3) flags it.

## 3. Enforcement

### 3a. Primitives own the look
Already true via `shadcn/no-restyle` (layout-only classes at call sites). No change.

### 3b. Lint rule `solomind/soft-surfaces`
- **Where:** a local ESLint plugin at `apps/web/scripts/design-lint/soft-surfaces-rule.mjs`, registered in `apps/web/eslint.config.mjs` and counted by the existing ratchet (`bun run lint:design`, baseline JSON). It runs at `warn` everywhere and `error` in `MIGRATED`.
- **What it checks:** static class strings in `className`, `cn(...)` and `cva(...)` arguments.
- **What it flags:**
  - `border(-[xytrbl])?-(2|4|8)`
  - `border-(input|foreground|black|primary)` when it isn't behind a `focus`/`focus-visible`/`aria-invalid`/`data-[state` variant
  - `shadow-[…]`
  - `bg-black/` or `bg-white/`
  - `border` or `border-*` on an intrinsic `<button>`
- **Exemptions:** `src/shared/components/ui/**`, where primitives may need a border, e.g. a `ring`-based focus state. Any exception there must be a reviewed variant.
- **Tests:** `apps/web/scripts/design-lint/soft-surfaces-rule.test.ts` uses ESLint's `RuleTester` (vitest), with valid and invalid cases for each pattern.
- **Error message:** "Soft layered design: separate with fill and shadow, not borders. Use a ui variant (see docs/design/principles.md)."

### 3c. Written rules where agents and people look
- **`docs/design/principles.md`:** a one-page version of §1 plus the "never do" list, linked from:
  - the CLAUDE.md design-system note (one line: "Look: soft layered — fill and shadow, not outlines; see docs/design/principles.md");
  - `.agents/skills/shadcn/SKILL.md` (a short "House style" section at the top);
  - `.github/pull-request-template.md`.
- **PR template checklist:** for UI changes, attach screenshots in light, dark and phone width (390px), plus "no new `solomind/soft-surfaces` warnings".

### 3d. Gallery and screenshot tests (phase 2, after the new look lands)
- **Gallery page** (`/dev/design`)
  - `apps/web/src/dev/DesignGallery.tsx` renders every ui primitive and variant: buttons (all variants, sizes and states), tray, menus (opened with `defaultOpen`), select, popover, dialog, alert dialog, cards, fields, toggles, tabs, badges and alerts.
  - It shows each one in light and dark side by side (a `.dark` wrapper).
  - It's lazy-loaded and only routed when `import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === "1"`, so production bundles exclude it.
- **Screenshot tests**
  - `e2e/design/gallery.spec.ts` runs under a separate `playwright.design.config.ts` (no auth `storageState`).
  - That config has a `webServer` that builds with `VITE_DESIGN_GALLERY=1` and serves `vite preview`.
  - The test takes one `toHaveScreenshot` per gallery section, at 1440 and 390 widths.
- **Baselines**
  - Generated on Linux for font-rendering stability, through `bun run test:design:update`, which runs Playwright inside the official `mcr.microsoft.com/playwright` image.
  - They're committed under `e2e/design/__screenshots__/`.
- **CI**
  - A `design-snapshots` job in `ci.yml` runs on PRs that touch `apps/web/src/shared/components/ui/**`, `apps/web/src/index.css`, `apps/web/src/dev/**` or `e2e/design/**`.
  - On mismatch it uploads the diff images as an artifact.
- **Scripts**
  - `test:design` runs the comparison.
  - `test:design:update` rewrites the baselines (in Docker).

## 4. Rollout and verification

**Phase 1** lives on `feature/soft-layered-design`, its own PR stacked on the chat migration (`feature/ds-migrate-chat`, #260), because it builds on primitives that migration added. It's one commit per group:
1. Tokens and primitives (§2 ui files).
2. The lint rule (§3b), with the baseline updated to count existing violations.
3. Docs (§3c).
4. Chat call sites (§2 feature call sites).

Then a controller visual pass, with screenshots shown to the user before any push:
- screens: auth sign-in, notebooks home (grid, list, a menu, the customize dialog) and chat (empty state, a conversation, every composer menu, history, options, configure, the citation popover);
- each one in light and dark, at 390×844 and 1440×900.

**Phase 2** (§3d) is a follow-up issue or PR after phase 1 merges, so the baselines capture the approved look.

The chat migration (Tasks 11–15 of `docs/superpowers/plans/2026-10-01-chat.md`) continues on its own branch; this branch is rebased onto it as that work lands.

## Out of scope
- Palette or font changes (tokens stay; only elevation, radii and borders change).
- Unmigrated areas' hand-built components (they adopt the look when their area migrates; the lint rule warns meanwhile).
- Landing page marketing styles (#263).
