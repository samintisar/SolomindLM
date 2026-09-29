# Migrate Auth + Onboarding to the Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `apps/web/src/features/auth` and `apps/web/src/features/onboarding` on the shadcn component layer and motion primitives, so they pass `@shadcn/lint` at error level and feel premium — the first screens App Store reviewers and new users see.

**Architecture:** Component-by-component rewrite that preserves every visible string, placeholder, accessible name and flow (the e2e specs select on them). Hard-coded colors become tokens under the existing `.auth-form-light` light pin; hand-built buttons/inputs/overlays/menus become `Button`/`Input`/`InputGroup`/`Dialog`/`DropdownMenu`/`Popover`; entrances use `Reveal`. The two dirs join `MIGRATED` (lint errors) and the baseline drops.

**Tech Stack:** React 19, Tailwind v4, shadcn/ui (radix), `motion/react` primitives in `@/shared/components/motion`, `@shadcn/lint` ratchet (`bun run lint:design`).

**Spec:** `docs/superpowers/specs/2026-09-28-design-system-foundation-design.md` (§5 feature migrations).
**Depends on:** #225 (`feature/design-lint`). Branch `feature/ds-migrate-auth` is stacked on it; retarget the PR to `main` after #225 merges.

---

## Ground rules for every task

- Work in `C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb` on `feature/ds-migrate-auth`. Never switch branches or stash.
- **Keep all user-visible text, placeholders, `aria-label`s, headings and link names byte-identical** unless a step says otherwise.
- Pages place components: `className` on a shadcn component may only carry layout (margin, width/height, flex/grid placement, position, visibility, `sr-only`). No colors, padding, typography, radius, shadow or motion on components — use variants. Native elements (`div`, `span`, `h2`, `Link`) can be styled with tokens.
- Use `cn()` for conditional classes (no template-literal classNames). `gap-*` not `space-y-*`. `size-N` not `h-N w-N`. Icons inside `Button`/menu items get no size classes unless intentionally non-16px (`size-5`).
- Check a file with `cd apps/web && bunx eslint <file>`; each finding's message says the fix.
- Before each commit: `bunx biome format --write <changed files>` (Serena/Python edits can leave CRLF). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `apps/web/src/index.css` | `--ease-spring` token; complete `.auth-form-light` light pin; `bg-auth-glow` utility |
| `apps/web/src/shared/components/ui/card.tsx` | `cva` with `default` / `elevated` variants |
| `apps/web/src/features/auth/components/GoogleIcon.tsx` | New — brand-color logo (documented lint exception) |
| `apps/web/src/features/auth/components/AuthFormPanel.tsx` | Card + Field + Input/InputGroup + Button + Alert + Spinner; `chrome` prop |
| `apps/web/src/features/auth/components/AuthModal.tsx` | shadcn `Dialog` |
| `apps/web/src/features/auth/AuthPage.tsx` | Tokens, flex layout, `Reveal` entrance, hero mockup fixes |
| `apps/web/src/features/auth/components/AvatarDropdown.tsx` | Owns a shadcn `DropdownMenu` (trigger + content) |
| `apps/web/src/features/auth/components/LanguageSelector.tsx` | `DropdownMenuSub` + `DropdownMenuRadioGroup` |
| `apps/web/src/shared/ui/Header.tsx` | Render `<AvatarDropdown>` directly (drop custom `DropdownMenu` wrapper) |
| `e2e/auth/sign-out.spec.ts` | Locate avatar trigger by role/name |
| `apps/web/src/features/onboarding/components/ChecklistCard.tsx`, `ChecklistItem.tsx` | Button icon actions, `cn`, entrance motion |
| `apps/web/src/features/onboarding/components/TourTooltip.tsx` | `Popover` with virtual anchor; SVG classes |
| `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json` | Add dirs to `MIGRATED`; lower baseline |

---

### Task 1: Tokens, light pin, glow utility

**Files:** Modify `apps/web/src/index.css`

- [ ] **Step 1:** In the non-inline `@theme { --ease-out: …; --ease-in-out: …; … }` block, add:

```css
  --ease-spring: cubic-bezier(0.34, 1.2, 0.64, 1);
```

- [ ] **Step 2:** Complete the `.auth-form-light` pin (it keeps auth/landing surfaces light under a `.dark` ancestor but misses tokens the hero preview uses). Add these declarations inside `.auth-form-light { … }`, copying each value **exactly from the `:root` block** (light theme):
`--popover`, `--popover-foreground`, `--secondary`, `--secondary-foreground`, `--input`, `--shadow-2xs`, `--shadow-xs`, `--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`.

