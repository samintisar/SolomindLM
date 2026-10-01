# Soft Layered Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the web UI from outlined controls to the approved "soft layered" look (fill and shadow, not borders), and make that look hard to regress: primitives own it, a lint rule guards it, docs teach it, and screenshot tests catch drift.

**Architecture:** Every visual change lands in the shadcn primitives under `apps/web/src/shared/components/ui`. Variant names are kept, so call sites don't change. A local ESLint rule (`solomind/soft-surfaces`) runs inside the existing design-lint ratchet and bans outline patterns in feature code. Phase 2 adds a dev-only gallery route and Playwright screenshot tests in CI.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (Radix), `class-variance-authority`, ESLint 10 (flat config, `@shadcn/lint`), vitest 4 (`globals: true`, jsdom), Playwright 1.63, Bun.

**Spec:** `docs/superpowers/specs/2026-10-01-soft-layered-design.md`. Read §1 (principles) before any task.
**Branch:** `feature/ds-migrate-chat`, worktree `C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb`.

## Ground rules for every task

- **Tools:** use Read/Edit/Write/Bash in the worktree. Serena is bound to the main checkout, so don't use it.
- **After edits:** run `bunx biome check --write <changed files>` from the repo root.
- **Commits:**
  - One commit per task, with a conventional message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Stage files by explicit path: never `git add -A`, `git add .` or `git commit -a`.
  - Never use bare `git stash`.
- **Processes:** never kill processes by name. A Vite dev server on :5173 runs from this worktree; don't start or stop it.
- **Tests:** web tests run from `apps/web`: `bunx vitest run --config vitest.config.ts <paths>`. Radix jsdom shims are global.
- **Design lint:** `bun run lint:design` (repo root) must not increase. Only Task 1 runs `bun run lint:design:update`; other tasks only lower counts, and the final task locks the drop.
- **Typecheck:** `bun run typecheck:web`.
- **Data safety:** don't send chat messages, delete data, or click anything in the app that costs credits.
- **Tailwind v4 note:** `dark:` currently compiles to `prefers-color-scheme`, not the `.dark` class (tracked separately). Tokens switch on `.dark`. Treat `dark:` utilities as best effort.

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/web/scripts/design-lint/soft-surfaces-rule.mjs` | new | ESLint rule `solomind/soft-surfaces` |
| `apps/web/scripts/design-lint/soft-surfaces-rule.test.ts` | new | RuleTester cases |
| `apps/web/scripts/design-lint/baseline.ts` (+ `.test.ts`) | modify | count `solomind/` rules in the ratchet |
| `apps/web/eslint.config.mjs` | modify | register plugin; warn everywhere, error in `MIGRATED`, off in `ui/**` |
| `apps/web/src/shared/components/ui/{button,button-group,toggle,toggle-group,badge}.tsx` | modify | controls: soft outline, tray |
| `apps/web/src/shared/components/ui/{dropdown-menu,select,popover}.tsx` | modify | floating layer, rich menu parts |
| `apps/web/src/shared/components/ui/{dialog,alert-dialog,sheet,card}.tsx` | modify | modal layer, in-flow surface |
| `apps/web/src/shared/components/ui/{input,textarea,input-group}.tsx` | modify | soft fields, borderless composer |
| `apps/web/src/shared/components/ui/ui.smoke.test.tsx` | modify | class contracts for the new look |
| `docs/design/principles.md` | new | the house style, one page |
| `CLAUDE.md`, `.agents/skills/shadcn/SKILL.md`, `.github/pull-request-template.md` | modify | links and checklist |
| `apps/web/src/features/chat/components/composer/{constants.ts,ModeMenu.tsx,ModelMenu.tsx,ResearchDatabaseMenu.tsx}` | modify | rich menu items |
| `apps/web/src/features/chat/components/ChatPanel.tsx` | modify | header tray, options menu tiles |
| `apps/web/src/dev/DesignGallery.tsx`, `apps/web/src/App.tsx` | new / modify | phase 2 gallery route |
| `playwright.design.config.ts`, `e2e/design/gallery.spec.ts`, `scripts/design-snapshots.sh` | new | phase 2 screenshot tests |
| `.github/workflows/ci.yml`, `package.json` | modify | phase 2 CI job and scripts |

Spec deviation: the spec puts the rule in `apps/web/eslint-rules/`. It lives in `apps/web/scripts/design-lint/` instead, because vitest only includes `src/**` and `scripts/**`, and the ratchet code already lives there.

---

# Phase 1

## Task 1: Lint rule `solomind/soft-surfaces` in the ratchet

**Files:**
- Create: `apps/web/scripts/design-lint/soft-surfaces-rule.mjs`, `apps/web/scripts/design-lint/soft-surfaces-rule.test.ts`
- Modify: `apps/web/scripts/design-lint/baseline.ts`, `apps/web/scripts/design-lint/baseline.test.ts`, `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` (via `:update`)

- [ ] **Step 1: Write the failing rule tests**

```ts
// apps/web/scripts/design-lint/soft-surfaces-rule.test.ts
import tsParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import rule from "./soft-surfaces-rule.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

const err = { messageId: "softSurfaces" } as const;

tester.run("soft-surfaces", rule, {
  valid: [
    { code: `<div className="rounded-xl bg-card shadow-xs ring-1 ring-border/50" />` },
    { code: `<div className="border-b border-border/50" />` },
    { code: `<input className="focus-visible:border-ring aria-invalid:border-destructive" />` },
    { code: `<div className={cn("p-4", isOn && "bg-muted")} />` },
    { code: `<button className="rounded-lg hover:bg-muted" />` },
    { code: `<button className="border-0 bg-transparent" />` },
    { code: `const v = cva("flex gap-2", { variants: { a: { b: "shadow-md" } } });` },
    { code: `<div className="focus-visible:border-primary data-[state=open]:border-primary" />` },
  ],
  invalid: [
    { code: `<div className="border-2 border-border" />`, errors: [err] },
    { code: `<div className="sm:border-t-4" />`, errors: [err] },
    { code: `<div className="border border-input" />`, errors: [err] },
    { code: `<div className="border-foreground/40" />`, errors: [err] },
    { code: `<div className="shadow-[0_0_0_1px_red]" />`, errors: [err] },
    { code: `<div className="bg-black/50" />`, errors: [err] },
    { code: `<button className="border px-2" />`, errors: [err] },
    { code: `<button className={cn("rounded", active ? "border-border" : "")} />`, errors: [err] },
    { code: "<div className={`p-2 ${x} border-2`} />", errors: [err] },
    { code: `const c = cn("p-2", "border-primary");`, errors: [err] },
    { code: `const v = cva("p-2", { variants: { tone: { loud: "border-4" } } });`, errors: [err] },
  ],
});
```

- [ ] **Step 2: Run it and check that it fails**

Run (from `apps/web`): `bunx vitest run --config vitest.config.ts scripts/design-lint/soft-surfaces-rule.test.ts`
Expected: FAIL, because `./soft-surfaces-rule.mjs` can't be resolved.

- [ ] **Step 3: Implement the rule**

```js
// apps/web/scripts/design-lint/soft-surfaces-rule.mjs
/**
 * solomind/soft-surfaces — the soft layered house style (docs/design/principles.md):
 * separate with fill and shadow, not borders. Flags outline patterns in static class strings.
 */
