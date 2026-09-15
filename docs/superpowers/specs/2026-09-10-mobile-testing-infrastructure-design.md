# Mobile Testing Infrastructure Design

Closes [#104](https://github.com/samintisar/SolomindLM/issues/104).

## Scope

`apps/mobile` has no test runner, no CI test gate, and zero coverage of the
mobile-specific logic that isn't exercised by the web app's own suite. This
PR gives it a runner (`jest-expo`), a CI gate, and unit tests for every
pure-TypeScript module currently reachable with no native-module mocking —
the highest-risk, cheapest-to-cover slice (WebView URL policy, deep-link
parsing, and the auth inject-script builders whose escaping bugs silently
break sign-in). Native-module-dependent code (`tokenStorage.ts`,
`nativeAuth.ts`, `nativeOAuthSignIn.ts`, `uploadService.ts`,
`nativeFilePicker.ts`) is out of scope — it needs an Expo native-mock
strategy that is a separate follow-up.

## Tooling

- Add devDependencies to `apps/mobile/package.json`: `jest`, `jest-expo`
  (pinned to the `~55.x` line to match the installed Expo SDK), `@types/jest`.
- `apps/mobile/jest.config.js`: `jest-expo` preset, `testPathIgnorePatterns`
  excluding build output, `transformIgnorePatterns` covering the RN/Expo
  packages already in `dependencies`.
- `apps/mobile/package.json` script: `"test": "jest"`.
- Root `package.json`:
  - New script `"test:mobile": "bun run --cwd apps/mobile test"`.
  - Extend the aggregate `"test"` script from `test:web && test:convex` to
    `test:web && test:convex && test:mobile`.

## Test Coverage

### 1. WebView URL policy (`src/components/web/webViewUrlPolicy.test.ts`)

Target: [`webViewUrlPolicy.ts`](../../../apps/mobile/src/components/web/webViewUrlPolicy.ts)
(`shouldLoadUrlInWebView`). A regression here is a security issue — an
untrusted origin loaded into the native shell.

- Exact match on `webBaseUrl` → allowed
- Each hardcoded dev origin (`10.0.2.2:5173`, `127.0.0.1:5173`,
  `localhost:5173`) → allowed
- LAN Vite origin matching `192.168.x.x:5173` → allowed; a non-matching LAN IP
  shape (e.g. `10.0.0.5:5173`) → denied
- Same-origin URL that doesn't textually start with `webBaseUrl` (different
  path/query) → allowed via origin comparison
- Foreign origin (e.g. `https://evil.example.com`) → denied
- Malformed URL string → denied, no throw

### 2. Deep link parsing (`src/services/platform/deepLinking.test.ts`)

Target: [`deepLinking.ts`](../../../apps/mobile/src/services/platform/deepLinking.ts)
(`parseMobileDeepLink`).

- `/notebook/<id>` path → `{ kind: "notebook", notebookId: <id> }`
- `/share/fork/<token>` path → `{ kind: "shareFork", token: <token> }`
- Both a notebook and fork segment present → fork wins (matches match-order
  in the implementation)
- Unrecognized path → `null`
- `null` input → `null`
- ID/token containing `?` or `#` → captured group stops at the delimiter

### 3. Auth inject-script builders (`src/components/web/buildWebViewAuthInjectScript.test.ts`)

Target: [`buildWebViewAuthInjectScript.ts`](../../../apps/mobile/src/components/web/buildWebViewAuthInjectScript.ts)
(`buildWebViewAuthInjectScript`, `buildWebViewAuthPostMessageScript`). An
escaping bug here silently breaks sign-in with no compiler safety net.

- `buildWebViewAuthInjectScript`: emitted string contains a JSON-encoded
  deployment URL and JWT reachable via `JSON.parse` after stripping the IIFE
  wrapper (or via a regex-extracted assignment) — assert on the actual
  embedded literal, not just `.toContain(jwt)`, since that string-contains
  check would pass even with broken escaping
  - `jwt = null` → embedded as `null`, not the string `"null"`
  - JWT containing a quote/backslash/newline → still valid JSON when parsed
    back out
  - Namespace derivation (`ns`) strips non-alphanumerics from the deployment
    URL, matching `convexAuthStorageKeys`
- `buildWebViewAuthPostMessageScript`: emitted payload round-trips through
  `JSON.parse` to `{ type: "native-auth:tokens", deploymentUrl, jwt }`

### 4. Native auth response script (`src/components/web/buildNativeAuthResponseInjectScript.test.ts`)

Target: [`buildNativeAuthResponseInjectScript.ts`](../../../apps/mobile/src/components/web/buildNativeAuthResponseInjectScript.ts).

- Success payload and error payload both round-trip through `JSON.parse` to
  the exact input `NativeAuthResponsePayload`
- A message containing a quote/backslash in `error` stays valid embedded JSON

### 5. Auth storage key derivation (`src/services/auth/convexAuthStorageKeys.test.ts`)

Target: [`convexAuthStorageKeys.ts`](../../../apps/mobile/src/services/auth/convexAuthStorageKeys.ts).
Must match `@convex-dev/auth`'s own `useNamespacedStorage` key derivation —
a drift here breaks the native↔WebView auth bridge silently.

- A typical `https://foo-bar-123.convex.cloud` URL → `jwt`/`refresh` keys
  with non-alphanumerics stripped
- Same derivation logic cross-checked against the inline `ns` computation
  duplicated in `buildWebViewAuthInjectScript` (both must agree — arguably
  worth a follow-up to de-duplicate, noted but not fixed in this PR)

## CI

New job `test-mobile` in `.github/workflows/ci.yml`, parallel to
`typecheck-mobile`, running `bun run test:mobile`. Not added to
`build-web` / `build-web-main`'s `needs:` — matches `test-unit`, which also
isn't a build gate.

## Cleanup

Delete `apps/mobile/components/__tests__/StyledText-test.js` and the
now-empty `__tests__` directory. It's `create-expo-app` scaffold cruft
testing an unused snapshot path, currently unrunnable (nothing invokes it).

## Out of Scope (follow-up)

- `tokenStorage.ts`, `convexAuthSecureStorage.ts`, `nativeOAuthSignIn.ts`,
  `nativeAuth.ts` — needs an `expo-secure-store` / `expo-auth-session` mock
  strategy.
- `uploadService.ts`, `nativeFilePicker.ts` — needs `expo-document-picker` /
  `expo-image-picker` mocks.
- EAS build / e2e smoke coverage for mobile.

## Verification

- `bun run test:mobile` passes locally
- `bun run typecheck:mobile` still passes
- `bun run lint` passes (new test files follow Biome formatting)
- CI `test-mobile` job green on the PR