- [ ] **Step 3:** After the `@theme inline { … }` block, add:

```css
/* Soft brand glow behind the sign-in page (decorative; token-derived). */
@utility bg-auth-glow {
  background-image:
    radial-gradient(
      ellipse 80% 50% at 50% -20%,
      color-mix(in oklch, var(--primary) 12%, transparent),
      transparent
    ),
    radial-gradient(
      ellipse 60% 40% at 100% 50%,
      color-mix(in oklch, var(--success) 8%, transparent),
      transparent
    );
}
```

- [ ] **Step 4: Verify** `bun run --cwd apps/web test src/test/web/tokenContrast.test.ts` (still passes, incl. auth scope) and `bun run --cwd apps/web build` succeeds; `grep -c "ease-spring\|bg-auth-glow" apps/web/dist/assets/*.css` is 0 (unused until later tasks — Tailwind emits on use) — just confirm the build has no CSS error. Revert build-touched tracked files (`git checkout -- apps/web/public/sitemap.xml`).

- [ ] **Step 5: Commit** `feat(web): spring easing token, complete auth light pin, auth glow utility`.

### Task 2: Card `elevated` variant

**Files:** Modify `apps/web/src/shared/components/ui/card.tsx`

- [ ] **Step 1:** Replace the `Card` function with a `cva`-based version (keep all other exports unchanged):

```tsx
import { cva, type VariantProps } from "class-variance-authority";

const cardVariants = cva("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground", {
  variants: {
    variant: {
      default: "shadow-sm",
      elevated: "rounded-2xl border-border/90 bg-card/90 shadow-lg shadow-primary/5 backdrop-blur-sm",
    },
  },
  defaultVariants: { variant: "default" },
});

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant ?? "default"}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}
```