const CLASS_FUNCTIONS = new Set(["cn", "cva", "clsx", "twMerge"]);
const THICK_BORDER = /^border(?:-[xytrbse])?-(?:2|4|8)$/;
const LOUD_BORDER = /^border(?:-[xytrbse])?-(?:input|foreground|black|primary)(?:\/\d+)?$/;
const ANY_BORDER = /^border(?:-[xytrbse])?(?:-(?!0$|none$|transparent$)[\w/[\].-]+)?$/;
const STATE_PREFIX = /^(?:focus|focus-visible|focus-within|aria-invalid|data-\[state|group-focus|peer-focus)/;

/** "hover:sm:border-2" → { variants: ["hover", "sm"], utility: "border-2" } (brackets may contain ':'). */
function splitToken(token) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  return { variants: parts, utility: current.replace(/^!/, "").replace(/!$/, "") };
}

function violation(token, onButton) {
  const { variants, utility } = splitToken(token);
  if (THICK_BORDER.test(utility)) return true;
  if (utility.startsWith("shadow-[")) return true;
  if (/^bg-(?:black|white)\/\d+$/.test(utility)) return true;
  const stateOnly = variants.some((v) => STATE_PREFIX.test(v));
  if (LOUD_BORDER.test(utility) && !stateOnly) return true;
  if (onButton && !stateOnly && ANY_BORDER.test(utility)) return true;
  return false;
}

/** Collect static string pieces (with their nodes) from a className value or class-function arg. */
function collect(node, out) {
  if (!node) return;
  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") out.push({ node, text: node.value });
      break;
    case "TemplateLiteral":
      for (const q of node.quasis) out.push({ node, text: q.value.cooked ?? "" });
      break;
    case "JSXExpressionContainer":
      collect(node.expression, out);
      break;
    case "ConditionalExpression":
      collect(node.consequent, out);
      collect(node.alternate, out);
      break;
    case "LogicalExpression":
      collect(node.left, out);
      collect(node.right, out);
      break;
    case "ArrayExpression":
      for (const el of node.elements) collect(el, out);
      break;
    case "ObjectExpression":
      for (const p of node.properties) {
        if (p.type !== "Property") continue;
        if (p.key.type === "Literal") collect(p.key, out);
        collect(p.value, out);
      }
      break;
    case "CallExpression":
      if (node.callee.type === "Identifier" && CLASS_FUNCTIONS.has(node.callee.name)) {
        for (const a of node.arguments) collect(a, out);
      }
      break;
    default:
      break;
  }
}

export default {
  meta: {
    type: "suggestion",
    docs: { description: "Soft layered design: no outline borders or hand-rolled shadows on controls." },
    messages: {
      softSurfaces:
        "Soft layered design: separate with fill and shadow, not borders (`{{token}}`). Use a ui variant (see docs/design/principles.md).",
    },
    schema: [],
  },
  create(context) {
    const seen = new WeakSet();
    const report = (pieces, onButton) => {
      for (const { node, text } of pieces) {
        for (const token of text.split(/\s+/).filter(Boolean)) {
          if (violation(token, onButton)) {
            context.report({ node, messageId: "softSurfaces", data: { token } });
          }
        }
      }
    };
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" || !node.value) return;
        const opening = node.parent;
        const onButton = opening.name?.type === "JSXIdentifier" && opening.name.name === "button";
        const pieces = [];
        collect(node.value, pieces);
        for (const p of pieces) seen.add(p.node);
        report(pieces, onButton);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !CLASS_FUNCTIONS.has(node.callee.name)) return;
        const pieces = [];
        for (const a of node.arguments) collect(a, pieces);
        report(
          pieces.filter((p) => !seen.has(p.node)),
          false
        );
      },
    };
  },
};
```

Note: ESLint visits `JSXAttribute` before the nested `CallExpression`, so the `seen` set stops `className={cn(...)}` being reported twice.

- [ ] **Step 4: Run the rule tests and check they pass**

Run: `bunx vitest run --config vitest.config.ts scripts/design-lint/soft-surfaces-rule.test.ts`
Expected: PASS, 19 cases. If a case fails, fix the rule, not the case. The cases are the spec's "never do" list.

- [ ] **Step 5: Teach the ratchet to count `solomind/` rules (test first)**

In `baseline.test.ts`, add:

```ts
test("counts solomind/ rules alongside shadcn/", () => {
  const { counts } = countViolations([
    { filePath: "/r/src/features/chat/A.tsx", messages: [msg("solomind/soft-surfaces"), msg("other/rule")] },
  ]);
  expect(counts).toEqual({ "features/chat": { "solomind/soft-surfaces": 1 } });
});
```

Run it (`scripts/design-lint/baseline.test.ts`). It FAILS. Then, in `baseline.ts`, replace

```ts
const RULE_PREFIX = "shadcn/";
```

with

```ts
const RULE_PREFIXES = ["shadcn/", "solomind/"];
```

and replace

```ts
      if (!message.ruleId?.startsWith(RULE_PREFIX)) continue;
