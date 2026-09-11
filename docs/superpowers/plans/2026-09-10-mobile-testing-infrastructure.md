# Mobile Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/mobile` a `jest-expo` test runner wired into CI, and unit-test every pure-TypeScript module that's currently reachable with no native-module mocking — the WebView URL allowlist, deep-link parsing, and the hand-built auth inject-script builders whose escaping bugs silently break sign-in.

**Architecture:** `jest-expo` (the Expo-maintained Jest preset) plus `babel-preset-expo` for the TS/JSX transform. All five target modules (`webViewUrlPolicy.ts`, `deepLinking.ts`, `buildWebViewAuthInjectScript.ts`, `buildNativeAuthResponseInjectScript.ts`, `convexAuthStorageKeys.ts`) have zero imports — no React Native, no Expo modules — so no mocking, no `jsdom`, no `testing-library` is needed for this PR. The inject-script builders return a JS-source string meant to run inside the WebView's browser context, not inside the RN/Jest process; tests verify them by regex-extracting the embedded JSON literal from the returned string and `JSON.parse`-ing it, never by executing the string.

**Tech Stack:** `jest` + `jest-expo` preset, `@types/jest`, `babel-preset-expo`. Bun workspaces monorepo (`bun run --cwd apps/mobile ...`).

**Deviations from the design doc:** One addition not called out in the spec: `biome.json` has a `!apps/mobile/components/__tests__/**` ignore entry (in both `formatter.includes` and `linter.includes`) that exists specifically to exempt the dead `StyledText-test.js`. Deleting that file without removing the ignore entries would leave stale dead-code references in `biome.json`, so Task 8 removes both. Everything else implements the spec as written.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/package.json` (modify) | Add `jest`, `jest-expo`, `@types/jest`, `babel-preset-expo` devDependencies; add `"test": "jest"` script. |
| `apps/mobile/babel.config.js` (create) | `babel-preset-expo` — required for Jest to transform TS/JSX (Expo Router relies on this preset; there's currently no babel config in the app at all). |
| `apps/mobile/jest.config.js` (create) | `jest-expo` preset config. |
| `apps/mobile/tsconfig.json` (modify) | Add `"types": ["jest"]` so `bun run typecheck:mobile` (which typechecks `**/*.ts` including new `*.test.ts` files) recognizes `describe`/`it`/`expect`. |
| `package.json` (modify, repo root) | New `"test:mobile"` script; extend aggregate `"test"` to include it. |
| `apps/mobile/src/components/web/webViewUrlPolicy.test.ts` (create) | Tests for `shouldLoadUrlInWebView`. |
| `apps/mobile/src/services/platform/deepLinking.test.ts` (create) | Tests for `parseMobileDeepLink`. |
| `apps/mobile/src/components/web/buildWebViewAuthInjectScript.test.ts` (create) | Tests for `buildWebViewAuthInjectScript` + `buildWebViewAuthPostMessageScript`. |
| `apps/mobile/src/components/web/buildNativeAuthResponseInjectScript.test.ts` (create) | Tests for `buildNativeAuthResponseInjectScript`. |
| `apps/mobile/src/services/auth/convexAuthStorageKeys.test.ts` (create) | Tests for `convexAuthStorageKeys`. |
| `.github/workflows/ci.yml` (modify) | New `test-mobile` job, parallel to `typecheck-mobile`. |
| `apps/mobile/components/__tests__/StyledText-test.js` (delete, in Task 1) | Dead `create-expo-app` scaffold test — deleted in Task 1, not Task 8, because it crashes on teardown when Jest runs it and would block verification for every task in between. |
| `biome.json` (modify, in Task 8) | Remove the now-stale `!apps/mobile/components/__tests__/**` ignore entries (formatter + linter `includes`) left over from the dead test file. |

---

## Task 1: Jest/jest-expo tooling setup

**Files:**
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/jest.config.js`
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/tsconfig.json`
- Modify: `package.json` (repo root)
- Delete: `apps/mobile/components/__tests__/StyledText-test.js` (pulled forward from Task 8 — see amendment note before Step 8)

- [ ] **Step 1: Install jest-expo at the SDK-matched version**

Run from the repo root:

```bash
bunx --cwd apps/mobile expo install jest-expo --dev
```

`expo install` resolves the `jest-expo` version compatible with the app's installed Expo SDK (currently `~55.0.26`) instead of whatever `bun add` would pick from latest — this matters because `jest-expo` version-locks to the Expo SDK major version.

Expected: `apps/mobile/package.json` gains a `jest-expo` devDependency; `bun.lock` updates.

- [ ] **Step 2: Install jest, @types/jest, and babel-preset-expo**

```bash
bun add -d jest @types/jest babel-preset-expo --cwd apps/mobile
```

`babel-preset-expo` is already resolved transitively in `bun.lock` (as a dependency of `expo`), so this pins it as a direct devDependency at the same resolved version rather than relying on hoisting.

Expected: `apps/mobile/package.json` devDependencies now include `jest`, `@types/jest`, `babel-preset-expo`, `jest-expo`.

- [ ] **Step 3: Add babel.config.js**

Create `apps/mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
```

There is no existing babel config in `apps/mobile` (Metro/Expo Router currently resolve the preset implicitly at build time); Jest needs it declared explicitly to transform TS/JSX in test files.

- [ ] **Step 4: Add jest.config.js**

Create `apps/mobile/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testPathIgnorePatterns: ["/node_modules/", "/.expo/", "/dist/"],
};
```

- [ ] **Step 5: Add the test script to apps/mobile/package.json**

Edit `apps/mobile/package.json` — add to `"scripts"` (after `"web"`):

```json
    "test": "jest"
```

- [ ] **Step 6: Add jest types to apps/mobile/tsconfig.json**

Edit `apps/mobile/tsconfig.json` — add `"types": ["jest"]` inside `compilerOptions`, alongside the existing `"paths"`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"],
    "paths": {
      "@/*": ["./*"],
      "@mobile/*": ["./src/*"],
      "@convex/*": ["../../convex/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "src/types/env.d.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 7: Add test:mobile to the root package.json**

Edit `package.json` (repo root) — add a new script right after `"test:web:coverage"`:

```json
    "test:mobile": "bun run --cwd apps/mobile test",
```

And change the aggregate `"test"` script from:

```json
    "test": "bun run test:web && bun run test:convex",
```

to:

```json
    "test": "bun run test:web && bun run test:convex && bun run test:mobile",
```

> **Amended during execution:** Step 1's `bun add -d babel-preset-expo` originally grabbed latest (`57.0.11`) instead of the SDK-matched version already resolved transitively via `expo` (`55.0.22`) — fixed by reinstalling it with `expo install` like `jest-expo`. Also, running the harness (original Step 8) surfaced that the pre-existing dead scaffold `apps/mobile/components/__tests__/StyledText-test.js` doesn't just get skipped — Jest finds and runs it, and it crashes on teardown (`TypeError: window.dispatchEvent is not a function`), which would corrupt every subsequent task's "run tests, verify pass" step. Its removal was pulled forward from Task 8 into this task for that reason; Task 8 now only handles the `biome.json` cleanup.

- [ ] **Step 8: Install babel-preset-expo via expo install instead of bun add**

```bash
bunx expo install babel-preset-expo --dev
```

Run from inside `apps/mobile` (or with an equivalent `--cwd`/`--prefix` flag if `bunx --cwd` doesn't pass through as expected — verify the resolved version afterward either way). Confirm `apps/mobile/package.json` / `bun.lock` now pin `babel-preset-expo` to the `~55.x` line, not `57.0.11`.

- [ ] **Step 9: Remove the dead StyledText-test.js scaffold now (pulled forward from Task 8)**

```bash
rm apps/mobile/components/__tests__/StyledText-test.js
rmdir apps/mobile/components/__tests__
```

This file is a `create-expo-app` scaffold leftover that crashes on teardown when Jest picks it up — leaving it in place blocks every later task's verification step. (`biome.json`'s stale ignore entry for this path is cleaned up separately in Task 8 — don't touch `biome.json` here.)

- [ ] **Step 10: Verify the harness runs (no test files yet)**

```bash
bun run test:mobile
```

Expected: Jest starts under the `jest-expo` preset and reports `No tests found` — exit code 1, with that specific message (not a crash trace). This confirms the runner, preset, and config are wired correctly; Task 2 adds the first real test file, after which this command should pass.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/package.json apps/mobile/babel.config.js apps/mobile/jest.config.js apps/mobile/tsconfig.json package.json bun.lock
git commit -m "chore(mobile): add jest-expo test runner"

git add -u apps/mobile/components
git commit -m "chore(mobile): remove dead StyledText-test.js blocking jest harness verification"
```

(Two commits — tooling setup, then the scaffold removal — or combine them if that's cleaner; either is fine.)

---

## Task 2: webViewUrlPolicy tests

**Files:**
- Test: `apps/mobile/src/components/web/webViewUrlPolicy.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/components/web/webViewUrlPolicy.test.ts`:

```ts
import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

const WEB_BASE_URL = "https://app.solomindlm.com/entry";

describe("shouldLoadUrlInWebView", () => {
  it("allows a URL that starts with the web base URL", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/entry/home", WEB_BASE_URL)).toBe(
      true
    );
  });

  it("allows the Android emulator dev origin", () => {
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows the loopback dev origin", () => {
    expect(shouldLoadUrlInWebView("http://127.0.0.1:5173/", WEB_BASE_URL)).toBe(true);
  });

  it("allows the localhost dev origin", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows a LAN Vite origin matching 192.168.x.x:5173", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/home", WEB_BASE_URL)).toBe(true);
  });

  it("denies a non-192.168 LAN IP even on the Vite port", () => {
    expect(shouldLoadUrlInWebView("http://10.0.0.5:5173/home", WEB_BASE_URL)).toBe(false);
  });

  it("allows a same-origin URL that doesn't textually start with the base URL", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/other?x=1", WEB_BASE_URL)).toBe(
      true
    );
  });

  it("denies a foreign origin", () => {
    expect(shouldLoadUrlInWebView("https://evil.example.com", WEB_BASE_URL)).toBe(false);
  });

  it("denies a malformed URL without throwing", () => {
    expect(() => shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).not.toThrow();
    expect(shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun run test:mobile
```

Expected: PASS — 1 suite, 9 tests.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/web/webViewUrlPolicy.test.ts
git commit -m "test(mobile): cover WebView URL allowlist policy"
```

---

## Task 2.5: Fix WebView URL policy origin-confusion bypass (added during execution)

**Why this task exists:** Code-quality review of Task 2 found that `shouldLoadUrlInWebView`'s `url.startsWith(webBaseUrl)` check is a raw string-prefix comparison, not a parsed-URL comparison. Given the real runtime `webBaseUrl` (a bare origin — [WebViewScreen.tsx](../../../apps/mobile/src/components/web/WebViewScreen.tsx) strips the trailing slash from `EXPO_PUBLIC_WEB_URL`), this is bypassable via URL userinfo: `"https://app.solomindlm.com@evil.com/".startsWith("https://app.solomindlm.com")` is `true` as a string, but a real browser parses `app.solomindlm.com` as a *username* and resolves the actual host to `evil.com`. The same flaw affects the hardcoded dev origins (`"http://localhost:5173@evil.com/"` bypasses too, and those checks are not dev-gated — they run in production builds), and a textual-prefix subdomain-confusion variant (`https://app.solomindlm.com.evil.com/`). The LAN regex also had no port-boundary anchor, separately allowing `192.168.x.x:51730` (wrong port) through. This is a pre-existing bug, not introduced by this plan — it surfaced because the review used a production-realistic fixture instead of the original test's path-suffixed one, which had accidentally masked it.

**Files:**
- Modify: `apps/mobile/src/components/web/webViewUrlPolicy.ts`
- Modify: `apps/mobile/src/components/web/webViewUrlPolicy.test.ts`

- [ ] **Step 1: Rewrite webViewUrlPolicy.ts to compare parsed origins, not string prefixes**

Replace the full contents of `apps/mobile/src/components/web/webViewUrlPolicy.ts` with:

```ts
/** Dev origins for the Vite web app when loaded from Android emulator / LAN. */
const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

