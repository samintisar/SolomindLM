# Auth E2E Tests Design

## Scope

Add comprehensive Playwright e2e tests for authentication flows that can be fully automated without requiring email inbox access.

## Test Coverage

### 1. Sign-In Flow (`e2e/auth/sign-in.spec.ts`)

- **Happy path**: Sign in with existing verified E2E_TEST_EMAIL / E2E_TEST_PASSWORD, land on /home
- **Validation**: Empty email shows required error, empty password shows required error
- **Wrong credentials**: Invalid email/password shows error message
- **Password visibility**: Toggle password field between hidden and visible

### 2. Sign-Up Flow (`e2e/auth/sign-up.spec.ts`)

- **UI flow**: Navigate to sign-up mode, fill email + password, submit reaches "Check your email" verification screen
- **Validation**: Empty fields, invalid email format, weak password
- **Mode toggle**: Switch between sign-in and sign-up modes

### 3. Forgot Password Flow (`e2e/auth/forgot-password.spec.ts`)

- **UI flow**: Click "Forgot password?", enter email, submit reaches "Enter reset code" screen
- **Validation**: Empty email shows error
- **Back navigation**: Can navigate back to sign-in

### 4. Sign-Out & Session (`e2e/auth/sign-out.spec.ts`)

- **Sign out**: From authenticated state, click avatar dropdown → Sign out, land on /sign-in
- **Protected routes**: Clear cookies/storage, try accessing /home → redirect to /sign-in
- **Post-sign-out access**: After sign-out, cannot access protected pages

### 5. Auth Page Smoke (`e2e/auth/auth-page.spec.ts`)

- **Landing page CTA**: Get Started Free button navigates to /sign-in or /home
- **Google button**: Google sign-in button is visible
- **Terms/Privacy links**: Links are present and clickable

## Test Data

- Reuses existing `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` from `.env.e2e`
- For sign-up flow: use a unique timestamped email to avoid "account already exists" errors

## Isolation

- Auth tests use a fresh browser context (no `storageState`) to test unauthenticated flows
- `authenticatedPage` fixture from `auth.fixture.ts` is used only for sign-out tests
- After sign-up tests, clean up the created test user via Convex CLI if needed

## Files

- `e2e/auth/sign-in.spec.ts`
- `e2e/auth/sign-up.spec.ts`
- `e2e/auth/forgot-password.spec.ts`
- `e2e/auth/sign-out.spec.ts`
- `e2e/auth/auth-page.spec.ts`
