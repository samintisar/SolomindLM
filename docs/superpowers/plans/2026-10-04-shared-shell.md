# Shared Shell Design-System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the authored code in `apps/web/src/shared` and the `billing`, `audio`, `feedback` and `legal` feature folders onto the soft layered design system, at 0 `lint:design` findings, and add them to `MIGRATED`.

**Architecture:**
- **Components:** each area switches to the shadcn primitives in `@/shared/components/ui`, with layout-only classes at call sites. `ConfirmDialog` is rebuilt on `AlertDialog`, and its hook keeps its API.
- **Dynamic sizes:** move to CSS custom properties.
- **Brand logos:** one lint exception for the brand-logo file.

**Tech Stack:** React 19, Radix through shadcn/ui, Tailwind v4, vitest with Testing Library, and ESLint `@shadcn/lint` with the local `solomind/soft-surfaces` rule.

**Spec:** `docs/superpowers/specs/2026-10-04-shared-shell-design.md`

**Worktree:**
- **Location:** `.worktrees/shared` on `feature/ds-migrate-shared`, inside the session worktree. `node_modules` is junctioned.
- **Commands:** run them from the worktree root.
- **Serena:** it is bound to the main checkout, so use Read/Edit/Write and check `git status`.

**Ground rules:**
- **Colours:** semantic tokens only. No `border-2`, no `border-primary` unless it is gated on a `focus:`, `aria-invalid:` or `data-[state…]` variant, and no visible borders on `<button>`.
- **Values:** no arbitrary values.
- **Inline styles:** only to set a CSS custom property.
- **Typography:** don't put typography or colour classes on primitives such as `DialogTitle`, `Label`, `CardTitle` or `Button`.

---

## File structure

| File | Change |
|---|---|
| `apps/web/src/shared/ui/confirmStore.ts` | **New.** A tiny per-hook store (subscribe, snapshot, open, finish) behind `useConfirmDialog` |
| `apps/web/src/shared/ui/ConfirmDialog.tsx` | Rebuilt on `AlertDialog` |
| `apps/web/src/shared/ui/useConfirmDialog.tsx` | Same API, plus a stable host component reading the store |
| `apps/web/src/shared/ui/ConfirmDialog.test.tsx` | **New.** Tests through `useConfirmDialog` |
| `apps/web/src/shared/ui/Header.tsx` | Hairline bottom edge, Share `Button`, `--title-width` |
| `apps/web/src/shared/components/Favicon.tsx` | `--favicon-size` |
| `apps/web/src/shared/components/ProtectedRoute.tsx` | `Spinner` |
| `apps/web/src/features/billing/components/PlanCard.tsx` | **New.** One plan card on `Card` |
| `apps/web/src/features/billing/components/BillingPage.tsx` | Uses `PlanCard`, `Card` and `Button` |
| `apps/web/src/features/audio/components/AudioPlayer.tsx`, `MiniAudioPlayer.tsx` | `Spinner`; drop the duplicate `accentColor` |
| `apps/web/src/features/feedback/components/FeedbackModal.tsx`, `AdminFeedbackPage.tsx` | Primitive typography; `Card`, `Button` and `text-xs` |
| `apps/web/src/features/legal/components/LegalPageShell.tsx` | `md:text-sm` |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | `MIGRATED`, `DropdownMenu` and brand-icon overrides, and the lower baseline |

---

### Task 1: ConfirmDialog on AlertDialog

**Files:**
- Create: `apps/web/src/shared/ui/confirmStore.ts`, `apps/web/src/shared/ui/ConfirmDialog.test.tsx`
- Modify: `apps/web/src/shared/ui/ConfirmDialog.tsx` (all of it), `apps/web/src/shared/ui/useConfirmDialog.tsx` (all of it)

- [ ] **Step 1: Write the failing test.** Create `apps/web/src/shared/ui/ConfirmDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useConfirmDialog } from "./useConfirmDialog";

function Harness({
  onResult,
  variant,
}: {
  onResult: (v: boolean) => void;
  variant?: "danger" | "default";
}) {
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          onResult(
            await confirm("Delete notebook?", "This can't be undone.", {
              confirmText: "Delete",
              variant,
            })
          )
        }
      >
        Open
      </button>
      <ConfirmDialogComponent />
    </>
  );
}

async function open(variant?: "danger" | "default") {
  const onResult = vi.fn();
  const user = userEvent.setup();
  render(<Harness onResult={onResult} variant={variant} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Delete notebook?" });
  return { onResult, user, dialog };
}

describe("useConfirmDialog", () => {
  it("shows an alert dialog with the title and message", async () => {
    const { dialog } = await open();
    expect(dialog).toHaveAccessibleDescription("This can't be undone.");
  });

  it("resolves true on confirm", async () => {
    const { onResult, user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it("resolves false on cancel", async () => {
    const { onResult, user } = await open();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it("resolves false on Escape and returns focus to the opener", async () => {
    const { onResult, user } = await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toHaveFocus());
  });

  it("uses the destructive button for danger", async () => {
    await open("danger");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive"
    );
  });
});
```