```

with

```ts
      const ruleId = message.ruleId;
      if (!ruleId || !RULE_PREFIXES.some((p) => ruleId.startsWith(p))) continue;
```

Re-run the test. It PASSES.

- [ ] **Step 6: Register the rule.** In `apps/web/eslint.config.mjs`:
  - Add `import softSurfaces from "./scripts/design-lint/soft-surfaces-rule.mjs";`.
  - Add `const solomind = { meta: { name: "solomind" }, rules: { "soft-surfaces": softSurfaces } };`.
  - Add `solomind` to `plugins` next to `shadcn`.
  - Extend `rules(level)` with `"solomind/soft-surfaces": level,`.
  - Append a final config object that turns it off inside primitives:

```js
  // Primitives own the look; outline exceptions there are reviewed variants (docs/design/principles.md).
  { files: ["src/shared/components/ui/**/*.tsx"], rules: { "solomind/soft-surfaces": "off" } },
```

- [ ] **Step 7: Record the existing violations**

Run from the repo root: `bun run lint:design`. Expected: it reports increases for `solomind/soft-surfaces` in several areas.
Then run `bun run lint:design:update`, which writes the new counts. Then `bun run lint:design` again, expecting `design-lint: OK`.
Paste the per-area `solomind/soft-surfaces` counts into the commit body.

- [ ] **Step 8: Commit**

```bash
git add apps/web/scripts/design-lint/soft-surfaces-rule.mjs apps/web/scripts/design-lint/soft-surfaces-rule.test.ts apps/web/scripts/design-lint/baseline.ts apps/web/scripts/design-lint/baseline.test.ts apps/web/eslint.config.mjs apps/web/design-lint-baseline.json
git commit -m "feat(web): soft-surfaces lint rule in the design ratchet"
```

---

## Task 2: Controls (button, button group tray, toggle, toggle group, badge)

**Files:** Modify `ui/button.tsx`, `ui/button-group.tsx`, `ui/toggle.tsx`, `ui/toggle-group.tsx`, `ui/badge.tsx` and `ui/ui.smoke.test.tsx`, all under `apps/web/src/shared/components/`.

- [ ] **Step 1: Write failing smoke assertions** in `ui.smoke.test.tsx`. Import `ButtonGroup` if it isn't imported yet.

```tsx
test("soft layered controls", () => {
  render(
    <>
      <Button variant="outline">o</Button>
      <ButtonGroup variant="tray" aria-label="tray">
        <Button variant="ghost" size="icon-sm" aria-label="a" aria-expanded="true" />
      </ButtonGroup>
      <Toggle variant="outline" aria-label="t" />
      <Badge variant="outline">b</Badge>
    </>
  );
  const outline = screen.getByRole("button", { name: "o" });
  expect(outline).toHaveClass("ring-1", "shadow-xs", "bg-card");
  expect(outline).not.toHaveClass("border-2");
  const tray = screen.getByRole("group", { name: "tray" });
  expect(tray).toHaveClass("bg-secondary", "rounded-xl");
  expect(tray).toHaveAttribute("data-variant", "tray");
  expect(screen.getByRole("button", { name: "t" })).not.toHaveClass("border");
  expect(screen.getByText("b")).toHaveClass("ring-1");
});
```

Run it: FAIL.

- [ ] **Step 2: `button.tsx`.** Replace the `outline` and `secondary` entries:

```ts
        outline:
          "rounded-xl bg-card shadow-xs ring-1 ring-border/50 hover:bg-muted hover:text-foreground active:scale-98 aria-expanded:bg-accent/60 aria-expanded:text-accent-foreground dark:bg-secondary dark:ring-foreground/8",
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/70 active:scale-98 aria-expanded:bg-secondary/70",
```

- [ ] **Step 3: `button-group.tsx` tray.** Replace `buttonGroupVariants`, then thread `variant` through `ButtonGroup`:

```ts
const buttonGroupVariants = cva(
  // Segments move as one button: the per-button hover lift/press scale is cancelled inside a group.
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:hover:translate-y-0 [&>*]:active:scale-100 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: { horizontal: "", vertical: "flex-col" },
      variant: {
        default: "",
        // Icon-action tray: a tinted pill; the open/pressed segment is raised onto a card chip.
        tray: "items-center gap-0.5 rounded-xl bg-secondary p-0.5 [&>*]:rounded-lg [&>[aria-expanded=true]]:bg-card [&>[aria-expanded=true]]:shadow-xs [&>[aria-pressed=true]]:bg-card [&>[aria-pressed=true]]:shadow-xs",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        orientation: "horizontal",
        class:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
      },
      {
        variant: "default",
        orientation: "vertical",
        class:
          "[&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    ],
    defaultVariants: { orientation: "horizontal", variant: "default" },
  }
);

function ButtonGroup({
  className,
  orientation,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      data-variant={variant ?? "default"}
      className={cn(buttonGroupVariants({ orientation, variant }), className)}
      {...props}
    />
  );
}
```

  Also in `ButtonGroupText`, replace `rounded-md border bg-muted … shadow-xs` with `rounded-lg bg-muted … ring-1 ring-border/50`.
  Check that the notebooks split button (`features/notebooks/components/home/CreateMenuButton.tsx`) still renders one joined control. Its group is the default variant, so the compound classes still apply.

- [ ] **Step 4: `toggle.tsx`.** Change `variant.outline` to `"bg-card shadow-xs ring-1 ring-border/50 hover:bg-muted hover:text-foreground data-[state=on]:bg-accent/60"`.
  In `toggle-group.tsx`, delete the border classes `data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l`. Keep the radius classes.

- [ ] **Step 5: `badge.tsx`.** Change `outline` to `"bg-card text-foreground ring-1 ring-border/50 [a&]:hover:bg-muted"`.

- [ ] **Step 6: Run the tests**
  - `bunx vitest run --config vitest.config.ts src/shared/components src/features` → PASS. Fix any feature test that asserted old classes, such as `border-2`.
  - `bun run typecheck:web` → clean.
  - `bun run lint:design` → OK.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/components/ui/button.tsx apps/web/src/shared/components/ui/button-group.tsx apps/web/src/shared/components/ui/toggle.tsx apps/web/src/shared/components/ui/toggle-group.tsx apps/web/src/shared/components/ui/badge.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx
git commit -m "feat(web): soft layered controls and icon tray"
```