const LAN_VITE_HOST = /^192\.168\.\d{1,3}\.\d{1,3}$/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Only the web app origin stays in the WebView — OAuth runs in expo-web-browser.
 *
 * Compares parsed `URL.origin` values, never raw string prefixes: a naive
 * `url.startsWith(webBaseUrl)` check is bypassable via URL userinfo
 * (`https://<trusted-host>@evil.com/` starts with the trusted host as a
 * string, but a real browser resolves it to host `evil.com`).
 */
export function shouldLoadUrlInWebView(url: string, webBaseUrl: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;

  const parsedBase = parseUrl(webBaseUrl);
  if (parsedBase && parsed.origin === parsedBase.origin) return true;

  for (const origin of MOBILE_DEV_WEB_ORIGINS) {
    if (parsed.origin === origin) return true;
  }

  if (
    parsed.protocol === "http:" &&
    parsed.port === "5173" &&
    LAN_VITE_HOST.test(parsed.hostname)
  ) {
    return true;
  }

  return false;
}
```

- [ ] **Step 2: Replace the test file with a production-realistic fixture plus adversarial regression cases**

Replace the full contents of `apps/mobile/src/components/web/webViewUrlPolicy.test.ts` with:

```ts
import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

const WEB_BASE_URL = "https://app.solomindlm.com";