- [ ] **Step 2: Run the test and see it fail.**
  - Run: `bunx vitest run --root apps/web src/shared/ui/ConfirmDialog.test.tsx`
  - Expected: FAIL. Escape doesn't close the hand-rolled dialog, focus doesn't return, and there's no `data-variant`.

- [ ] **Step 3: Create the store** at `apps/web/src/shared/ui/confirmStore.ts`:

```ts
import type { ReactNode } from "react";

export type ConfirmVariant = "danger" | "default";

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant: ConfirmVariant;
}

const CLOSED: ConfirmState = { isOpen: false, title: "", message: "", variant: "default" };

/**
 * One confirm dialog's state, outside React so the host component can stay mounted across
 * open/close (Radix then plays the close animation and returns focus).
 */
export function createConfirmStore() {
  let state = CLOSED;
  let resolve: ((result: boolean) => void) | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ConfirmState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    open(next: Omit<ConfirmState, "isOpen">, onResult: (result: boolean) => void) {
      // A second confirm while one is open cancels the first.
      resolve?.(false);
      resolve = onResult;
      set({ ...next, isOpen: true });
    },
    finish(result: boolean) {
      const done = resolve;
      resolve = null;
      // Keep title and message so the closing animation still shows them.
      set({ ...state, isOpen: false });
      done?.(result);
    },
  };
}

export type ConfirmStore = ReturnType<typeof createConfirmStore>;
```

- [ ] **Step 4: Rewrite `ConfirmDialog.tsx`:**

```tsx
import type React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import type { ConfirmVariant } from "./confirmStore";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        // Escape and Cancel close through here; Confirm resolves first, so this is then a no-op.
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {typeof message === "string" ? (
            <AlertDialogDescription>{message}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription asChild>
              <div>{message}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant === "danger" ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Rewrite `useConfirmDialog.tsx`.** The API stays the same:

```tsx
import React from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { type ConfirmVariant, createConfirmStore } from "./confirmStore";

export const useConfirmDialog = () => {
  const [store] = React.useState(createConfirmStore);

  const confirm = React.useCallback(
    (
      title: string,
      message: React.ReactNode,
      options?: { confirmText?: string; cancelText?: string; variant?: ConfirmVariant }
    ): Promise<boolean> =>
      new Promise((resolve) => {
        store.open(
          {
            title,
            message,
            confirmText: options?.confirmText,
            cancelText: options?.cancelText,
            variant: options?.variant ?? "default",
          },
          resolve
        );
      }),
    [store]
  );

  // A stable component type: the dialog stays mounted between confirms, so Radix animates the
  // close and returns focus to the element that opened it.
  const ConfirmDialogComponent = React.useMemo(
    () =>
      function ConfirmDialogHost() {
        const state = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
        return (
          <ConfirmDialog
            isOpen={state.isOpen}
            title={state.title}
            message={state.message}
            confirmText={state.confirmText}
            cancelText={state.cancelText}
            variant={state.variant}
            onConfirm={() => store.finish(true)}
            onCancel={() => store.finish(false)}
          />
        );
      },
    [store]
  );

  return { confirm, ConfirmDialogComponent };
};
```

- [ ] **Step 6: Check that no caller passes `variant: "warning"`.**
  - Run: `grep -rn 'variant: "warning"' apps/web/src --include=*.tsx`
  - Expected: no output.

- [ ] **Step 7: Run the test and see it pass.**
  - Run: `bunx vitest run --root apps/web src/shared/ui/ConfirmDialog.test.tsx src/features/billing src/features/notebooks src/features/sources`
  - Expected: all pass.

- [ ] **Step 8: Commit.**

```bash
git add apps/web/src/shared/ui/confirmStore.ts apps/web/src/shared/ui/ConfirmDialog.tsx apps/web/src/shared/ui/useConfirmDialog.tsx apps/web/src/shared/ui/ConfirmDialog.test.tsx
git commit -m "refactor(web): ConfirmDialog on the AlertDialog primitive"
```

### Task 2: App header

**Files:** Modify `apps/web/src/shared/ui/Header.tsx`, around lines 112, 155–165 and 186–196.

- [ ] **Step 1: The bottom edge.** Line 112: change `border-b-2 border-border` to `border-b border-border`.

- [ ] **Step 2: The title input.** Replace the inline width and the permanent `border-primary`:

```tsx
                style={{ "--title-width": `${Math.max(100, inputWidth)}px` } as React.CSSProperties}
                className="w-(--title-width) min-w-0 border-b border-border bg-transparent p-0 font-display text-lg font-bold tracking-tight text-foreground outline-none focus:border-primary"