---

## Task 3: Floating layer (dropdown menu, select, popover) and rich menu parts

**Files:** Modify `ui/dropdown-menu.tsx`, `ui/select.tsx`, `ui/popover.tsx` and `ui/ui.smoke.test.tsx`.

- [ ] **Step 1: Write failing tests** in `ui.smoke.test.tsx`:

```tsx
test("menus float softly and support rich items", async () => {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>m</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup value="a">
          <DropdownMenuRadioItem value="a">
            <DropdownMenuItemIcon>
              <svg aria-hidden />
            </DropdownMenuItemIcon>
            <DropdownMenuItemText>
              Alpha
              <DropdownMenuItemDescription>First</DropdownMenuItemDescription>
            </DropdownMenuItemText>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const menu = await screen.findByRole("menu");
  expect(menu).toHaveClass("rounded-xl", "shadow-xl", "ring-1");
  expect(menu).not.toHaveClass("border");
  const item = screen.getByRole("menuitemradio", { name: /Alpha/ });
  expect(item).toHaveClass("rounded-lg", "min-h-9");
  expect(item).toHaveAttribute("data-state", "checked");
  expect(screen.getByText("First")).toHaveClass("text-xs", "text-muted-foreground");
});
```

  Add the new names to the `dropdown-menu` import. Run it: FAIL, because the new exports are missing.

- [ ] **Step 2: `dropdown-menu.tsx`.**
  - **Content** (`DropdownMenuContent` and `DropdownMenuSubContent`): replace `rounded-md border bg-popover p-1 text-popover-foreground shadow-md` (Sub: `shadow-lg`) with `rounded-xl bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-border/50 dark:ring-foreground/8`.
  - **Item** (`DropdownMenuItem`): replace its class string with:

```ts
        "group/menu-item relative flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-hidden select-none focus:bg-muted focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
```

    The muted-icon rule is now `&>svg` (direct children only), so icons inside an `DropdownMenuItemIcon` tile keep the tile's colour.
  - **`DropdownMenuSubTrigger`:** the same item classes, plus `data-[state=open]:bg-muted`.
  - **Checkbox and radio items** use a trailing check and a checked pill. Class string:

```ts
        "group/menu-item relative flex min-h-9 cursor-default items-center gap-2.5 rounded-lg py-2 pr-8 pl-2.5 text-sm outline-hidden select-none focus:bg-muted focus:text-foreground data-[state=checked]:bg-accent/60 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&>svg:not([class*='text-'])]:text-muted-foreground",
```

    Indicator wrapper: `className="pointer-events-none absolute right-2.5 flex size-4 items-center justify-center"`. The radio indicator renders `<CheckIcon className="size-4" />` instead of `CircleIcon`; remove the `CircleIcon` import.
  - **`DropdownMenuLabel`:** `"px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground data-[inset]:pl-8"`.
  - **`DropdownMenuSeparator`:** `"-mx-1.5 my-1.5 h-px bg-border/60"`.
  - **New parts**, added before the export block and exported:

```tsx
/** Icon tile for rich menu items; turns solid when its item is checked. */
function DropdownMenuItemIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-item-icon"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground group-data-[state=checked]/menu-item:bg-primary group-data-[state=checked]/menu-item:text-primary-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

/** Title + optional description stack for rich menu items. */
function DropdownMenuItemText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-item-text"
      className={cn("flex min-w-0 flex-col leading-tight", className)}
      {...props}
    />
  );
}

function DropdownMenuItemDescription({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-item-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 3: `select.tsx`.**
  - **Content:** the same panel classes as the dropdown, replacing `rounded-md border bg-popover … shadow-md`. Add `p-1.5` to the viewport if the viewport carries `p-1`.
  - **Item:** `rounded-lg min-h-9 py-2 pr-8 pl-2.5 focus:bg-muted focus:text-foreground data-[state=checked]:bg-accent/60`, replacing `rounded-sm py-1.5 pr-8 pl-2 focus:bg-accent focus:text-accent-foreground`. Its indicator is already a trailing check; change `right-2` to `right-2.5`.
  - **Label:** `px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground`.
  - **Separator:** `-mx-1.5 my-1.5 h-px bg-border/60`.
  - Leave the trigger alone; Task 5 changes it.

- [ ] **Step 4: `popover.tsx`.** In the `popoverContentVariants` base, replace `rounded-md border bg-popover … shadow-md` with `rounded-2xl bg-popover … shadow-xl ring-1 ring-border/50 dark:ring-foreground/8`. Keep the `padding` variant.

- [ ] **Step 5: Run the tests**
  - Vitest on `src/shared/components` and `src/features` → PASS. Update any feature test that queried the radio dot.
  - Typecheck → clean.
  - `bun run lint:design` → OK.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/components/ui/dropdown-menu.tsx apps/web/src/shared/components/ui/select.tsx apps/web/src/shared/components/ui/popover.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx
git commit -m "feat(web): soft floating menus with rich item parts"
```

---

## Task 4: Modal layer and in-flow surfaces (dialog, alert dialog, sheet, card)

**Files:** Modify `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx`, `ui/card.tsx` and `ui/ui.smoke.test.tsx`.

- [ ] **Step 1: Write failing tests:**