describe("shouldLoadUrlInWebView", () => {
  it("allows the exact web base origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/home", WEB_BASE_URL)).toBe(true);
  });

  it("allows the Android emulator dev origin", () => {
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows the loopback dev origin", () => {
    expect(shouldLoadUrlInWebView("http://127.0.0.1:5173/", WEB_BASE_URL)).toBe(true);
  });

  it("allows the localhost dev origin", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows a LAN Vite origin matching 192.168.x.x:5173", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/home", WEB_BASE_URL)).toBe(true);
  });

  it("denies a non-192.168 LAN IP even on the Vite port", () => {
    expect(shouldLoadUrlInWebView("http://10.0.0.5:5173/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies the right LAN IP on the wrong port", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:51730/home", WEB_BASE_URL)).toBe(false);
  });

  it("allows a same-origin URL with a different path or query", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/other?x=1", WEB_BASE_URL)).toBe(
      true
    );
  });

  it("denies a foreign origin", () => {
    expect(shouldLoadUrlInWebView("https://evil.example.com", WEB_BASE_URL)).toBe(false);
  });

  it("denies a malformed URL without throwing", () => {
    expect(() => shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).not.toThrow();
    expect(shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).toBe(false);
  });

  it("denies a URL that embeds the trusted host as userinfo before a foreign host", () => {
    // A naive `url.startsWith(webBaseUrl)` check would pass here — the string
    // literally starts with the trusted origin — but a real browser resolves
    // this to host "evil.com" with "app.solomindlm.com" as the username.
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com@evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies a dev origin embedded as userinfo before a foreign host", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173@evil.com/", WEB_BASE_URL)).toBe(false);
  });

  it("denies a subdomain-confusion host that textually starts with the trusted origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com.evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies an http downgrade of the trusted origin", () => {
    expect(shouldLoadUrlInWebView("http://app.solomindlm.com/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies a javascript: URL", () => {
    expect(shouldLoadUrlInWebView("javascript:alert(1)", WEB_BASE_URL)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and typecheck**

```bash
bun run test:mobile
bun run typecheck:mobile
bun run lint
```

Expected: PASS — 1 suite, 15 tests. Typecheck and lint clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/web/webViewUrlPolicy.ts apps/mobile/src/components/web/webViewUrlPolicy.test.ts
git commit -m "fix(mobile): compare parsed origins in WebView URL policy, not string prefixes"
```

---

## Task 2.6: Close two more findings from Task 2.5's own review (added during execution)

**Why this task exists:** Code-quality review of Task 2.5's fix independently traced two more real, verified gaps in the same function:

1. **Opaque-origin collision.** `URL.origin` is the literal string `"null"` for every non-special scheme (`javascript:`, `data:`, `file:`, ...). If `webBaseUrl` ever parses successfully but is non-http(s) (an unvalidated env var misconfiguration — and this app already owns a `solomindlm://` custom scheme, so that shape isn't far-fetched), `parsed.origin === parsedBase.origin` becomes `"null" === "null"` → `true`, letting a `javascript:`/`data:`/`file:` URL load. Verified directly against the function.
2. **Dev/LAN origins aren't gated to development builds.** `MOBILE_DEV_WEB_ORIGINS` and the LAN check are unconditional, so they're trusted in production builds too. Traced end-to-end: `shouldLoadUrlInWebView` is the sole gate before `WebViewScreen.tsx` injects the user's Convex auth JWT into whatever page it approved (`onLoadEnd` → `syncAuthToWebView` → `injectJavaScript`, no further origin check). A trusted-but-unauthenticated plaintext LAN/localhost origin is therefore a token-disclosure surface in any build profile that isn't Android EAS `production` (the only profile with `usesCleartextTraffic: false`).

**Files:**
- Modify: `apps/mobile/src/components/web/webViewUrlPolicy.ts`
- Modify: `apps/mobile/src/components/web/webViewUrlPolicy.test.ts`

- [ ] **Step 1: Add an http(s)-only scheme guard and gate dev/LAN origins behind `__DEV__`**

Replace the full contents of `apps/mobile/src/components/web/webViewUrlPolicy.ts` with:

```ts
/** Dev origins for the Vite web app when loaded from Android emulator / LAN. */
const MOBILE_DEV_WEB_ORIGINS = [
  "http://10.0.2.2:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
] as const;

const LAN_VITE_HOST = /^192\.168\.\d{1,3}\.\d{1,3}$/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Only the web app origin stays in the WebView — OAuth runs in expo-web-browser.
 *
 * Compares parsed `URL.origin` values, never raw string prefixes: a naive
 * `url.startsWith(webBaseUrl)` check is bypassable via URL userinfo
 * (`https://<trusted-host>@evil.com/` starts with the trusted host as a
 * string, but a real browser resolves it to host `evil.com`).
 *
 * Restricted to http(s) schemes: `URL.origin` is the string `"null"` for
 * every non-special scheme (`javascript:`, `data:`, `file:`, ...), so without
 * this guard an unvalidated non-http(s) `webBaseUrl` would make any such URL
 * compare equal to the "trusted" origin.
 *
 * Dev/LAN origins are only trusted in development builds (`__DEV__`) — this
 * function is the sole gate before the WebView is handed the user's Convex
 * auth JWT (see `buildWebViewAuthInjectScript`), so trusting a plaintext LAN
 * origin in a release build would make that origin a token-disclosure surface.
 */
export function shouldLoadUrlInWebView(url: string, webBaseUrl: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const parsedBase = parseUrl(webBaseUrl);
  if (parsedBase && parsed.origin === parsedBase.origin) return true;

  if (__DEV__) {
    for (const origin of MOBILE_DEV_WEB_ORIGINS) {
      if (parsed.origin === origin) return true;
    }

    if (
      parsed.protocol === "http:" &&
      parsed.port === "5173" &&
      LAN_VITE_HOST.test(parsed.hostname)
    ) {
      return true;
    }
  }

  return false;
}
```

- [ ] **Step 2: Add regression tests for both fixes**

Replace the full contents of `apps/mobile/src/components/web/webViewUrlPolicy.test.ts` with:

```ts
import { shouldLoadUrlInWebView } from "./webViewUrlPolicy";

const WEB_BASE_URL = "https://app.solomindlm.com";

describe("shouldLoadUrlInWebView", () => {
  it("allows the exact web base origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/home", WEB_BASE_URL)).toBe(true);
  });

  it("allows the Android emulator dev origin", () => {
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows the loopback dev origin", () => {
    expect(shouldLoadUrlInWebView("http://127.0.0.1:5173/", WEB_BASE_URL)).toBe(true);
  });

  it("allows the localhost dev origin", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/notebook/abc", WEB_BASE_URL)).toBe(true);
  });

  it("allows a LAN Vite origin matching 192.168.x.x:5173", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/home", WEB_BASE_URL)).toBe(true);
  });

  it("denies a non-192.168 LAN IP even on the Vite port", () => {
    expect(shouldLoadUrlInWebView("http://10.0.0.5:5173/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies the right LAN IP on the wrong port", () => {
    expect(shouldLoadUrlInWebView("http://192.168.1.42:51730/home", WEB_BASE_URL)).toBe(false);
  });

  it("allows a same-origin URL with a different path or query", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/other?x=1", WEB_BASE_URL)).toBe(true);
  });

  it("denies a foreign origin", () => {
    expect(shouldLoadUrlInWebView("https://evil.example.com", WEB_BASE_URL)).toBe(false);
  });

  it("denies a malformed URL without throwing", () => {
    expect(() => shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).not.toThrow();
    expect(shouldLoadUrlInWebView("not a url", WEB_BASE_URL)).toBe(false);
  });

  it("denies a URL that embeds the trusted host as userinfo before a foreign host", () => {
    // A naive `url.startsWith(webBaseUrl)` check would pass here — the string
    // literally starts with the trusted origin — but a real browser resolves
    // this to host "evil.com" with "app.solomindlm.com" as the username.
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com@evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies a dev origin embedded as userinfo before a foreign host", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173@evil.com/", WEB_BASE_URL)).toBe(false);
  });

  it("denies a subdomain-confusion host that textually starts with the trusted origin", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com.evil.com/", WEB_BASE_URL)).toBe(
      false
    );
  });

  it("denies an http downgrade of the trusted origin", () => {
    expect(shouldLoadUrlInWebView("http://app.solomindlm.com/home", WEB_BASE_URL)).toBe(false);
  });

  it("denies a javascript: URL", () => {
    expect(shouldLoadUrlInWebView("javascript:alert(1)", WEB_BASE_URL)).toBe(false);
  });

  it("denies a javascript: URL even when webBaseUrl is itself a non-http(s) value", () => {
    // Without the http(s)-only scheme guard, URL.origin is the literal string
    // "null" for every non-special scheme, so a non-http(s) webBaseUrl would
    // make this compare equal to the "trusted" origin and incorrectly pass.
    expect(shouldLoadUrlInWebView("javascript:alert(1)", "solomindlm://app")).toBe(false);
  });
});