```

- [ ] **Step 3: The Share button.** Replace the hand-rolled `<button … className="px-3 py-1.5 … border border-border …">` with:

```tsx
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onShare}
            title="Share notebook"
            className="shrink-0"
          >
            <Share2 aria-hidden />
            <span className="hidden sm:inline">Share</span>
          </Button>
```

Add `import { Button } from "@/shared/components/ui/button";`.

- [ ] **Step 4: Verify.**
  - Run: `bunx vitest run --root apps/web src/shared/ui/Header.test.tsx`
  - Run: `cd apps/web && bunx eslint src/shared/ui/Header.tsx`
  - Expected: the tests pass, and there are no findings for `Header.tsx`.

- [ ] **Step 5: Commit** with `refactor(web): app header on the design system`.

### Task 3: Favicon, ProtectedRoute and brand icons

**Files:**
- Modify: `apps/web/src/shared/components/Favicon.tsx:44-54`
- Modify: `apps/web/src/shared/components/ProtectedRoute.tsx:86,96`
- Modify: `apps/web/eslint.config.mjs`

- [ ] **Step 1: Favicon.** Replace the `className` and `style` on the `<img>` with:

```tsx
      className={`inline-block size-(--favicon-size) max-h-(--favicon-size) max-w-(--favicon-size) shrink-0 self-start ${fit === "cover" ? "object-cover" : "object-contain"} ${className}`}
      style={{ "--favicon-size": `${size}px` } as React.CSSProperties}
```

Import `type React` if it isn't already imported, using `import type React from "react"` next to the existing imports.

- [ ] **Step 2: ProtectedRoute.** Replace both `<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />` with `<Spinner className="size-8 text-primary" aria-hidden />`. The visible "Loading..." and "Opening notebook…" text stays. Then add `import { Spinner } from "@/shared/components/ui/spinner";`.

- [ ] **Step 3: The brand icon exception.** In `apps/web/eslint.config.mjs`, append this to the exported config array, after the `field.tsx` and `input-group.tsx` override:

```js
  // Company logos keep their real brand colours, as the persisted cover swatches do; every other
  // rule still applies to this file.
  {
    files: ["src/shared/components/icons/ModelBrandIcon.tsx"],
    rules: { "shadcn/no-raw-colors": "off" },
  },
```

- [ ] **Step 4: Verify.**
  - Run: `cd apps/web && bunx eslint src/shared/components`
  - Expected: no findings outside `src/shared/components/ui`.

- [ ] **Step 5: Commit** with `refactor(web): favicon, route loading and brand icons on the design system`.

### Task 4: Billing page

**Files:**
- Create: `apps/web/src/features/billing/components/PlanCard.tsx`
- Modify: `apps/web/src/features/billing/components/BillingPage.tsx:117-342`

- [ ] **Step 1: Create `PlanCard.tsx`:**

```tsx
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

interface PlanCardProps {
  title: string;
  subtitle: string;
  /** The amount, e.g. "$7.50"; rendered before a muted "/month". */
  price: string;
  priceNote?: string;
  action: ReactNode;
  featuresLabel: string;
  features: readonly string[];
  /** Lifts the card and tints the checks: the plan we recommend. */
  highlighted?: boolean;
  /** Tints the checks without lifting the card. */
  proChecks?: boolean;
  badge?: string;
}