```tsx
test("modal and card surfaces are borderless", async () => {
  render(
    <>
      <Card data-testid="card">c</Card>
      <Dialog defaultOpen>
        <DialogContent>
          <DialogTitle>d</DialogTitle>
          <DialogDescription>x</DialogDescription>
        </DialogContent>
      </Dialog>
    </>
  );
  const card = screen.getByTestId("card");
  expect(card).toHaveClass("ring-1", "rounded-2xl");
  expect(card).not.toHaveClass("border");
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveClass("rounded-2xl", "shadow-xl");
  expect(dialog).not.toHaveClass("border");
});
```

  Run it: FAIL.

- [ ] **Step 2: `card.tsx`.** Replace `cardVariants`:

```ts
const cardVariants = cva(
  "flex flex-col gap-6 rounded-2xl bg-card py-6 text-card-foreground ring-1 ring-border/50 dark:ring-foreground/8",
  {
    variants: {
      variant: {
        default: "shadow-xs",
        elevated: "bg-card/90 shadow-lg shadow-primary/5 backdrop-blur-sm",
        // Clickable cards: the inner <button> carries the focus ring; the card lifts on hover.
        interactive:
          "relative gap-0 overflow-hidden py-0 shadow-xs transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-md motion-safe:active:scale-99",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
```

- [ ] **Step 3: `dialog.tsx` and `alert-dialog.tsx`.**
  - **Overlay:** replace `bg-black/50` with `bg-foreground/25 backdrop-blur-xs dark:bg-background/70`.
  - **Content:** replace `rounded-lg border bg-background p-6 shadow-lg` with `rounded-2xl bg-card p-6 shadow-xl ring-1 ring-border/50 dark:ring-foreground/8`.
  - Keep the `size`/`padding` variants in `dialog.tsx`. Check that `size: { wide }` still reads correctly after the change.

- [ ] **Step 4: `sheet.tsx`.**
  - **Overlay:** the same as the dialog overlay.
  - **Content base:** replace `bg-background shadow-lg` with `bg-card shadow-xl`.
  - **Sides:** remove `border-l`, `border-r`, `border-t` and `border-b` from each side variant. The shadow separates the sheet.

- [ ] **Step 5: Run the tests**
  - Vitest on `src/shared/components` and `src/features` → PASS.
  - Typecheck → clean.
  - `bun run lint:design` → OK.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/components/ui/dialog.tsx apps/web/src/shared/components/ui/alert-dialog.tsx apps/web/src/shared/components/ui/sheet.tsx apps/web/src/shared/components/ui/card.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx
git commit -m "feat(web): borderless dialogs, sheets and cards on the elevation ladder"
```

---

## Task 5: Fields and the composer (input, textarea, select trigger, input group)

**Files:** Modify `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx` (trigger only), `ui/input-group.tsx` and `ui/ui.smoke.test.tsx`.

- [ ] **Step 1: Write failing tests:**

```tsx
test("fields are soft filled, the composer is borderless", () => {
  render(
    <>
      <Input aria-label="i" />
      <Textarea aria-label="ta" />
      <InputGroup variant="composer" size="auto" data-testid="composer">
        <InputGroupTextarea aria-label="c" />
      </InputGroup>
    </>
  );
  const input = screen.getByRole("textbox", { name: "i" });
  expect(input).toHaveClass("bg-muted/40", "ring-1");
  expect(input).not.toHaveClass("border");
  expect(screen.getByRole("textbox", { name: "ta" })).toHaveClass("bg-muted/40");
  const composer = screen.getByTestId("composer");
  expect(composer).toHaveClass("shadow-lg", "bg-card");
  expect(composer).not.toHaveClass("border");
  expect(screen.getByRole("textbox", { name: "c" })).toHaveClass("ring-0", "bg-transparent");
});
```

  Run it: FAIL.

- [ ] **Step 2: `input.tsx`.**
  - **Base:** replace `rounded-md border border-input bg-transparent … shadow-xs` with `rounded-lg bg-muted/40 ring-1 ring-border/50 … shadow-none`, and drop `dark:bg-input/30`.
  - **Focus:** replace `focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50` with `focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40`.
  - **Invalid:** replace `aria-invalid:border-destructive aria-invalid:ring-destructive/20` with `aria-invalid:ring-destructive/60`.

- [ ] **Step 3: `textarea.tsx`.** Apply the same three replacements as Step 2.

- [ ] **Step 4: `select.tsx` `SelectTrigger`.** Replace `rounded-md border border-input bg-transparent … shadow-xs` with `rounded-lg bg-muted/40 ring-1 ring-border/50 shadow-none`, and the focus classes with `focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40`. Drop `dark:bg-input/30 dark:hover:bg-input/50` and add `hover:bg-muted/60`.

- [ ] **Step 5: `input-group.tsx`.**
  - **InputGroup root:**
    - Replace `rounded-md border border-input shadow-xs … dark:bg-input/30` with `rounded-lg bg-muted/40 ring-1 ring-border/50`.
    - Focus state: `has-[[data-slot=input-group-control]:focus-visible]:bg-card has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/40`.
    - Error state: `has-[[data-slot][aria-invalid=true]]:ring-destructive/60`.
  - **`composer` variant:**

```ts
      composer:
        "h-auto flex-col items-stretch rounded-2xl bg-card shadow-lg ring-border/40 dark:bg-card dark:ring-foreground/8 *:data-[slot=input-group-control]:px-4 *:data-[slot=input-group-control]:pt-3.5",
```

    The composer's focus keeps `bg-card`, because the root's focus `bg-card` matches.
  - **`InputGroupInput` and `InputGroupTextarea`:** add `ring-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:bg-transparent` to each control's class list so the inner field doesn't draw a second ring.

- [ ] **Step 6: Run the tests**
  - Vitest on `src/shared/components` and `src/features` → PASS. That includes the Task 1 smoke test asserting `rounded-2xl`/`h-auto`, and the `ChatInput` tests.
  - Typecheck → clean.
  - `bun run lint:design` → OK.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/components/ui/input.tsx apps/web/src/shared/components/ui/textarea.tsx apps/web/src/shared/components/ui/select.tsx apps/web/src/shared/components/ui/input-group.tsx apps/web/src/shared/components/ui/ui.smoke.test.tsx
git commit -m "feat(web): soft filled fields and a borderless composer"
```

