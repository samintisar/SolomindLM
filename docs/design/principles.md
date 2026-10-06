# Design principles: soft layered

The web app separates things with **fill and shadow, not borders**. These rules live in the shadcn
primitives (`apps/web/src/shared/components/ui`); feature code places components and never restyles them.
`solomind/soft-surfaces` (design lint) enforces the "never do" list.

## Elevation ladder

| Layer | Used by | Treatment |
|---|---|---|
| Page | app background | `bg-background` (paper) |
| In-flow surface | cards, list rows, fields | `bg-card` (fields: `bg-muted/40`) + `shadow-xs` + `ring-1 ring-hairline` |
| Raised | outline buttons, tray chips, composer | `bg-surface-raised` + `shadow-xs`…`shadow-lg`, no border |
| Floating | menus, select, popover | `bg-popover` + `shadow-xl` + `ring-1 ring-hairline` |
| Modal | dialog, alert dialog, sheet | `bg-card` + `shadow-xl`, scrim `bg-overlay` + `backdrop-blur-xs` |

## Tokens, not `dark:`

Dark mode uses the same ladder. Theme differences live in tokens in `apps/web/src/index.css`
(`--surface-raised`, `--surface-selected`, `--hairline`, `--overlay`, `--link`), declared for `:root`, `.dark` and `.auth-form-light`.
A selected state on a raised control needs a fill that stands off `surface-raised` in both themes: `--accent`
is darker than `--surface-raised` in dark, so the outline toggle uses `--surface-selected` plus an inset ring.
Don't reach for `dark:` utilities: in this app they follow the OS setting, not the app's theme.

## Hierarchy through fill

- One solid primary action per view: `<Button>` (default).
- Secondary actions: `variant="secondary"` (tinted fill) or `variant="outline"` (a raised chip, not a border).
- Icon actions: `variant="ghost"`. Related icon actions sit in `<ButtonGroup variant="tray">`; the open or pressed one is raised.
- Menus that choose a mode or model: `DropdownMenuItemIcon` + `DropdownMenuItemText` + `DropdownMenuItemDescription`.
- Checked menu items hold a tinted pill and a trailing check; focus shows as a fill, not an outline.

## Shape and type

- Radii: controls `rounded-xl`; fields `rounded-lg`; cards, popovers, dialogs, composer `rounded-2xl`; menus `rounded-xl`; menu items and tray segments `rounded-lg`.
- Content in the serif body face (Lora; headings `font-display`), controls in sans.

## Never do

- `border-2` and thicker (any side) in feature code
- `border-input`, `border-foreground`, `border-black`, `border-primary` as a resting border on a control
- hand-rolled shadows (`shadow-[…]`, `shadow-(…)`) or `bg-black/…` / `bg-white/…` overlays
- a bordered `<button>`: use a `Button` variant
- restyling a ui component at the call site: add a variant in `src/shared/components/ui` instead

Hairlines (`border-border/50`, `ring-hairline`) are fine where content meets content: list rows, table cells, a card edge.

## Building with the primitives

- Add a primitive with `bunx --bun shadcn@latest add <name>` from `apps/web`. The CLI then writes
  `import { cn } from "cn"` (rewrite it to `@/shared/utils/cn`) and may add bogus `cn` / `next-themes`
  dependencies (remove them). Rules: `.agents/skills/shadcn/SKILL.md`.
- Pages place components with layout classes only; a new look is a new `cva` variant.
- Colors: semantic tokens (`bg-success-muted`, `text-info`, `border-destructive-border`), never palette
  colors or `--vintage-*` (those are persisted notebook cover swatches only — see
  `apps/web/src/shared/notebook/coverColor.ts`).
- Motion: `tw-animate-css` utilities with the house `ease-out` curve, or `m.*` primitives from
  `@/shared/components/motion` — never `motion.*` (`LazyMotion strict`).
- Toasts: `useToast()` (sonner underneath).
- Layers: ui portal primitives sit at `z-100`, above the `z-70` app header.

## Checking your work

- `bun run lint:design` must not go up. A brand-new design rule records its first counts with
  `bun run lint:design:update -- --new-rule=<rule-id>`. It runs `@shadcn/lint` (`apps/web/eslint.config.mjs`)
  against `apps/web/design-lint-baseline.json`; after a cleanup, `bun run lint:design:update` locks in the
  drop. Dirs listed in `MIGRATED` are errors. A new CLI-generated component that trips
  `no-arbitrary-values` on upstream idioms goes in `UPSTREAM_ARBITRARY` — never an authored component.
- Screenshot UI changes in light, dark and at 390px wide, and attach them to the PR.
- Changing a primitive? Run `bun run test:design` (Docker); if the change is intended, run
  `bun run test:design:update` and commit the new PNGs. Browse every primitive at `/dev/design` in dev.