export function PlanCard({
  title,
  subtitle,
  price,
  priceNote,
  action,
  featuresLabel,
  features,
  highlighted = false,
  proChecks = highlighted,
  badge,
}: PlanCardProps) {
  return (
    <div className="relative h-full">
      {badge && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
          <Badge>{badge}</Badge>
        </div>
      )}
      <Card variant={highlighted ? "elevated" : "default"} className="h-full">
        <CardHeader>
          <h3 className="font-display text-2xl font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-6">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-5xl font-bold text-foreground">
              {price}
              <span className="text-lg font-normal text-muted-foreground">/month</span>
            </p>
            {priceNote && <p className="text-sm text-muted-foreground">{priceNote}</p>}
          </div>
          {action}
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {featuresLabel}
            </p>
            <ul className="flex flex-col gap-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-5 shrink-0",
                      proChecks ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: The current-plan block.** In `BillingPage.tsx`, replace it:
  - `<div className="bg-card border-2 border-border rounded-xl p-8">` becomes `<Card><CardContent>…</CardContent></Card>`, with the same inner content.
  - `text-orange-500` becomes `text-warning`.
  - The Cancel button becomes:

```tsx
                    <Button variant="outline" onClick={handleCancel} className="mt-6">
                      Cancel Subscription
                    </Button>
```

- [ ] **Step 3: The native free-plan summary.** Change `<div className="mb-12 max-w-md mx-auto bg-card border-2 border-border rounded-xl p-8">` to `<Card className="mx-auto mb-12 max-w-md"><CardContent>…</CardContent></Card>`, with the same inner content.

- [ ] **Step 4: The pricing grid.** Replace the three hand-built cards with `PlanCard`. Keep every visible string: "Free", "Get started today" or "Your previous plan", "$0", "Current Plan", "Downgrade", "Yearly", "Best value – billed once per year", "$7.50", "($90/year)", "Save 50%", "Monthly", "Billed every month", "$15", "Get Started", "Switch to Yearly" or "Switch to Monthly", "Included:" and "Everything included:".

```tsx
              <div className="mb-12 grid gap-8 lg:grid-cols-3">
                <PlanCard
                  title="Free"
                  subtitle={status?.hasSubscription ? "Your previous plan" : "Get started today"}
                  price="$0"
                  featuresLabel="Included:"
                  features={freeFeatures}
                  action={
                    status?.hasSubscription ? (
                      <Button variant="outline" size="lg" onClick={onBack} className="w-full">
                        Downgrade
                      </Button>
                    ) : (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    )
                  }
                />
                <PlanCard
                  title="Yearly"
                  subtitle="Best value – billed once per year"
                  price="$7.50"
                  priceNote="($90/year)"
                  badge="Save 50%"
                  highlighted
                  featuresLabel="Everything included:"
                  features={proFeatures}
                  action={
                    status?.hasSubscription && status.interval === "year" ? (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={() =>
                          status?.hasSubscription ? handleManagePlan() : handleUpgrade("year")
                        }
                        className="w-full"
                      >
                        {status?.hasSubscription ? "Switch to Yearly" : "Get Started"}
                      </Button>
                    )
                  }
                />
                <PlanCard
                  title="Monthly"
                  subtitle="Billed every month"
                  price="$15"
                  proChecks
                  featuresLabel="Everything included:"
                  features={proFeatures}
                  action={
                    status?.hasSubscription && status.interval === "month" ? (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={() =>
                          status?.hasSubscription ? handleManagePlan() : handleUpgrade("month")
                        }
                        className="w-full"
                      >
                        {status?.hasSubscription ? "Switch to Monthly" : "Get Started"}
                      </Button>
                    )
                  }
                />
              </div>
```

  Then add the imports: `Button`, `Card` and `CardContent`, and `PlanCard` from `./PlanCard`. Remove `Check` only if it is no longer used in the file.

- [ ] **Step 5: Verify.**
  - Run: `bunx vitest run --root apps/web src/features/billing`
  - Run: `cd apps/web && bunx eslint src/features/billing`
  - Expected: the tests pass and there are 0 findings.

- [ ] **Step 6: Commit** with `refactor(billing): plan cards and actions on the design system`.

### Task 5: Audio players

**Files:** Modify `apps/web/src/features/audio/components/AudioPlayer.tsx:62,107` and `MiniAudioPlayer.tsx:68,137`.

- [ ] **Step 1: The spinners.** Replace them:
  - `AudioPlayer`: `<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>` becomes `<Spinner className="mx-auto mb-2 size-8 text-primary" aria-hidden />`.
  - `MiniAudioPlayer`: the `h-6 w-6 … mb-1` spinner becomes `<Spinner className="mx-auto mb-1 size-6 text-primary" aria-hidden />`.
  - Both files: add `import { Spinner } from "@/shared/components/ui/spinner";`.

- [ ] **Step 2: The range inputs.** Delete `style={{ accentColor: "hsl(var(--primary))" }}` from both. Their `accent-primary` class already sets the same colour.

- [ ] **Step 3: Verify.**
  - Run: `bunx vitest run --root apps/web src/features/audio`
  - Run: `cd apps/web && bunx eslint src/features/audio`
  - Expected: the tests pass and there are 0 findings.

- [ ] **Step 4: Commit** with `refactor(audio): spinner primitive and no inline accent`.

### Task 6: Feedback and legal

**Files:**
- Modify: `apps/web/src/features/feedback/components/FeedbackModal.tsx:75,113-116`
- Modify: `AdminFeedbackPage.tsx:47-90`
- Modify: `apps/web/src/features/legal/components/LegalPageShell.tsx:47`

- [ ] **Step 1: The FeedbackModal title.** Change `<DialogTitle className="font-display font-bold">Send feedback</DialogTitle>` to `<DialogTitle>Send feedback</DialogTitle>`.

- [ ] **Step 2: The FeedbackModal detail label.** Replace it with:

```tsx
          <Label htmlFor="feedback-detail">
            {isBug ? "Steps to reproduce" : "Why / what for?"}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
```

- [ ] **Step 3: The AdminFeedbackPage list.** Make three changes:
  - The list becomes `<Card variant="flush"><ul className="divide-y divide-border/60">…</ul></Card>`.
  - The type tag's `text-[11px]` becomes `text-xs`.
  - The "Open GitHub issue" `<button … border border-border …>` becomes:

```tsx
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={busyId === r.id}
                  onClick={() => onCreateIssue(r.id)}
                  className="shrink-0"
                >
                  {busyId === r.id ? "Creating…" : "Open GitHub issue"}
                </Button>
```

  Then import `Button` and `Card`.

- [ ] **Step 4: The legal shell.** Change `md:text-[15px]` to `md:text-sm`.

- [ ] **Step 5: Verify.**
  - Run: `bunx vitest run --root apps/web src/features/feedback src/features/legal`
  - Run: `cd apps/web && bunx eslint src/features/feedback src/features/legal`
  - Expected: the tests pass and there are 0 findings.

- [ ] **Step 6: Commit** with `refactor(web): feedback and legal on the design system`.

### Task 7: Enforcement

**Files:** Modify `apps/web/eslint.config.mjs` and `apps/web/design-lint-baseline.json`.

- [ ] **Step 1: Extend `MIGRATED`:**

```js
  "src/shared/ui/**/*.tsx",
  "src/shared/components/*.tsx",
  "src/shared/components/icons/**/*.tsx",
  "src/features/billing/**/*.tsx",
  "src/features/audio/**/*.tsx",
  "src/features/feedback/**/*.tsx",
  "src/features/legal/**/*.tsx",
```

  Then, after the `{ files: MIGRATED, rules: rules("error") }` entry, add:

```js
  // Legacy hand-rolled menu, used only by Studio literature views; #264 replaces it with the shadcn
  // DropdownMenu and deletes it.
  { files: ["src/shared/ui/DropdownMenu.tsx"], rules: rules("warn") },
```

- [ ] **Step 2: Lower the baseline.**
  - Run: `bun run lint:design:update`
  - Expected:
    - `features/audio`, `features/billing`, `features/feedback` and `features/legal` disappear.
    - `shared` keeps only the upstream `ui/*` warnings plus `DropdownMenu.tsx`'s 2.

- [ ] **Step 3: Run the gates.**
  - Run: `bun run typecheck:web && bun run typecheck:convex && bun run lint && bun run lint:design && bun run test:web`
  - Run: `bunx playwright test --list`
  - Expected: all pass, and Playwright parses.

- [ ] **Step 4: Commit** with `chore(web): enforce design lint on the shared shell and stragglers`.

### Task 8: Visual check and PR

- [ ] **Step 1: Check each screen in the browser pane.** Use desktop and 375px widths, in light and dark:
  - the billing page;
  - the notebook header (title editing and Share);
  - a delete confirmation from a notebook card;
  - the audio player;
  - the feedback modal;
  - a legal page.

  If the highlighted Yearly card doesn't stand out with `elevated`, add this variant to `card.tsx` and use it in `PlanCard`:

```ts
        // The recommended option in a set (pricing): a soft primary ring and a deeper shadow.
        featured: "shadow-lg shadow-primary/10 ring-2 ring-primary/40",
```

- [ ] **Step 2: Push and open a PR.** Title it `feat(web): shared shell on the design system`, add `Closes #262`, and list what is out of scope: the upstream `ui/*` warnings, which get their own PR, and the legacy `DropdownMenu`, which moves with #264.