---

## Task 6: House-style docs

**Files:**
- Create: `docs/design/principles.md`
- Modify: `CLAUDE.md`, `.agents/skills/shadcn/SKILL.md`, `.github/pull-request-template.md`

- [ ] **Step 1: Write `docs/design/principles.md`:**

```markdown
# Design principles: soft layered

The web app separates things with **fill and shadow, not borders**. These rules live in the shadcn
primitives (`apps/web/src/shared/components/ui`); feature code places components and never restyles them.
`solomind/soft-surfaces` (design lint) enforces the "never do" list.

## Elevation ladder

| Layer | Used by | Treatment |
|---|---|---|
| Page | app background | `bg-background` (paper) |
| In-flow surface | cards, list rows, fields | `bg-card` + `shadow-xs` + `ring-1 ring-border/50` |
| Raised | composer, hovered card, tray | `bg-card` + `shadow-md`…`shadow-lg`, no border |
| Floating | menus, select, popover | `bg-popover` + `shadow-xl` + hairline ring |
| Modal | dialog, alert dialog, sheet | `bg-card` + `shadow-xl`, overlay `bg-foreground/25` + blur |

## Hierarchy through fill

- One solid primary action per view: `<Button>` (default).
- Secondary actions: `variant="secondary"` (tinted fill) or `variant="outline"` (a soft card chip, not a border).
- Icon actions: `variant="ghost"`. Related icon actions sit in `<ButtonGroup variant="tray">`.
- Menus that choose a mode or model: `DropdownMenuItemIcon` + `DropdownMenuItemText` + `DropdownMenuItemDescription`.

## Shape and type

- Radii: controls `rounded-xl`; cards, menus, popovers, dialogs `rounded-2xl`; menu items and tray segments `rounded-lg`.
- Content in the serif body face (Lora; headings `font-display`), controls in sans.
- Dark mode uses the same ladder; elevated surfaces add `dark:ring-foreground/8` because shadows vanish on dark paper.

## Never do

- `border-2` / `border-4` / `border-8` (any side) in feature code
- `border-input`, `border-foreground`, `border-black`, `border-primary` as a resting border on a control
- hand-rolled shadows (`shadow-[…]`) or `bg-black/…` / `bg-white/…` overlays
- a bordered `<button>`: use a `Button` variant
- restyling a ui component at the call site: add a variant in `src/shared/components/ui` instead

Hairlines (`border-border/50`, `ring-border/50`) are fine where content meets content: list rows, table cells, a card edge.

## Checking your work

- `bun run lint:design` must not go up.
- Screenshot UI changes in light, dark and at 390px wide, and attach them to the PR.
- Compare against `/dev/design` (dev builds), the gallery of every primitive.
```

- [ ] **Step 2: `CLAUDE.md`.** In the "Design system (shadcn)" gotcha bullet, insert this sentence right after "Pages place components (layout classes only); a new look is a new `cva` variant.":

`Look: **soft layered**, fill and shadow, not outlines (no thick or loud borders, no hand-rolled shadows), per docs/design/principles.md and enforced by \`solomind/soft-surfaces\`.`

- [ ] **Step 3: `.agents/skills/shadcn/SKILL.md`.** Directly under the `# shadcn/ui` heading line, insert:

```markdown
> **House style (SolomindLM):** soft layered, fill and shadow, not borders. Read `docs/design/principles.md`
> before styling anything. Feature code never restyles ui components; new looks are `cva` variants.
> `solomind/soft-surfaces` (design lint) flags outline borders and hand-rolled shadows.
```

- [ ] **Step 4: `.github/pull-request-template.md`.**
  - Replace the Screenshots comment with `<!-- UI changes: light, dark, and 390px-wide screenshots. Delete if n/a. -->`.
  - Add a checklist line after the Errors line: `- [ ] UI follows docs/design/principles.md; \`bun run lint:design\` passes with no new \`solomind/soft-surfaces\` findings`.

- [ ] **Step 5: Commit**

```bash
git add docs/design/principles.md CLAUDE.md .agents/skills/shadcn/SKILL.md .github/pull-request-template.md
git commit -m "docs: soft layered house style and where to find it"
```

---

## Task 7: Chat call sites (rich menus, header tray)

**Files:** Modify these under `apps/web/src/features/chat/components/`:
- `composer/constants.ts`, `composer/ModeMenu.tsx`, `composer/ModelMenu.tsx`, `composer/ResearchDatabaseMenu.tsx`
- `ChatPanel.tsx`
- `composer/menus.test.tsx`, `ChatPanel.header.test.tsx`

- [ ] **Step 1: Write failing tests.**
  - In `composer/menus.test.tsx`:

```tsx
test("mode items carry a description", async () => {
  render(<ModeMenu mode="chat" onModeChange={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Composer mode: Chat" }));
  expect(await screen.findByText("Multi-step web research")).toBeInTheDocument();
  expect(screen.getByRole("menuitemradio", { name: /^Deep Research/ })).toBeInTheDocument();
});
```

  - In `ChatPanel.header.test.tsx`:

```tsx
test("thread actions sit in one tray", () => {
  renderPanel(); // the file's existing render helper
  const tray = screen.getByRole("group", { name: "Chat actions" });
  for (const name of ["Thread history", /New chat|Already in a new chat/, "Chat options"]) {
    expect(within(tray).getByRole("button", { name })).toBeInTheDocument();
  }
});
```

  Use the file's real render helper name. Run both: FAIL.

- [ ] **Step 2: `composer/constants.ts`.** Add a `description` to each composer mode and the matching type:

```ts
export const COMPOSER_MODES = [
  { id: "chat", label: "Chat", icon: MessageCircle, description: "Answers from your sources" },
  { id: "deepResearch", label: "Deep Research", icon: Telescope, description: "Multi-step web research" },
  { id: "literatureReview", label: "Literature Review", icon: FileText, description: "Find and screen papers" },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; description: string }[];
```