describe("shouldLoadUrlInWebView in production builds (__DEV__ = false)", () => {
  const globalWithDevFlag = globalThis as typeof globalThis & { __DEV__: boolean };
  const originalDev = globalWithDevFlag.__DEV__;

  beforeAll(() => {
    globalWithDevFlag.__DEV__ = false;
  });

  afterAll(() => {
    globalWithDevFlag.__DEV__ = originalDev;
  });

  it("denies dev and LAN origins when __DEV__ is false", () => {
    expect(shouldLoadUrlInWebView("http://localhost:5173/", WEB_BASE_URL)).toBe(false);
    expect(shouldLoadUrlInWebView("http://10.0.2.2:5173/", WEB_BASE_URL)).toBe(false);
    expect(shouldLoadUrlInWebView("http://192.168.1.42:5173/", WEB_BASE_URL)).toBe(false);
  });

  it("still allows the real web base origin when __DEV__ is false", () => {
    expect(shouldLoadUrlInWebView("https://app.solomindlm.com/home", WEB_BASE_URL)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test, typecheck, and lint**

```bash
bun run test:mobile
bun run typecheck:mobile
bun run lint
```

Expected: PASS — 2 suites, 20 tests. Typecheck and lint clean. (`bun run typecheck:mobile` must confirm `__DEV__` typechecks without a `declare` — it's already used elsewhere in `apps/mobile`, e.g. via Expo's ambient RN types.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/web/webViewUrlPolicy.ts apps/mobile/src/components/web/webViewUrlPolicy.test.ts
git commit -m "fix(mobile): restrict WebView URL policy to http(s) and gate dev/LAN origins to __DEV__"
```

**Deliberately not done here** (noted by the reviewer as minor/optional, not required): failing closed on an unparseable `webBaseUrl` (currently falls through to dev-origins-only), rejecting credentials-bearing URLs to the trusted host itself, and a couple of extra edge-case tests (IPv6 loopback, parser-identity assertion). None are required for this fix; revisit only if a future finding makes them relevant.

---

## Task 3: deepLinking tests

**Files:**
- Test: `apps/mobile/src/services/platform/deepLinking.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/services/platform/deepLinking.test.ts`:

```ts
import { parseMobileDeepLink } from "./deepLinking";

describe("parseMobileDeepLink", () => {
  it("parses a notebook deep link", () => {
    expect(parseMobileDeepLink("solomindlm://notebook/abc123")).toEqual({
      kind: "notebook",
      notebookId: "abc123",
    });
  });

  it("parses a share-fork deep link", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/share/fork/xyz789")).toEqual({
      kind: "shareFork",
      token: "xyz789",
    });
  });

  it("prefers the fork match when both a notebook and fork segment are present", () => {
    expect(
      parseMobileDeepLink("https://solomindlm.com/notebook/abc123/share/fork/xyz789")
    ).toEqual({ kind: "shareFork", token: "xyz789" });
  });

  it("returns null for an unrecognized path", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/settings")).toBeNull();
  });

  it("returns null for a null URL", () => {
    expect(parseMobileDeepLink(null)).toBeNull();
  });

  it("stops the notebook id capture at a query string", () => {
    expect(parseMobileDeepLink("solomindlm://notebook/abc123?ref=email")).toEqual({
      kind: "notebook",
      notebookId: "abc123",
    });
  });

  it("stops the fork token capture at a hash fragment", () => {
    expect(parseMobileDeepLink("https://solomindlm.com/share/fork/xyz789#section")).toEqual({
      kind: "shareFork",
      token: "xyz789",
    });
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun run test:mobile
```

Expected: PASS — 2 suites, 16 tests total.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/platform/deepLinking.test.ts
git commit -m "test(mobile): cover deep link parsing"
```

---

## Task 4: buildWebViewAuthInjectScript tests

**Files:**
- Test: `apps/mobile/src/components/web/buildWebViewAuthInjectScript.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/components/web/buildWebViewAuthInjectScript.test.ts`:

```ts
import {
  buildWebViewAuthInjectScript,
  buildWebViewAuthPostMessageScript,
} from "./buildWebViewAuthInjectScript";

function extractLiteral(script: string, varName: string): unknown {
  const match = script.match(new RegExp(`var ${varName} = (.*);`));
  if (!match) throw new Error(`no assignment found for ${varName} in script`);
  return JSON.parse(match[1]);
}

describe("buildWebViewAuthInjectScript", () => {
  it("embeds the deployment URL and JWT as valid JSON literals", () => {
    const script = buildWebViewAuthInjectScript(
      "https://foo-bar-123.convex.cloud",
      "jwt-token-abc"
    );

    expect(extractLiteral(script, "CONVEX_URL")).toBe("https://foo-bar-123.convex.cloud");
    expect(extractLiteral(script, "jwt")).toBe("jwt-token-abc");
  });

  it('embeds a null JWT as the JSON literal null, not the string "null"', () => {
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", null);

    expect(extractLiteral(script, "jwt")).toBeNull();
  });

  it("safely escapes a JWT containing quotes, backslashes, and newlines", () => {
    const trickyJwt = 'part-one\\part-two"quoted"\npart-three';
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", trickyJwt);

    expect(extractLiteral(script, "jwt")).toBe(trickyJwt);
  });

  it("derives the namespace by stripping non-alphanumeric characters from the deployment URL", () => {
    const script = buildWebViewAuthInjectScript("https://foo-bar-123.convex.cloud", "tok");

    expect(script).toContain('var ns = CONVEX_URL.replace(/[^a-zA-Z0-9]/g, "")');
  });
});

describe("buildWebViewAuthPostMessageScript", () => {
  it("embeds a payload that round-trips through JSON.parse", () => {
    const script = buildWebViewAuthPostMessageScript(
      "https://foo-bar-123.convex.cloud",
      "jwt-token-abc"
    );

    expect(extractLiteral(script, "data")).toEqual({
      type: "native-auth:tokens",
      deploymentUrl: "https://foo-bar-123.convex.cloud",
      jwt: "jwt-token-abc",
    });
  });

  it("embeds a null JWT as null in the payload", () => {
    const script = buildWebViewAuthPostMessageScript("https://foo-bar-123.convex.cloud", null);
    const payload = extractLiteral(script, "data") as { jwt: unknown };

    expect(payload.jwt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun run test:mobile
```

Expected: PASS — 3 suites, 22 tests total.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/web/buildWebViewAuthInjectScript.test.ts
git commit -m "test(mobile): cover WebView auth inject-script builder"
```

---

## Task 5: buildNativeAuthResponseInjectScript tests

**Files:**
- Test: `apps/mobile/src/components/web/buildNativeAuthResponseInjectScript.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/components/web/buildNativeAuthResponseInjectScript.test.ts`:

```ts
import { buildNativeAuthResponseInjectScript } from "./buildNativeAuthResponseInjectScript";
import type { NativeAuthResponsePayload } from "./buildNativeAuthResponseInjectScript";

function extractDetail(script: string): unknown {
  const match = script.match(/var detail = (.*);/);
  if (!match) throw new Error("no detail assignment found in script");
  return JSON.parse(match[1]);
}

describe("buildNativeAuthResponseInjectScript", () => {
  it("embeds a success payload that round-trips through JSON.parse", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-1",
      success: true,
      authenticated: true,
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });

  it("embeds an error payload that round-trips through JSON.parse", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-2",
      success: false,
      error: "network timeout",
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });

  it("safely escapes an error message containing quotes and backslashes", () => {
    const payload: NativeAuthResponsePayload = {
      type: "native-auth:response",
      requestId: "req-3",
      success: false,
      error: 'bad "token"\\format',
    };

    expect(extractDetail(buildNativeAuthResponseInjectScript(payload))).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun run test:mobile
```

Expected: PASS — 4 suites, 25 tests total.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/web/buildNativeAuthResponseInjectScript.test.ts
git commit -m "test(mobile): cover native auth response inject-script builder"
```

---

## Task 6: convexAuthStorageKeys tests

**Files:**
- Test: `apps/mobile/src/services/auth/convexAuthStorageKeys.test.ts`

- [ ] **Step 1: Write the test file**

Create `apps/mobile/src/services/auth/convexAuthStorageKeys.test.ts`:

```ts
import { convexAuthStorageKeys } from "./convexAuthStorageKeys";

describe("convexAuthStorageKeys", () => {
  it("strips non-alphanumeric characters from the deployment URL to build the namespace", () => {
    expect(convexAuthStorageKeys("https://foo-bar-123.convex.cloud")).toEqual({
      jwt: "__convexAuthJWT_httpsfoobar123convexcloud",
      refresh: "__convexAuthRefreshToken_httpsfoobar123convexcloud",
    });
  });

  it("derives the same namespace the WebView inject script computes at runtime", () => {
    const deploymentUrl = "https://another-deployment.convex.cloud";
    const expectedNs = deploymentUrl.replace(/[^a-zA-Z0-9]/g, "");

    const keys = convexAuthStorageKeys(deploymentUrl);

    expect(keys.jwt).toBe(`__convexAuthJWT_${expectedNs}`);
    expect(keys.refresh).toBe(`__convexAuthRefreshToken_${expectedNs}`);
  });

  it("returns distinct keys for different deployment URLs", () => {
    const a = convexAuthStorageKeys("https://deployment-a.convex.cloud");
    const b = convexAuthStorageKeys("https://deployment-b.convex.cloud");

    expect(a.jwt).not.toBe(b.jwt);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
bun run test:mobile
```

Expected: PASS — 5 suites, 28 tests total.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/services/auth/convexAuthStorageKeys.test.ts
git commit -m "test(mobile): cover Convex auth storage key derivation"
```

---

## Task 7: CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the test-mobile job**

In `.github/workflows/ci.yml`, insert a new job immediately after the `typecheck-mobile` job (before `build-web`):

```yaml
  test-mobile:
    name: Test (Mobile)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4

      - name: Setup
        uses: ./.github/actions/setup

      - name: Run mobile tests
        run: bun run test:mobile
```

This mirrors `typecheck-mobile`'s shape and, like `test-unit`, is not added to `build-web` / `build-web-main`'s `needs:` — it's a signal job, not a build gate.

- [ ] **Step 2: Validate the workflow file**

```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color
```

Expected: no errors reported for `.github/workflows/ci.yml`. (This mirrors the repo's own `workflow-lint` CI job locally; skip if Docker isn't available and rely on that CI job instead.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(mobile): add test-mobile job"
```

---

## Task 8: Remove stale biome ignore entries

**Files:**
- Modify: `biome.json`

> **Amended during execution:** `apps/mobile/components/__tests__/StyledText-test.js` was already deleted in Task 1 (its crash-on-teardown blocked every task's verification step in between — see Task 1's amendment note). This task now only removes the resulting stale `biome.json` ignore entries.

- [ ] **Step 1: Remove the now-stale biome ignore entries**

In `biome.json`, remove the line `"!apps/mobile/components/__tests__/**",` from **both** the `formatter.includes` array and the top-level `linter.includes` array (it appears twice — once per section, each currently reading `"!apps/mobile/components/__tests__/**",`).

- [ ] **Step 2: Verify biome still passes**

```bash
bun run lint
```

Expected: no new errors. (Existing warnings elsewhere in the repo, if any, are unrelated to this change.)

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore(mobile): remove stale StyledText-test.js biome ignore entries"
```

---

## Task 9: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Typecheck mobile**

```bash
bun run typecheck:mobile
```

Expected: PASS, no errors (confirms the new `*.test.ts` files typecheck cleanly with the `"types": ["jest"]` addition).

- [ ] **Step 2: Typecheck web** (unaffected, but required by the project's verification gate)

```bash
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Typecheck convex** (unaffected, but required by the project's verification gate)

```bash
bun run typecheck:convex
```

Expected: PASS.

- [ ] **Step 4: Lint**

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 5: Convex tests** (unaffected, but required by the project's verification gate)

```bash
bun run test:convex
```

Expected: PASS.

- [ ] **Step 6: Mobile tests**

```bash
bun run test:mobile
```

Expected: PASS — 5 suites, 28 tests, 0 failures.

- [ ] **Step 7: Full aggregate test script**

```bash
bun run test
```

Expected: PASS (`test:web && test:convex && test:mobile`, all green).

No commit for this task — it's a verification checkpoint only. If any step fails, fix the root cause in the relevant task's files and re-commit there rather than patching forward here.