(Do not export `cardVariants` — it would trigger Biome's `useComponentExportOnlyModules`.)

- [ ] **Step 2:** `bun run typecheck:web`; `cd apps/web && bunx eslint src/shared/components/ui/card.tsx` → 0 errors. Commit `feat(web): elevated Card variant`.

### Task 3: Sign-in form (`AuthFormPanel`) + Google icon

**Files:** Create `apps/web/src/features/auth/components/GoogleIcon.tsx`; Modify `apps/web/src/features/auth/components/AuthFormPanel.tsx`

- [ ] **Step 1: Google icon** — brand colors are mandated by Google's sign-in branding guidelines, so this is the one documented lint exception:

```tsx
/** Google "G" logo. Brand colors are required by Google's sign-in branding guidelines. */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      {/* eslint-disable shadcn/no-raw-colors -- Google brand colors (sign-in branding guidelines) */}
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
      {/* eslint-enable shadcn/no-raw-colors */}
    </svg>
  );
}
```

Verify the disable works: `cd apps/web && bunx eslint src/features/auth/components/GoogleIcon.tsx` → 0 findings. If ESLint doesn't honor JSX block comments here, switch to `// eslint-disable-next-line …` lines inside a `{}` expression per path, or move the four `fill` values into a `const GOOGLE = { blue: "#4285F4", … }` object annotated with one `// eslint-disable-next-line`; report which.

- [ ] **Step 2: Rewrite `AuthFormPanelContent`'s render.** Keep all handlers/state/`modalTitle`/`disableAll`/`AuthFormPanelWithConvexAuth`/`AuthFormPanel` unchanged. Delete `inputClass`, `btnPrimary`, `btnOutline`. Add a `chrome?: "card" | "none"` prop to `AuthFormPanelProps` (default `"card"`; doc comment: `"none"` renders without the card when a parent — e.g. the auth dialog — provides the surface). Add `const id = useId();` for input ids. Imports:

```tsx
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/components/ui/input-group";
import { Separator } from "@/shared/components/ui/separator";
import { Spinner } from "@/shared/components/ui/spinner";
import { cn } from "@/shared/utils/cn";
import { GoogleIcon } from "./GoogleIcon";
```

Define two small local helpers above `AuthFormPanelContent` (same file):

```tsx
function PasswordField(props: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  autoComplete: string;
  shown: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id} className="sr-only">
        {props.label}
      </FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={props.id}
          name={props.name}
          type={props.shown ? "text" : "password"}
          autoComplete={props.autoComplete}
          required
          placeholder={props.placeholder}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            onClick={props.onToggle}
            aria-label={props.shown ? props.hideLabel : props.showLabel}
          >
            {props.shown ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

/** Spinner shows only for the password action; `disabled` also covers an in-flight Google sign-in. */
function SubmitButton(props: {
  loading: boolean;
  disabled: boolean;
  loadingLabel: string;
  label: string;
}) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={props.disabled}>
      {props.loading ? <Spinner data-icon="inline-start" /> : null}
      {props.loading ? props.loadingLabel : props.label}
    </Button>
  );
}
```

(Confirm `InputGroupAddon`'s `align` values and `InputGroupButton`'s `size` values in `input-group.tsx`; use the icon size that exists.)

Then the render (replace everything from `return (` in `AuthFormPanelContent` to its end):

```tsx
  const content = (
    <div className="flex flex-col gap-6">
      <h2 className="text-center font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {modalTitle}
      </h2>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "signIn" || step === "signUp" ? (
        <div className="flex flex-col gap-5">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={disableAll}
          >
            {googleLoading ? <Spinner data-icon="inline-start" /> : <GoogleIcon className="size-5" />}
            {googleLoading ? "Connecting…" : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="font-sans text-sm font-medium tracking-wide text-muted-foreground">
              Or continue with email
            </span>
            <Separator className="flex-1" />
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleEmailPasswordSubmit}>
            <Field>
              <FieldLabel htmlFor={`${id}-email`} className="sr-only">
                Email
              </FieldLabel>
              <Input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email"
              />
            </Field>
            <PasswordField
              id={`${id}-password`}
              name="password"
              label="Password"
              placeholder="Password"
              autoComplete={step === "signUp" ? "new-password" : "current-password"}
              shown={showAuthPassword}
              onToggle={() => setShowAuthPassword((v) => !v)}
              showLabel="Show password"
              hideLabel="Hide password"
            />
            <input name="flow" type="hidden" value={step === "signUp" ? "signUp" : "signIn"} />
            <SubmitButton
              loading={passwordLoading}
              disabled={disableAll}
              loadingLabel="Please wait…"
              label={step === "signUp" ? "Create account" : "Continue with email"}
            />
          </form>

          <div className="flex flex-col items-center gap-1">
            {step === "signIn" ? (
              <>
                <Button type="button" variant="link" size="sm" onClick={() => { setError(""); setStep("signUp"); }}>
                  Create an account
                </Button>
                <Button type="button" variant="link" size="sm" onClick={() => { setError(""); setStep("forgot"); }}>
                  Forgot password?
                </Button>
              </>
            ) : (
              <Button type="button" variant="link" size="sm" onClick={() => { setError(""); setStep("signIn"); }}>
                Already have an account? Sign in
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {typeof step === "object" && step.kind === "emailVerification" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            We sent an 8-digit code to <span className="font-medium text-foreground">{step.email}</span>.
            Enter it below to continue.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleEmailVerificationSubmit}>
            <input name="email" type="hidden" value={step.email} />
            <input name="flow" type="hidden" value="email-verification" />
            <Field>
              <FieldLabel htmlFor={`${id}-code`} className="sr-only">
                Verification code
              </FieldLabel>
              <Input
                id={`${id}-code`}
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                placeholder="Verification code"
              />
            </Field>
            <SubmitButton loading={passwordLoading} disabled={disableAll} loadingLabel="Verifying…" label="Verify and continue" />
          </form>
          <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setError(""); setStep("signIn"); }}>
            Back to sign in
          </Button>
        </div>
      ) : null}

      {step === "forgot" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Enter your email and we will send you a code to reset your password.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleForgotSubmit}>
            <Field>
              <FieldLabel htmlFor={`${id}-reset-email`} className="sr-only">
                Email
              </FieldLabel>
              <Input
                id={`${id}-reset-email`}
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Email"
              />
            </Field>
            <input name="flow" type="hidden" value="reset" />
            <SubmitButton loading={passwordLoading} disabled={disableAll} loadingLabel="Sending…" label="Send code" />
          </form>
          <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setError(""); setStep("signIn"); }}>
            Back to sign in
          </Button>
        </div>
      ) : null}

      {typeof step === "object" && step.kind === "resetVerification" ? (
        <div className="flex flex-col gap-5">
          <p className="font-sans text-sm leading-relaxed text-muted-foreground">
            Enter the code we sent to <span className="font-medium text-foreground">{step.email}</span>{" "}
            and choose a new password.
          </p>
          <form className="flex flex-col gap-3" onSubmit={handleResetVerificationSubmit}>
            <input name="email" type="hidden" value={step.email} />
            <input name="flow" type="hidden" value="reset-verification" />
            <Field>
              <FieldLabel htmlFor={`${id}-reset-code`} className="sr-only">
                Reset code
              </FieldLabel>
              <Input
                id={`${id}-reset-code`}
                name="code"
                type="text"
                inputMode="numeric"
                required
                placeholder="Reset code"
              />
            </Field>
            <PasswordField
              id={`${id}-new-password`}
              name="newPassword"
              label="New password"
              placeholder="New password"
              autoComplete="new-password"
              shown={showNewPassword}
              onToggle={() => setShowNewPassword((v) => !v)}
              showLabel="Show new password"
              hideLabel="Hide new password"
            />
            <SubmitButton loading={passwordLoading} disabled={disableAll} loadingLabel="Updating…" label="Update password" />
          </form>
          <Button type="button" variant="link" size="sm" className="self-center" onClick={() => { setError(""); setStep("forgot"); }}>
            Resend code
          </Button>
        </div>
      ) : null}

      {step === "signIn" || step === "signUp" ? (
        <>
          <Separator />
          <p className="text-center font-sans text-sm text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline-offset-2 hover:text-foreground hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline-offset-2 hover:text-foreground hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      ) : null}
    </div>
  );

  if (chrome === "none") {
    return <div className={cn("auth-form-light", className)}>{content}</div>;
  }
  return (
    <Card variant="elevated" className={cn("auth-form-light", className)}>
      <CardContent>{content}</CardContent>
    </Card>
  );
```

Notes: the error box keeps `role="alert"` via `Alert` (verify `alert.tsx` renders `role="alert"`; e2e uses `.auth-form-light >> role=alert`). Keep the email-verification copy exactly: "We sent an 8-digit code to {email}. Enter it below to continue." (verify the rendered text matches the old rendering, including spacing around the email).

- [ ] **Step 3: Verify.** `cd apps/web && bunx eslint src/features/auth/components/AuthFormPanel.tsx src/features/auth/components/GoogleIcon.tsx` → 0 findings. `bun run typecheck:web`. `bun run test:web` (fix only tests that break because of markup changes, keeping their intent). Commit `feat(auth): rebuild sign-in form on shadcn components`.

### Task 4: Auth dialog

**Files:** Modify `apps/web/src/features/auth/components/AuthModal.tsx`

- [ ] **Step 1:** Replace the file:

```tsx
import { type AuthFormInitialMode, AuthFormPanel } from "@/features/auth/components/AuthFormPanel";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  initialMode?: AuthFormInitialMode;
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthenticated,
  initialMode = "signIn",
}: AuthModalProps) {
  const handleAuthenticated = () => {
    onAuthenticated();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        aria-describedby={undefined}
        className="auth-form-light max-h-full overflow-y-auto sm:max-w-md"
      >
        <DialogTitle className="sr-only">Sign in or create account</DialogTitle>
        <AuthFormPanel
          key={initialMode}
          chrome="none"
          initialMode={initialMode}
          onAuthenticated={handleAuthenticated}
        />
      </DialogContent>
    </Dialog>
  );
}
```

(Radix handles Escape, overlay click, focus trap, scroll lock and the close button — the manual keydown listener and portal go away.) If `bunx eslint` flags any DialogContent class, replace with the suggested on-scale class or drop it; `max-h-full` keeps tall forms scrollable on small screens.

- [ ] **Step 2:** Check the 5 hosts (`features/landing/{LandingPage,FaqPage,IntentLandingPage,ClusterHubLandingPage,SeoContentPage}.tsx`) still compile unchanged. `bun run typecheck:web`; eslint on the file → 0. Commit `feat(auth): auth modal on shadcn Dialog`.

### Task 5: Sign-in page and hero preview

**Files:** Modify `apps/web/src/features/auth/AuthPage.tsx`

- [ ] **Step 1: `AuthPage` render.** Add imports `Button` (`@/shared/components/ui/button`), `Spinner` (`@/shared/components/ui/spinner`), `Reveal` (`@/shared/components/motion`), `cn` (`@/shared/utils/cn`). Replace the returned JSX of `AuthPage` with:

```tsx
  return (
    <div className="auth-form-light flex min-h-screen flex-col bg-card text-foreground antialiased">
      <div className="pointer-events-none fixed inset-0 bg-auth-glow opacity-40" aria-hidden />

      <header className="relative z-1 flex shrink-0 items-center justify-between px-6 py-5 sm:px-10">
        {nativeShell ? (
          <div className="flex items-center gap-2.5 text-foreground">
            <img src="/SolomindLM_logo.png" alt="SolomindLM" className="size-8 object-contain" />
            <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
          </div>
        ) : (
          <>
            <Link
              to="/"
              className="flex items-center gap-2.5 text-foreground transition hover:opacity-80"
              aria-label="SolomindLM home"
            >
              <img src="/SolomindLM_logo.png" alt="SolomindLM" className="size-8 object-contain" />
              <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to home</Link>
            </Button>
          </>
        )}
      </header>

      <main className="chat-panel-graph-grid relative z-1 flex min-h-0 flex-1 flex-col justify-center overflow-y-auto bg-card px-6 py-10 sm:px-10 sm:py-12">
        <div
          className={cn(
            "mx-auto flex w-full flex-col",
            nativeShell
              ? "max-w-lg gap-8 py-4"
              : "max-w-7xl -translate-y-4 gap-12 sm:-translate-y-6 lg:-translate-y-10 lg:flex-row lg:items-stretch lg:gap-10 xl:gap-14 2xl:max-w-360"
          )}
        >
          <div className="flex w-full justify-center lg:h-full lg:min-h-0 lg:w-lg lg:shrink-0 lg:justify-end">
            <div className="flex w-full max-w-lg flex-col lg:h-full lg:min-h-0">
              <div className="flex w-full flex-col items-center lg:h-full lg:min-h-0 lg:justify-center">
                <div className="w-full">
                  {!nativeShell && (
                    <Reveal className="relative z-10 px-2 text-center sm:px-0 lg:pointer-events-none">
                      <h1 className="mx-auto text-balance font-serif text-4xl font-normal leading-tight tracking-tight text-foreground sm:text-5xl">
                        Think deeper,
                        <br />
                        learn faster.
                      </h1>
                      <p className="mx-auto mt-3 max-w-md font-sans text-base text-muted-foreground sm:mt-4 sm:text-lg">
                        Ground your research in real sources.
                      </p>
                    </Reveal>
                  )}
                  <Reveal
                    delay={0.08}
                    className={nativeShell ? "relative z-0 mt-2" : "relative z-0 mt-10 lg:mt-8"}
                  >
                    <AuthFormPanel
                      authError={bannerMessage}
                      onAuthenticated={handleAuthenticated}
                      initialMode={initialMode}
                    />
                  </Reveal>
                </div>
              </div>
            </div>
          </div>

          {!nativeShell && (
            <Reveal
              delay={0.16}
              className="flex h-full min-h-0 w-full justify-center lg:min-h-200 lg:min-w-0 lg:flex-1 lg:justify-start"
            >
              <AuthHeroMockup />
            </Reveal>
          )}
        </div>
      </main>

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/85 backdrop-blur-sm">
          <Spinner className="size-9" />
        </div>
      )}
    </div>
  );
```

Rationale for layout changes: `lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]` → flex row with the form column `lg:w-lg lg:shrink-0` (32rem) and the hero `lg:flex-1 lg:min-w-0`; `lg:min-h-[min(93svh,65rem)]` → `lg:min-h-200`; `lg:text-[2.75rem]` dropped (keeps `sm:text-5xl`); `max-w-[18ch]` → `text-balance` (the `<br />` already sets the break).

- [ ] **Step 2: `AuthHeroMockup` fixes** (same file), by current line:

| Line | Old | New |
|---|---|---|
| 106 | `min-h-[min(93svh,65rem)]`, `shadow-[0_28px_90px_-28px_rgba(28,25,23,0.22)]` | `min-h-200`, `shadow-2xl` |
| 108–111 | `<div className="… chat-panel-graph-grid" style={{ backgroundColor: "color-mix(in oklch, var(--background) 88%, transparent)" }} />` | `<div className="pointer-events-none absolute inset-0 chat-panel-graph-grid bg-background/88" />` |
| 114–126 | Tab pill: container `flex h-11 w-[min(100%,17rem)] items-stretch gap-1 … shadow-[…]`, absolute indicator with `w-[calc(50%-6px)]`, `ease-[cubic-bezier(…)]` and inline `transform` | See code below |
| 134–136, 148–150 | template-literal `className` on tab buttons | `cn("relative z-10 row-start-1 flex items-center justify-center gap-2 rounded-xl font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", mode === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground")` (add `col-start-1` / `col-start-2` respectively) |
| 138, 152, 170, 204, 211, 214, 236, 326, 344 | `h-4 w-4` | `size-4` |
| 168 | `w-[min(38%,13.5rem)]` | `w-2/5 max-w-54` |
| 183–187 | template-literal className on source buttons | `cn(…)` with the same classes |
| 192 | `text-[11px]` | `text-xs` |
| 219–222, 352–355 | `style={{ backgroundColor: "var(--background)" }}` | remove `style`, add `bg-background` to `className` |
| 223, 230, 244 | `space-y-5` / `space-y-2` / `space-y-1.5` | `flex flex-col gap-5` / `flex flex-col gap-2` / `flex flex-col gap-1.5` |
| 225 | `max-w-[95%] … bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))]` | `max-w-11/12 … bg-primary/10` (if `max-w-11/12` is reported unknown, use `max-w-full`) |
| 239, 246, 250, 254 | template-literal / `h-3.5 w-3.5` | `cn(…)` / `size-3.5` |
| 263 | `prose … space-y-2` | drop `space-y-2` (prose already spaces paragraphs) |
| 272–273, 284–285 | template-literal className + `style={{ verticalAlign: "middle" }}` | `cn(citeBtnBase, "mx-1", refKey === 1 && "ring-2 ring-primary/55 ring-offset-2 ring-offset-background")`; remove `style` (`citeBtnBase` already has `align-middle`) |
| 100 | `citeBtnBase` has `h-5 w-5` | `size-5` |
| 315–317 | template-literal className | `cn(…, inputFlash && "ring-2 ring-primary/35")` |
| 323 | `h-9 w-9` | `size-9` |

Tab pill replacement (lines 113–156):

```tsx
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-5 sm:pt-6">
        <div
          className="pointer-events-auto relative grid h-11 w-full max-w-68 grid-cols-2 rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/90 to-muted/30 p-1 shadow-lg backdrop-blur-md"
          role="tablist"
          aria-label="Preview mode"
        >
          <div
            data-mode={mode}
            className="pointer-events-none col-start-1 row-start-1 rounded-xl bg-background/95 shadow-md ring-1 ring-primary/20 transition-transform duration-320 ease-spring data-[mode=studio]:translate-x-full"
            aria-hidden
          />
          {/* chat tab: col-start-1; studio tab: col-start-2 — both row-start-1, see table above */}
        </div>
      </div>
```

The indicator shares grid row 1 with the tabs, so it is exactly one column wide and `translate-x-full` moves it precisely onto the second tab (no gap between tabs, which is why `gap-1` is removed).

- [ ] **Step 3: Verify.** `cd apps/web && bunx eslint src/features/auth/AuthPage.tsx` → 0 findings (apply any on-scale suggestion the linter gives). `bun run typecheck:web`. Commit `feat(auth): tokenized sign-in page with staggered entrance`.

### Task 6: Avatar menu on shadcn DropdownMenu

**Files:** Modify `apps/web/src/features/auth/components/AvatarDropdown.tsx`, `LanguageSelector.tsx`, `apps/web/src/shared/ui/Header.tsx`, `e2e/auth/sign-out.spec.ts`

- [ ] **Step 1: `AvatarDropdown`** — same props, now renders the whole menu:

```tsx
import {
  ListChecks,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Moon,
  Sun,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useFeedback } from "../../feedback/FeedbackContext";
import { useIsFeedbackAdmin } from "../../feedback/services/feedbackApi";
import type { User } from "../useAuth";
import { LanguageSelector } from "./LanguageSelector";

// (keep the existing AvatarDropdownProps interface)

export const AvatarDropdown: React.FC<AvatarDropdownProps> = ({
  user,
  isAuthenticated,
  onLogin,
  onLogout,
  theme,
  toggleTheme,
  onShowChecklist,
  showChecklistDismissed,
}) => {
  const navigate = useNavigate();
  const { open: openFeedback } = useFeedback();
  // Only the "Feedback triage" item needs this, and it's staff-only — don't open
  // the subscription for signed-out menus.
  const isFeedbackAdmin = useIsFeedbackAdmin(isAuthenticated);
  const displayLabel = user?.email ?? user?.name ?? (isAuthenticated ? "Signed in" : null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon-sm" aria-label="Account menu">
          <UserIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isAuthenticated && displayLabel ? (
          <>
            <DropdownMenuLabel title={displayLabel}>
              <span className="block truncate">{displayLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </DropdownMenuItem>
          <LanguageSelector isAuthenticated={isAuthenticated} />
          {isAuthenticated && showChecklistDismissed && onShowChecklist ? (
            <DropdownMenuItem onSelect={onShowChecklist}>
              <ListChecks />
              Show getting-started checklist
            </DropdownMenuItem>
          ) : null}
          {isAuthenticated ? (
            <DropdownMenuItem onSelect={() => openFeedback("bug")}>
              <MessageSquarePlus />
              Send feedback
            </DropdownMenuItem>
          ) : null}
          {isAuthenticated && isFeedbackAdmin ? (
            <DropdownMenuItem onSelect={() => navigate("/admin/feedback")}>
              <Wrench />
              Feedback triage
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void (isAuthenticated ? onLogout() : onLogin())}>
          {isAuthenticated ? <LogOut /> : <LogIn />}
          {isAuthenticated ? "Logout" : "Login"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

(Check `onLogout`'s declared type; it's awaited today — keep `void` so a rejected promise isn't unhandled silently only if `signOut` already surfaces errors; otherwise wrap in the existing error pattern.)

- [ ] **Step 2: `LanguageSelector`** as a submenu (removes all `stopPropagation` hacks):

```tsx
import { Globe } from "lucide-react";
import type React from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { useOutputLanguage } from "../hooks/useOutputLanguage";

interface LanguageSelectorProps {
  isAuthenticated: boolean;
}

/** Output-language submenu; must render inside a DropdownMenuContent. */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isAuthenticated }) => {
  const { language, isLoading, setLanguage } = useOutputLanguage(isAuthenticated);
  if (!isAuthenticated) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Globe />
        Output language
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={language} onValueChange={(code) => setLanguage(code)}>
          {SUPPORTED_LANGUAGES.map((supported) => (
            <DropdownMenuRadioItem key={supported.code} value={supported.code} disabled={isLoading}>
              {supported.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
```

(If `setLanguage` takes a narrower code type, narrow with a lookup: `const match = SUPPORTED_LANGUAGES.find((l) => l.code === code); if (match) setLanguage(match.code);`. `grep -rn LanguageSelector apps/web/src` — if it's rendered anywhere outside the avatar menu, stop and report.)

- [ ] **Step 3: `Header.tsx`** — replace the `<DropdownMenu trigger={…} align="right"> <AvatarDropdown … /> </DropdownMenu>` block with just `<AvatarDropdown …same props… />`. Remove the `UserIcon` and custom `DropdownMenu` imports if now unused.

- [ ] **Step 4: e2e** — in `e2e/auth/sign-out.spec.ts`, replace both avatar locators

```ts
    const avatarButton = page
      .locator("header [class*='rounded-xl']")
      .filter({ has: page.locator("svg") })
      .first();
```

with

```ts
    const avatarButton = page.getByRole("button", { name: "Account menu" });
```

`grep -rn "rounded-xl']" e2e` for other copies and update them the same way.

- [ ] **Step 5: Verify.** eslint on the three source files → 0 errors (Header is in `shared`, warn-level; make sure its count doesn't go up). `bun run typecheck:web`, `bun run test:web`. Commit `feat(auth): account menu on shadcn DropdownMenu`.

### Task 7: Onboarding checklist + tour tooltip

**Files:** Modify `apps/web/src/features/onboarding/components/ChecklistCard.tsx`, `ChecklistItem.tsx`, `TourTooltip.tsx`

- [ ] **Step 1: `ChecklistCard`** — replace the returned JSX (logic unchanged):

```tsx
  return (
    <div className="fixed right-4 bottom-20 left-4 z-45 w-auto animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg duration-320 ease-out sm:bottom-4 sm:left-auto sm:w-72">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-semibold">
          Get started — {completed} of {ORDER.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <ChevronUp /> : <ChevronDown />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={handleDismiss}>
            <X />
          </Button>
        </div>
      </div>
      {!collapsed && (
        <ul className="p-3">
          {ORDER.map((id) => (
            <ChecklistItem key={id} label={ITEM_LABELS[id]} hint={ITEM_HINTS[id]} done={progress[id]} />
          ))}
        </ul>
      )}
    </div>
  );
```

(`z-45` is on Tailwind's numeric scale — it keeps the checklist above the tour dimmer `z-40` and below the tour tooltip `z-50`. Import `Button`.)

- [ ] **Step 2: `ChecklistItem`**:

```tsx
import { CheckCircle2, Circle } from "lucide-react";
import type React from "react";
import { cn } from "@/shared/utils/cn";

interface Props {
  label: string;
  hint?: string;
  done: boolean;
}

export const ChecklistItem: React.FC<Props> = ({ label, hint, done }) => (
  <li className="flex items-start gap-3 py-1.5">
    {done ? (
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary animate-in zoom-in-50 duration-200 ease-spring" />
    ) : (
      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )}
    <div className="min-w-0">
      <span className={cn("text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}>
        {label}
      </span>
      {hint && !done && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  </li>
);
```

- [ ] **Step 3: `TourTooltip`** — replace the manual position math with a `Popover` anchored to a virtual element (collision-aware flipping, enter/exit animation from the shared component). Delete `tooltipPosition` and `anchorTransform`. Add, before the early `return null`:

```tsx
  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;
  const virtualAnchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          const r = rectRef.current;
          return DOMRect.fromRect(
            r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 }
          );
        },
      },
    }),
    []
  );
```

Replace the returned portal content with:

```tsx
  return (
    <>
      {createPortal(
        <svg className="pointer-events-none fixed inset-0 z-40" width={vw} height={vh} aria-hidden>
          <defs>
            <mask id={spotlightMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width={vw} height={vh}>
              <rect width={vw} height={vh} className="fill-white" />
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx={rect.rx}
                ry={rect.rx}
                className="fill-black"
              />
            </mask>
          </defs>
          <rect width={vw} height={vh} className="fill-black/40" mask={`url(#${spotlightMaskId})`} />
        </svg>,
        document.body
      )}
      <Popover open>
        <PopoverAnchor virtualRef={virtualAnchor} />
        <PopoverContent
          side={step.side}
          sideOffset={12}
          updatePositionStrategy="always"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="max-w-xs"
        >
          <p className="text-sm">{step.copy}</p>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stepNumber} of {TOTAL_STEPS}
            </span>
            <Button variant="link" size="sm" onClick={handleSkip}>
              Skip tour
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
```

Imports: `useMemo`, `Popover`, `PopoverAnchor`, `PopoverContent` (`@/shared/components/ui/popover`), `Button`. Confirm `updatePositionStrategy` is accepted by `PopoverContent` (Radix Popper prop; check the installed `@radix-ui/react-popover` types) — if not, drop it and instead key the `<Popover>` on `${rect.top},${rect.left},${rect.width},${rect.height}` so it re-positions when the target moves. Confirm `fill-white` / `fill-black` / `fill-black/40` pass `no-raw-colors` (SVG mask luminance needs pure white/black); if the rule rejects them, keep them with a one-line `eslint-disable-next-line shadcn/no-raw-colors -- SVG mask luminance, not a UI color` each and report.

- [ ] **Step 4: Verify.** eslint on the onboarding dir → 0 findings. `bun run typecheck:web`, `bun run test:web` (onboarding tests; update only markup-coupled assertions). Commit `feat(onboarding): checklist and tour tooltip on shadcn components`.

### Task 8: Enforce, lower baseline, verify, PR

**Files:** Modify `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json`

- [ ] **Step 1:** Add to `MIGRATED` in `eslint.config.mjs`: `"src/features/auth/**/*.tsx"`, `"src/features/onboarding/**/*.tsx"`.
- [ ] **Step 2:** `bun run lint:design` → expect "violations went down" and **0 errors**. Then `bun run lint:design:update`; confirm `features/auth` and `features/onboarding` are gone from the JSON and no other area went up.
- [ ] **Step 3: Sweep the non-lint shadcn rules** in both dirs: `grep -rnE "space-[xy]-|className=\{\`|\bh-([0-9.]+) w-\1\b|\bw-([0-9.]+) h-\2\b" apps/web/src/features/auth apps/web/src/features/onboarding` → fix remaining hits (gap, `cn()`, `size-N`).
- [ ] **Step 4: Full verification** — `bun run typecheck:web`, `bun run typecheck:convex`, `bun run lint -- --diagnostic-level=error`, `bun run lint:design`, `bun run test:web`.
- [ ] **Step 5: Visual check (controller).** With the dev server on :5173: signed-in pane → avatar menu (open, theme toggle, language submenu, logout item present — do not click Logout), landing `/` Get Started → n/a when signed in. For the signed-out sign-in page, take screenshots with a fresh Playwright context (no cookies): `bunx playwright screenshot --viewport-size=1440,900 http://localhost:5173/sign-in <scratch>/signin-desktop.png` and `--viewport-size=390,844` for mobile; also `--color-scheme=dark` to confirm the page stays light. Check the forgot-password step by clicking through in the same headless script if needed.
- [ ] **Step 6:** Commit `chore(web): enforce design lint on auth and onboarding`, push `feature/ds-migrate-auth`, open the PR (base `feature/design-lint` until #225 merges, then retarget to `main`) with before/after screenshots and the baseline drop.