- [ ] **Step 3: `ModeMenu.tsx`.** Import `DropdownMenuItemDescription`, `DropdownMenuItemIcon` and `DropdownMenuItemText`. Change `className="w-60"` to `className="w-72"`, and render each item as:

```tsx
          {COMPOSER_MODES.map(({ id, label, icon: ItemIcon, description }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <DropdownMenuItemIcon>
                <ItemIcon />
              </DropdownMenuItemIcon>
              <DropdownMenuItemText>
                {label}
                <DropdownMenuItemDescription>{description}</DropdownMenuItemDescription>
              </DropdownMenuItemText>
            </DropdownMenuRadioItem>
          ))}
```

- [ ] **Step 4: `ModelMenu.tsx`.** Wrap each item's `ModelBrandIcon` in `<DropdownMenuItemIcon>`, and the name in `<DropdownMenuItemText>` with no description.

- [ ] **Step 5: `ResearchDatabaseMenu.tsx`.**
  - Align the radio rows with menu items: change the row classes `hover:bg-accent has-data-[state=checked]:bg-primary/5` to `hover:bg-muted has-data-[state=checked]:bg-accent/60`.
  - Change the row's icon to a tile, `<span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">`, keeping its `aria-hidden` icon inside. Plain `<span>` styling is allowed in feature code.

- [ ] **Step 6: `ChatPanel.tsx` header.**
  - Import `ButtonGroup` from `@/shared/components/ui/button-group`.
  - Wrap the history `Popover`, the new-chat `ControlTooltip` and the options `DropdownMenu` in `<ButtonGroup variant="tray" aria-label="Chat actions">…</ButtonGroup>`.
  - Change those three buttons from `variant="outline"` to `variant="ghost"`.
  - Popover and DropdownMenu roots render no DOM, so the buttons are the tray's direct children.
  - The panel toggles (Open Sources/Studio) stay outside the tray as `variant="outline"`, which is now the soft chip.
  - In the options menu, wrap each item's icon in `<DropdownMenuItemIcon>`.

- [ ] **Step 7: Run the tests**
  - Vitest on `src/features/chat` → PASS. Update any test that queried a mode item by exact name: use `{ name: /^Deep Research/ }`, because the description is part of the name now.
  - Typecheck → clean.
  - `bun run lint:design` → OK.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/chat/components/composer/constants.ts apps/web/src/features/chat/components/composer/ModeMenu.tsx apps/web/src/features/chat/components/composer/ModelMenu.tsx apps/web/src/features/chat/components/composer/ResearchDatabaseMenu.tsx apps/web/src/features/chat/components/ChatPanel.tsx apps/web/src/features/chat/components/composer/menus.test.tsx apps/web/src/features/chat/components/ChatPanel.header.test.tsx
git commit -m "feat(chat): rich composer menus and a header action tray"
```

---

## Task 8: Sweep migrated feature code and lock the ratchet

**Files:** whatever `solomind/soft-surfaces` flags in `src/features/{auth,onboarding,notebooks,chat}` and `src/shared/components/motion`, plus `apps/web/design-lint-baseline.json`.

- [ ] **Step 1: List the findings.** From `apps/web`, run `bunx eslint -c eslint.config.mjs src/features/auth src/features/onboarding src/features/notebooks src/features/chat src/shared/components/motion -f unix | grep soft-surfaces`.
- [ ] **Step 2: Fix each finding.** Use the matching primitive or variant, or remove the outline:
  - `border-2` → none, or `ring-1 ring-border/50`.
  - A bordered `<button>` → a `Button` variant.
  - `bg-black/50` → a ui overlay component.

  Don't add `eslint-disable`. If a case truly needs an outline (for example the notebooks colour swatch selection ring), move the look into a ui variant.
- [ ] **Step 3: Run the gates.** Run each, one at a time:
  - `bun run typecheck:web`
  - `bun run lint -- --diagnostic-level=error`
  - `bun run test:web`
  - `bun run lint:design` (it should report decreases)

  Then run `bun run lint:design:update`.
- [ ] **Step 4: Commit:** `fix(web): clear soft-surfaces findings in migrated areas` (stage the files you changed plus the baseline).

---

## Task 9: Visual pass (controller, with the user)

Not a subagent task. The controller does this in the in-app browser, signed in, against the running dev server (:5173).

- [ ] **Step 1: Screenshot each screen** in light and dark, at 390×844 and 1440×900:
  - **Auth:** `/sign-in`. Sign out only if the user agrees; otherwise use a private tab.
  - **Notebooks home:**
    - grid and list views
    - a card's actions menu open
    - the customize dialog open, then Esc
  - **Chat:**
    - an empty new chat
    - a conversation with citations, with a citation popover open
    - each composer menu open (mode, model, filters, database)
    - the history popover
    - the options menu
    - Configure chat open, then Esc
- [ ] **Step 2: Show the user the screenshots** grouped by screen before any push. Record requested tweaks as follow-up commits to the relevant primitive, never at call sites.
- [ ] **Step 3: Push** after the user approves: `git push origin feature/ds-migrate-chat`.

---

# Phase 2 (follow-up PR, after phase 1 merges)

## Task 10: `/dev/design` gallery route

**Files:**
- Create: `apps/web/src/dev/DesignGallery.tsx`, `apps/web/src/dev/DesignGallery.test.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write a failing test:**

```tsx
// apps/web/src/dev/DesignGallery.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import DesignGallery from "./DesignGallery";

test("gallery renders a section per primitive group", () => {
  render(<DesignGallery />);
  for (const name of ["Buttons", "Tray", "Menus", "Fields", "Cards", "Dialogs", "Badges and alerts"]) {
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  }
});
```

  Run it: FAIL.
- [ ] **Step 2: Implement `DesignGallery.tsx`.**
  - It's a default export that renders a `<main className="mx-auto max-w-5xl space-y-12 p-8">`.
  - Each group is a `<section aria-label="…" data-gallery-section="…">` (same name) holding an `<h2 className="font-display text-lg">`.
  - Section contents:
    - **Buttons:** every `Button` variant × the sizes `default`, `sm`, `icon-sm`; disabled; with icon.
    - **Tray:** `ButtonGroup variant="tray"` with 3 ghost icon buttons, one `aria-expanded="true"`.
    - **Menus:**
      - `DropdownMenu defaultOpen modal={false}` with a label, plain items, a separator, a destructive item, and rich radio items (icon, text, description);
      - a `Select defaultOpen`;
      - a `Popover defaultOpen` with `padding="default"`.

      Lay each out in its own `relative h-80` box so the open content has room.
    - **Fields:** `Input`, `Textarea`, `Select` trigger, `InputGroup`, and `InputGroup variant="composer" size="auto"` with a textarea and a block-end addon.
    - **Cards:** default, elevated, and interactive with a button.
    - **Dialogs:** a `Dialog defaultOpen` inside a `relative` frame with `DialogContent`, and an `AlertDialog defaultOpen`. They're open, so they stay in the screenshot.
    - **Badges and alerts:** every `Badge` variant, plus `Alert` default, destructive and warning.
  - Use static copy only, with no Convex hooks or context.
- [ ] **Step 3: Add the route in `App.tsx`.** At module scope:

```tsx
const DesignGallery =
  import.meta.env.DEV || import.meta.env.VITE_DESIGN_GALLERY === "1"
    ? lazy(() => import("./dev/DesignGallery"))
    : null;
```

  Inside `<Routes>`, before the catch-all, add `{DesignGallery && <Route path="/dev/design" element={<Suspense fallback={null}><DesignGallery /></Suspense>} />}`.
- [ ] **Step 4: Check that production excludes it.**
  - Run `bun run --cwd apps/web build`, then `rg -l "data-gallery-section" apps/web/dist`. Expected: no matches.
  - Run vitest on `src/dev`. Expected: PASS.
  - Open `http://localhost:5173/dev/design` and screenshot it.
- [ ] **Step 5: Commit:** `feat(web): dev-only design gallery`.

## Task 11: Playwright screenshot tests and CI

**Files:**
- Create: `playwright.design.config.ts`, `e2e/design/gallery.spec.ts`, `scripts/design-snapshots.sh`
- Modify: `package.json` (root), `.github/workflows/ci.yml`

- [ ] **Step 1: Write the config:**

```ts
// playwright.design.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

export default defineConfig({
  testDir: "./e2e/design",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled" } },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run --cwd apps/web build && bun run --cwd apps/web preview --port ${PORT} --strictPort`,
    env: { VITE_DESIGN_GALLERY: "1" },
    port: PORT,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
```

- [ ] **Step 2: Write the spec:**

```ts
// e2e/design/gallery.spec.ts
import { expect, test } from "@playwright/test";

const SECTIONS = ["Buttons", "Tray", "Menus", "Fields", "Cards", "Dialogs", "Badges and alerts"];

for (const theme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(`gallery ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/dev/design");
      if (theme === "dark") await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.evaluate(() => document.fonts.ready);
      for (const name of SECTIONS) {
        const section = page.locator(`[data-gallery-section="${name}"]`);
        await expect(section).toHaveScreenshot(`${name}-${theme}-${width}.png`);
      }
    });
  }
}
```

- [ ] **Step 3: Write `scripts/design-snapshots.sh`.** This runs in the Linux Playwright image so the baselines match CI:

```bash
#!/usr/bin/env bash
# Usage: scripts/design-snapshots.sh [--update-snapshots]
set -euo pipefail
docker run --rm -v "$(pwd)":/work -w /work -e VITE_CONVEX_URL="${VITE_CONVEX_URL:-}" \
  mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c "curl -fsSL https://bun.sh/install | bash && export PATH=\$HOME/.bun/bin:\$PATH && bun install --frozen-lockfile && bunx playwright test -c playwright.design.config.ts $*"
```

  In the root `package.json`, add these scripts:

```json
"test:design": "bash scripts/design-snapshots.sh",
"test:design:update": "bash scripts/design-snapshots.sh --update-snapshots"
```

- [ ] **Step 4: Generate the baselines.**
  - Run `bun run test:design:update`. It needs Docker and `VITE_CONVEX_URL` from `apps/web/.env.local`, and should produce 28 PNGs (7 sections × 2 themes × 2 widths) under `e2e/design/__screenshots__/`.
  - View a few of them.
  - Then run `bun run test:design`. Expected: PASS.
- [ ] **Step 5: Add the CI job.** In `.github/workflows/ci.yml`, add a `design-snapshots` job:
  - It runs on `pull_request` with a `paths` filter: `apps/web/src/shared/components/ui/**`, `apps/web/src/index.css`, `apps/web/src/dev/**`, `e2e/design/**`, `playwright.design.config.ts`. If the workflow doesn't already split on paths, use `dorny/paths-filter`.
  - It runs in `container: mcr.microsoft.com/playwright:v1.63.0-noble`, with the same checkout and Setup steps as the other jobs.
  - It sets `env: VITE_CONVEX_URL: ${{ vars.VITE_CONVEX_URL }}`.
  - It runs `bunx playwright test -c playwright.design.config.ts`.
  - On failure, it runs `actions/upload-artifact` with `path: test-results/`.
- [ ] **Step 6: Commit:** `test(web): design gallery screenshot tests in CI`. Stage the config, the spec, the script, `package.json`, `ci.yml` and the snapshots.
- [ ] **Step 7: Note it in `docs/design/principles.md`.** Under "Checking your work", add: "Changing a primitive? Run `bun run test:design`; if the change is intended, `bun run test:design:update` and commit the new PNGs." Commit: `docs: design snapshot workflow`.

---

## After phase 1

Resume the chat migration (`docs/superpowers/plans/2026-10-01-chat.md`):
1. Task 11's spec and quality reviews.
2. Tasks 12–15.

In Task 14, mode menu queries use `{ name: /^Deep Research/ }`.
