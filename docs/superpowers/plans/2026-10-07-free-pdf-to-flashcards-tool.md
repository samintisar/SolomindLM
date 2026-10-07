# Free PDF → Flashcards Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/tools/pdf-to-flashcards`, a public no-signup page that turns a PDF or pasted notes into flashcards, exports them to Anki / Quizlet / CSV, and carries the deck into a notebook after signup (issue #93).

**Architecture:** The browser extracts PDF text with `pdfjs-dist` and POSTs it with an invisible Cloudflare Turnstile token to a Convex HTTP action (`/tools/flashcards`). The action verifies the token, checks a per-IP (salted SHA-256) and a global daily rate limit, runs one internal Node action that makes a single structured LLM call with the existing studio map prompt, and returns the cards. After sign-in, an authenticated `claimDeck` mutation creates a notebook, a text source and a completed flashcard set.

**Tech Stack:** Convex (httpAction, internalAction, `@convex-dev/rate-limiter`), Together structured output via `invokeStructuredOutput`, React 19 + React Router 7 + Vite, `pdfjs-dist`, Cloudflare Turnstile, Vitest + convex-test, Playwright.

**Spec:** [`docs/superpowers/specs/2026-10-07-free-pdf-to-flashcards-tool-design.md`](../specs/2026-10-07-free-pdf-to-flashcards-tool-design.md)

---

## Ground rules for every task

- Worktree: `C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\flash-card-generator-0dcc8e`, branch `feature/free-pdf-to-flashcards-tool`. Run every command from the worktree root.
- Read `convex/_generated/ai/guidelines.md` before the first Convex task.
- Commit by path: `git commit -m "…" -- <paths>` (other agents may share the worktree). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never `--no-verify`. If a hook fails, fix the cause.
- Never kill processes by name; use per-test timeouts.
- `test:convex` = `bun run test:convex -- <path>` to run one file; `test:web` = `bun run --cwd apps/web test -- <path>`.
- Configuration already done: Turnstile widget "SolomindLM free tools" (site key `0x4AAAAAAFQDDSV1WRFKhINF`, hostnames `solomindlm.com` + `localhost`); Convex env `TURNSTILE_SECRET_KEY` on dev + prod, `FREE_TOOL_IP_SALT` on dev. Prod salt is set in Task 19.

## File structure

**Convex (new)**
- `convex/_lib/freeToolBounds.ts` — pure constants and helpers shared with web: limits, word counting, truncation, deck title, request parsing.
- `convex/freeTools/clientIp.ts` — pure: client IP from headers, salted SHA-256 hash.
- `convex/freeTools/turnstile.ts` — pure: Turnstile siteverify call.
- `convex/freeTools/rateLimit.ts` — internal mutations: check / consume the two free-tool limits.
- `convex/freeTools/deck.ts` (`"use node"`) — pure: clean, filter, dedupe and cap generated cards.
- `convex/freeTools/flashcards.ts` (`"use node"`) — `internalAction generate`.
- `convex/freeTools/flashcardsHttp.ts` — HTTP handler functions (wrapped with `httpAction` in `convex/http.ts`).
- `convex/freeTools/claimDeck.ts` — authenticated `mutation claimDeck`.

**Convex (modified)**
- `convex/_lib/rateLimits.ts` — two new windows.
- `convex/http.ts` — two routes.

**Web (new, `apps/web/src/features/tools/`)**
- `toolPages.ts` — page copy/config (H1, steps, sections, FAQs) used by the page, SEO registry and prerender.
- `lib/flashcardExport.ts` — Anki / Quizlet / CSV formatters + download helper.
- `lib/pendingDeck.ts` — localStorage handoff of a deck across sign-in.
- `lib/extractPdfText.ts` — pdfjs text extraction.
- `lib/freeToolClient.ts` — `fetch` client for the HTTP endpoint.
- `hooks/useTurnstile.ts` — load + execute the invisible widget.
- `hooks/useClaimPendingDeck.ts` — after sign-in, claim a pending deck and open the notebook.
- `components/SourceInput.tsx`, `components/DeckPreview.tsx`, `components/ExportBar.tsx`.
- `pages/PdfToFlashcardsPage.tsx`.
- `apps/web/src/shared/seo/toolPrerenderHtml.ts` — crawler body.

**Web (modified)**
- `apps/web/src/App.tsx` — lazy route + `isPublicPage`.
- `apps/web/src/shared/seo/structuredData.ts`, `publicSeoPages.ts`, `publicSeoPrerenderHtml.ts`, `seoHtml.test.ts`.
- `apps/web/src/features/landing/components/Footer.tsx`, `intentLandingPages.ts`.
- `apps/web/src/features/notebooks/components/HomePage.tsx` — mount the claim hook.
- `apps/web/src/vite-env.d.ts`, `apps/web/vercel.json` (CSP), `apps/web/public/llms.txt`, `e2e/csp/csp.spec.ts`.
- New e2e: `e2e/tools/pdf-to-flashcards.spec.ts`.

---

### Task 0: Align the spec with two plan decisions

**Files:**
- Modify: `docs/superpowers/specs/2026-10-07-free-pdf-to-flashcards-tool-design.md`

Two refinements made while planning: the pending deck uses **localStorage with a 24 h expiry** (survives an email-verification tab or OAuth round trip; sessionStorage does not survive a new tab), and the public **site key is a code default** (`VITE_TURNSTILE_SITE_KEY` overrides it), so no Vercel env var is required.

- [ ] **Step 1: Edit the spec**

In the architecture block replace `→ sessionStorage { title, sourceText, cards } → AuthModal` with `→ localStorage { title, sourceText, cards, savedAt } (24 h expiry) → AuthModal`.
In "Frontend units" replace `` `lib/pendingDeck.ts` — sessionStorage read/write/clear (try/catch). `` with `` `lib/pendingDeck.ts` — localStorage read/write/clear (try/catch), 24 h expiry. ``
In "Configuration" replace `- Vercel / web env: \`VITE_TURNSTILE_SITE_KEY\`.` with `- Web: site key \`0x4AAAAAAFQDDSV1WRFKhINF\` is the code default; \`VITE_TURNSTILE_SITE_KEY\` overrides it (e.g. Cloudflare's test key \`1x00000000000000000000BB\`).`
Add under "Bounds": `- Client IP = last \`x-forwarded-for\` entry (not spoofable whether the edge appends or overwrites); verified on dev in the manual check.`

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(spec): pending deck in localStorage, site key as code default (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- docs/superpowers/specs/2026-10-07-free-pdf-to-flashcards-tool-design.md
```

---

### Task 1: Shared bounds and request parsing

**Files:**
- Create: `convex/_lib/freeToolBounds.ts`
- Test: `convex/_lib/freeToolBounds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/_lib/freeToolBounds.test.ts
import { describe, expect, test } from "vitest";
import {
  countWords,
  deriveDeckTitle,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
  parseFreeFlashcardRequest,
  truncateToWords,
} from "./freeToolBounds";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("countWords", () => {
  test("counts whitespace-separated words", () => {
    expect(countWords("  one two\nthree\t four ")).toBe(4);
  });
  test("is zero for blank text", () => {
    expect(countWords("   \n ")).toBe(0);
  });
});

describe("truncateToWords", () => {
  test("keeps text under the cap unchanged", () => {
    expect(truncateToWords("a b c", 5)).toEqual({ text: "a b c", truncated: false });
  });
  test("cuts after the Nth word and keeps original whitespace", () => {
    expect(truncateToWords("a  b\n\nc d e", 3)).toEqual({ text: "a  b\n\nc", truncated: true });
  });
});

describe("deriveDeckTitle", () => {
  test("uses the first line with letters, without markdown heading marks", () => {
    expect(deriveDeckTitle("\n\n# Cell Biology: Mitochondria\nBody text")).toBe(
      "Cell Biology: Mitochondria"
    );
  });
  test("caps long titles at a word boundary", () => {
    const title = deriveDeckTitle(`${"Photosynthesis ".repeat(20)}\nrest`);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith(" ")).toBe(false);
  });
  test("falls back to Flashcards", () => {
    expect(deriveDeckTitle("12 34\n--")).toBe("Flashcards");
  });
});

describe("parseFreeFlashcardRequest", () => {
  const valid = {
    text: words(FREE_FLASHCARD_MIN_WORDS),
    cardCount: 20,
    turnstileToken: "tok",
  };

  test("accepts a valid body", () => {
    expect(parseFreeFlashcardRequest(valid)).toEqual({ ok: true, value: valid });
  });
  test("rejects non-objects", () => {
    expect(parseFreeFlashcardRequest(null)).toEqual({ ok: false, error: "invalid_body" });
  });
  test("rejects a card count outside 10/20/30", () => {
    expect(parseFreeFlashcardRequest({ ...valid, cardCount: 25 })).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });
  test("rejects a missing token", () => {
    expect(parseFreeFlashcardRequest({ ...valid, turnstileToken: "" })).toEqual({
      ok: false,
      error: "missing_token",
    });
  });
  test("rejects short text", () => {
    expect(
      parseFreeFlashcardRequest({ ...valid, text: words(FREE_FLASHCARD_MIN_WORDS - 1) })
    ).toEqual({ ok: false, error: "text_too_short" });
  });
  test("rejects long text", () => {
    expect(
      parseFreeFlashcardRequest({ ...valid, text: words(FREE_FLASHCARD_MAX_WORDS + 1) })
    ).toEqual({ ok: false, error: "text_too_long" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/_lib/freeToolBounds.test.ts`
Expected: FAIL — `Failed to resolve import "./freeToolBounds"`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/_lib/freeToolBounds.ts
/**
 * Bounds for the free no-signup flashcard tool (/tools/pdf-to-flashcards).
 * Pure module: imported by the Convex HTTP handler and by the web page (`@convex/_lib/freeToolBounds`),
 * so client-side validation and server-side enforcement use the same numbers.
 */

export const FREE_FLASHCARD_MIN_WORDS = 80;
export const FREE_FLASHCARD_MAX_WORDS = 12_000;
/** Request body cap. ~12k words of prose is ~80 KB; this leaves room for long words and JSON. */
export const FREE_FLASHCARD_MAX_BODY_BYTES = 200_000;
export const FREE_FLASHCARD_MAX_PDF_PAGES = 40;
export const FREE_FLASHCARD_CARD_COUNTS = [10, 20, 30] as const;
export type FreeFlashcardCardCount = (typeof FREE_FLASHCARD_CARD_COUNTS)[number];
export const FREE_FLASHCARD_DEFAULT_CARD_COUNT: FreeFlashcardCardCount = 20;
/** Runs per hashed IP per day. */
export const FREE_FLASHCARD_IP_DAILY_LIMIT = 3;
/** All anonymous runs per day: the cost circuit breaker. */
export const FREE_FLASHCARD_GLOBAL_DAILY_LIMIT = 300;
export const FREE_FLASHCARD_LLM_TIMEOUT_MS = 90_000;

const TITLE_MAX_CHARS = 80;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Keep the first `maxWords` words, preserving the original whitespace between them. */
export function truncateToWords(
  text: string,
  maxWords: number
): { text: string; truncated: boolean } {
  const wordPattern = /\S+/g;
  let count = 0;
  let match: RegExpExecArray | null = wordPattern.exec(text);
  while (match) {
    count++;
    if (count === maxWords) {
      const end = match.index + match[0].length;
      const rest = text.slice(end);
      return /\S/.test(rest)
        ? { text: text.slice(0, end), truncated: true }
        : { text, truncated: false };
    }
    match = wordPattern.exec(text);
  }
  return { text, truncated: false };
}

/** First line that contains letters, minus markdown heading marks, capped at a word boundary. */
export function deriveDeckTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^#{1,6}\s+/, "").trim())
    .find((l) => /\p{L}{2,}/u.test(l));
  if (!line) return "Flashcards";
  if (line.length <= TITLE_MAX_CHARS) return line;
  const cut = line.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

export type FreeFlashcardRequest = {
  text: string;
  cardCount: FreeFlashcardCardCount;
  turnstileToken: string;
};

export type FreeFlashcardRequestError =
  | "invalid_body"
  | "missing_token"
  | "text_too_short"
  | "text_too_long";

export type FreeFlashcardRequestParse =
  | { ok: true; value: FreeFlashcardRequest }
  | { ok: false; error: FreeFlashcardRequestError };

export function parseFreeFlashcardRequest(body: unknown): FreeFlashcardRequestParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { text, cardCount, turnstileToken } = body as Record<string, unknown>;
  if (typeof text !== "string" || typeof turnstileToken !== "string") {
    return { ok: false, error: "invalid_body" };
  }
  if (!FREE_FLASHCARD_CARD_COUNTS.includes(cardCount as FreeFlashcardCardCount)) {
    return { ok: false, error: "invalid_body" };
  }
  if (!turnstileToken.trim()) return { ok: false, error: "missing_token" };
  const wordCount = countWords(text);
  if (wordCount < FREE_FLASHCARD_MIN_WORDS) return { ok: false, error: "text_too_short" };
  if (wordCount > FREE_FLASHCARD_MAX_WORDS) return { ok: false, error: "text_too_long" };
  return {
    ok: true,
    value: { text, cardCount: cardCount as FreeFlashcardCardCount, turnstileToken },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- convex/_lib/freeToolBounds.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/_lib/freeToolBounds.ts convex/_lib/freeToolBounds.test.ts
git commit -m "feat(free-tools): shared bounds and request parsing for the flashcard tool (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/_lib/freeToolBounds.ts convex/_lib/freeToolBounds.test.ts
```

---

### Task 2: Rate-limit windows

**Files:**
- Modify: `convex/_lib/rateLimits.ts` (imports at line 12, `RATE_LIMIT_CONFIG` at lines 38–49)
- Test: `convex/_lib/limits.test.ts` (append a test inside the existing `describe` that holds the "every rate-limiter window is derived…" test, around line 236)

- [ ] **Step 1: Write the failing test**

Add to `convex/_lib/limits.test.ts`, next to the existing "every rate-limiter window is derived from the same accessor value" test:

```ts
  test("free-tool windows come from freeToolBounds", async () => {
    const bounds = await import("./freeToolBounds");
    expect(rateLimitsModule.RATE_LIMIT_CONFIG.freeToolFlashcardsIp).toEqual({
      kind: "fixed window",
      rate: bounds.FREE_FLASHCARD_IP_DAILY_LIMIT,
      period: 24 * 60 * 60 * 1000,
    });
    expect(rateLimitsModule.RATE_LIMIT_CONFIG.freeToolFlashcardsGlobal).toEqual({
      kind: "fixed window",
      rate: bounds.FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
      period: 24 * 60 * 60 * 1000,
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/_lib/limits.test.ts`
Expected: FAIL — `expected undefined to deeply equal { kind: 'fixed window', … }`.

- [ ] **Step 3: Add the windows**

In `convex/_lib/rateLimits.ts` add the import after the `./errors` import:

```ts
import {
  FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
  FREE_FLASHCARD_IP_DAILY_LIMIT,
} from "./freeToolBounds";
```

and add inside `RATE_LIMIT_CONFIG`, after `feedbackSubmit`:

```ts
  /** Free no-signup flashcard tool: runs per salted-hash IP per day */
  freeToolFlashcardsIp: { kind: "fixed window", rate: FREE_FLASHCARD_IP_DAILY_LIMIT, period: DAY },
  /** Free no-signup flashcard tool: all anonymous runs per day (cost circuit breaker, single key) */
  freeToolFlashcardsGlobal: {
    kind: "fixed window",
    rate: FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
    period: DAY,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- convex/_lib/limits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(free-tools): per-IP and global daily limits for the flashcard tool (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/_lib/rateLimits.ts convex/_lib/limits.test.ts
```

---

### Task 3: Client IP and hashing

**Files:**
- Create: `convex/freeTools/clientIp.ts`
- Test: `convex/freeTools/clientIp.test.ts`

The last `x-forwarded-for` entry is the address the nearest trusted proxy saw. If the edge appends to a client-sent header, the client controls only the earlier entries; if it overwrites, first = last. Task 19 verifies this on dev.

- [ ] **Step 1: Write the failing test**

```ts
// convex/freeTools/clientIp.test.ts
import { describe, expect, test } from "vitest";
import { clientIpFromHeaders, forwardedForHopCount, hashClientIp } from "./clientIp";

describe("clientIpFromHeaders", () => {
  test("takes the last x-forwarded-for entry", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.9");
  });
  test("a spoofed first entry does not change the result", () => {
    const a = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    const b = new Headers({ "x-forwarded-for": "7.7.7.7, 203.0.113.9" });
    expect(clientIpFromHeaders(a)).toBe(clientIpFromHeaders(b));
  });
  test("falls back to x-real-ip, then null", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": " 198.51.100.4 " }))).toBe(
      "198.51.100.4"
    );
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});

describe("forwardedForHopCount", () => {
  test("counts non-empty entries", () => {
    expect(forwardedForHopCount(new Headers({ "x-forwarded-for": "a, b,," }))).toBe(2);
    expect(forwardedForHopCount(new Headers())).toBe(0);
  });
});

describe("hashClientIp", () => {
  test("is a stable 64-char hex digest that does not contain the IP", async () => {
    const a = await hashClientIp("203.0.113.9", "salt");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("203.0.113.9");
    expect(await hashClientIp("203.0.113.9", "salt")).toBe(a);
  });
  test("depends on the salt", async () => {
    expect(await hashClientIp("203.0.113.9", "a")).not.toBe(
      await hashClientIp("203.0.113.9", "b")
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/freeTools/clientIp.test.ts`
Expected: FAIL — cannot resolve `./clientIp`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/freeTools/clientIp.ts
/**
 * Caller identity for anonymous rate limiting. Only the salted hash is ever stored (as a
 * rate-limiter key) — never log or persist the raw address.
 */

function forwardedForEntries(headers: Headers): string[] {
  return (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The last `x-forwarded-for` entry: whether the edge appends to a client-supplied header or
 * overwrites it, the last entry is the one the edge itself saw.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const entries = forwardedForEntries(headers);
  if (entries.length > 0) return entries[entries.length - 1];
  return headers.get("x-real-ip")?.trim() || null;
}

/** Number of x-forwarded-for entries — logged (not the values) to confirm the edge's behaviour. */
export function forwardedForHopCount(headers: Headers): number {
  return forwardedForEntries(headers).length;
}

export async function hashClientIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- convex/freeTools/clientIp.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(free-tools): spoof-resistant client IP and salted hash (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/clientIp.ts convex/freeTools/clientIp.test.ts
```

---

### Task 4: Turnstile verification

**Files:**
- Create: `convex/freeTools/turnstile.ts`
- Test: `convex/freeTools/turnstile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/freeTools/turnstile.test.ts
import { describe, expect, test, vi } from "vitest";
import { TURNSTILE_SITEVERIFY_URL, verifyTurnstileToken } from "./turnstile";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("verifyTurnstileToken", () => {
  test("posts secret, token and IP to siteverify and accepts success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const result = await verifyTurnstileToken({
      token: "tok",
      secret: "sec",
      remoteIp: "203.0.113.9",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: "sec", response: "tok", remoteip: "203.0.113.9" }),
    });
  });

  test("omits remoteip when unknown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    await verifyTurnstileToken({ token: "tok", secret: "sec", remoteIp: null, fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      secret: "sec",
      response: "tok",
    });
  });

  test("returns Cloudflare's error codes on failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl })).toEqual({
      ok: false,
      codes: ["timeout-or-duplicate"],
    });
  });

  test("treats HTTP errors and network failures as failures", async () => {
    const http = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: http })).toEqual({
      ok: false,
      codes: ["siteverify_http_500"],
    });
    const down = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    expect(await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl: down })).toEqual({
      ok: false,
      codes: ["siteverify_unreachable"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/freeTools/turnstile.test.ts`
Expected: FAIL — cannot resolve `./turnstile`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/freeTools/turnstile.ts
/** Server-side Cloudflare Turnstile check. Tokens are single-use and expire after 300 s. */

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; codes: string[] };

export async function verifyTurnstileToken(args: {
  token: string;
  secret: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const payload: Record<string, string> = { secret: args.secret, response: args.token };
  if (args.remoteIp) payload.remoteip = args.remoteIp;

  let response: Response;
  try {
    response = await fetchImpl(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, codes: ["siteverify_unreachable"] };
  }
  if (!response.ok) return { ok: false, codes: [`siteverify_http_${response.status}`] };

  const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
  return body.success === true ? { ok: true } : { ok: false, codes: body["error-codes"] ?? [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- convex/freeTools/turnstile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(free-tools): Turnstile siteverify client (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/turnstile.ts convex/freeTools/turnstile.test.ts
```

---

### Task 5: Deck post-processing

**Files:**
- Create: `convex/freeTools/deck.ts`
- Test: `convex/freeTools/deck.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/freeTools/deck.test.ts
import { describe, expect, test } from "vitest";
import type { Flashcard } from "../_agents/flashcard/prompts";
import { buildFreeDeck, cardsToRequest } from "./deck";

const card = (front: string, back: string): Flashcard => ({ type: "wh-question", front, back });

describe("cardsToRequest", () => {
  test("asks for a 25% buffer so filtering still reaches the target", () => {
    expect(cardsToRequest(10)).toBe(13);
    expect(cardsToRequest(20)).toBe(25);
    expect(cardsToRequest(30)).toBe(38);
  });
});

describe("buildFreeDeck", () => {
  test("drops cards with an empty side", () => {
    const deck = buildFreeDeck(
      [card("What produces ATP in the cell?", "Mitochondria"), card("", "x"), card("Q?", "")],
      10
    );
    expect(deck.map((c) => c.front)).toEqual(["What produces ATP in the cell?"]);
  });

  test("drops exact duplicates", () => {
    const a = card("What produces ATP in the cell?", "Mitochondria");
    expect(buildFreeDeck([a, { ...a }], 10)).toHaveLength(1);
  });

  test("caps the deck at cardCount", () => {
    const cards = Array.from({ length: 12 }, (_, i) =>
      card(`What is distinct concept number ${i} about enzymes?`, `Answer ${i}`)
    );
    expect(buildFreeDeck(cards, 10)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/freeTools/deck.test.ts`
Expected: FAIL — cannot resolve `./deck`.

- [ ] **Step 3: Write the implementation**

```ts
// convex/freeTools/deck.ts
"use node";

import { heuristicDedupeFlashcards, isUsableFlashcard } from "../_agents/flashcard/flashcardHeuristics";
import type { Flashcard } from "../_agents/flashcard/prompts";
import { cleanBackText, cleanFrontText } from "../_agents/flashcard/textCleanup";

/** Request more than needed: the usability filter and dedupe usually drop a few. */
export function cardsToRequest(cardCount: number): number {
  return Math.ceil(cardCount * 1.25);
}

/** Same cleanup, defect filter and dedupe the studio pipeline applies, capped at `cardCount`. */
export function buildFreeDeck(raw: Flashcard[], cardCount: number): Flashcard[] {
  const cleaned = raw.map((c) => ({
    ...c,
    front: cleanFrontText(c.front ?? ""),
    back: cleanBackText(c.back ?? ""),
  }));
  const { dedupedFlashcards } = heuristicDedupeFlashcards(cleaned.filter(isUsableFlashcard));
  return dedupedFlashcards.slice(0, cardCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:convex -- convex/freeTools/deck.test.ts`
Expected: PASS (4 tests). If "drops exact duplicates" fails because `heuristicDedupeFlashcards` keys on more than the front, read `convex/_agents/flashcard/flashcardHeuristics.ts:236` and adjust the test's duplicate to match its key — do not change the heuristic.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(free-tools): reuse studio cleanup, filter and dedupe for the free deck (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/deck.ts convex/freeTools/deck.test.ts
```

---

### Task 6: Rate-limit mutations

**Files:**
- Create: `convex/freeTools/rateLimit.ts`

Covered by the HTTP handler tests in Task 8 (they exercise check + consume through the real rate-limiter component).

- [ ] **Step 1: Write the implementation**

```ts
// convex/freeTools/rateLimit.ts
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { rateLimiter } from "../_lib/rateLimits";

const checkResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({
    ok: v.literal(false),
    scope: v.union(v.literal("ip"), v.literal("global")),
    retryAfterMs: v.number(),
  })
);

/** Check (without consuming) the per-IP window, then the global window. */
export const checkFreeFlashcardLimits = internalMutation({
  args: { ipKey: v.string() },
  returns: checkResult,
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.check(ctx, "freeToolFlashcardsIp", { key: ipKey });
    if (!ip.ok) return { ok: false as const, scope: "ip" as const, retryAfterMs: ip.retryAfter };
    const global = await rateLimiter.check(ctx, "freeToolFlashcardsGlobal");
    if (!global.ok) {
      return { ok: false as const, scope: "global" as const, retryAfterMs: global.retryAfter };
    }
    return { ok: true as const };
  },
});

/** Consume one run from both windows. Called only after cards were generated. */
export const consumeFreeFlashcardLimits = internalMutation({
  args: { ipKey: v.string() },
  returns: v.null(),
  handler: async (ctx, { ipKey }) => {
    const ip = await rateLimiter.limit(ctx, "freeToolFlashcardsIp", { key: ipKey });
    const global = await rateLimiter.limit(ctx, "freeToolFlashcardsGlobal");
    if (!ip.ok || !global.ok) {
      // A concurrent request took the last slot between check and consume; the work is done.
      console.warn("[FreeTools] limit consumed past the window", { ip: ip.ok, global: global.ok });
    }
    return null;
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS. (`internal.freeTools.*` types appear after codegen in Task 8.)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(free-tools): check and consume the free-tool rate limits (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/rateLimit.ts
```

---

### Task 7: Generate action

**Files:**
- Create: `convex/freeTools/flashcards.ts`

Exercised end-to-end by Task 8 with `invokeStructuredOutput` mocked. No prompt change: it reuses `getMapPrompt` + `MAP_SYSTEM_PROMPT` exactly as the studio map phase does, so no eval run is needed.

- [ ] **Step 1: Write the implementation**

```ts
// convex/freeTools/flashcards.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { FlashcardArraySchema, getMapPrompt, MAP_SYSTEM_PROMPT } from "../_agents/flashcard/prompts";
import { invokeStructuredOutput } from "../_agents/_shared/structuredLlm";
import { invokeWithTimeout } from "../_agents/_shared/timeout";
import { env } from "../_lib/env";
import { deriveDeckTitle, FREE_FLASHCARD_LLM_TIMEOUT_MS } from "../_lib/freeToolBounds";
import { normalizeMathMarkdownDeep } from "../_shared/mathMarkdown";
import { buildFreeDeck, cardsToRequest } from "./deck";

export const freeDeckCardValidator = v.object({
  type: v.union(
    v.literal("wh-question"),
    v.literal("fill-blank"),
    v.literal("true-false"),
    v.literal("definition"),
    v.literal("scenario")
  ),
  front: v.string(),
  back: v.string(),
  topic: v.optional(v.union(v.string(), v.null())),
});

/** One structured call over the whole (already bounded) text: the studio single-chunk path. */
export const generate = internalAction({
  args: { text: v.string(), cardCount: v.number() },
  returns: v.object({ title: v.string(), cards: v.array(freeDeckCardValidator) }),
  handler: async (_ctx, { text, cardCount }) => {
    const response = await invokeWithTimeout(
      () =>
        invokeStructuredOutput({
          systemPrompt: MAP_SYSTEM_PROMPT,
          userPrompt: getMapPrompt({
            chunk: text,
            cardCount,
            cardsPerChunk: cardsToRequest(cardCount),
            difficulty: "medium",
          }),
          schema: FlashcardArraySchema,
          schemaName: "flashcards",
          model: env.FAST_LLM,
          maxTokens: 8192,
          logPrefix: "FreeFlashcards",
        }),
      FREE_FLASHCARD_LLM_TIMEOUT_MS,
      "free_flashcards"
    );

    const cards = normalizeMathMarkdownDeep(buildFreeDeck(response.flashcards, cardCount));
    if (cards.length === 0) throw new Error("no_usable_cards");
    return {
      title: deriveDeckTitle(text),
      cards: cards.map(({ type, front, back, topic }) => ({ type, front, back, topic })),
    };
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck:convex`
Expected: PASS. If `normalizeMathMarkdownDeep` returns `unknown`, cast: `normalizeMathMarkdownDeep(deck) as typeof deck` with `const deck = buildFreeDeck(...)`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(free-tools): single-call flashcard generation action (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/flashcards.ts
```

---

### Task 8: HTTP handler and routes

**Files:**
- Create: `convex/freeTools/flashcardsHttp.ts`
- Modify: `convex/http.ts` (add an import near the top, routes before `export default http;`)
- Test: `convex/freeTools/flashcardsHttp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/freeTools/flashcardsHttp.test.ts
/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { invokeStructuredOutput } from "../_agents/_shared/structuredLlm";
import { FREE_FLASHCARD_GLOBAL_DAILY_LIMIT, FREE_FLASHCARD_MIN_WORDS } from "../_lib/freeToolBounds";
import { rateLimiter } from "../_lib/rateLimits";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

vi.mock("../_agents/_shared/structuredLlm", () => ({ invokeStructuredOutput: vi.fn() }));

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, [
  "./http.ts",
  "./freeTools/flashcards.ts",
  "./freeTools/flashcardsHttp.ts",
  "./freeTools/rateLimit.ts",
]);
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

const TEXT = `# Cell energy\n${Array.from({ length: FREE_FLASHCARD_MIN_WORDS + 20 }, (_, i) => `word${i}`).join(" ")}`;
const CARDS = Array.from({ length: 25 }, (_, i) => ({
  type: "wh-question",
  front: `What is distinct fact number ${i} about mitochondria?`,
  back: `Fact ${i}`,
  topic: "Biology",
}));

function makeT() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

const siteverify = vi.fn();

function post(
  t: ReturnType<typeof makeT>,
  body: unknown,
  ip = "203.0.113.9"
): Promise<Response> {
  return t.fetch("/tools/flashcards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      "x-forwarded-for": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = { text: TEXT, cardCount: 20, turnstileToken: "tok" };

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
  vi.stubEnv("FREE_TOOL_IP_SALT", "test-salt");
  siteverify.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  vi.stubGlobal("fetch", siteverify);
  vi.mocked(invokeStructuredOutput).mockResolvedValue({ flashcards: CARDS });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /tools/flashcards", () => {
  test("returns a titled deck of at most cardCount cards with CORS headers", async () => {
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    const body = await res.json();
    expect(body.title).toBe("Cell energy");
    expect(body.cards).toHaveLength(20);
    expect(body.cards[0]).toMatchObject({ front: expect.any(String), back: expect.any(String) });
  });

  test("answers the CORS preflight", async () => {
    const t = makeT();
    const res = await t.fetch("/tools/flashcards", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  test("400 on invalid JSON and on short text, without calling Turnstile", async () => {
    const t = makeT();
    expect((await post(t, "{not json")).status).toBe(400);
    const short = await post(t, { ...validBody, text: "too short" });
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "text_too_short" });
    expect(siteverify).not.toHaveBeenCalled();
  });

  test("413 when the body is over the byte cap", async () => {
    const t = makeT();
    const res = await post(t, { ...validBody, text: "x".repeat(250_000) });
    expect(res.status).toBe(413);
  });

  test("403 when Turnstile rejects the token, without generating", async () => {
    siteverify.mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }))
    );
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "captcha_failed" });
    expect(invokeStructuredOutput).not.toHaveBeenCalled();
  });

  test("429 ip after 3 successful runs; a spoofed first hop does not reset it", async () => {
    const t = makeT();
    for (let i = 0; i < 3; i++) {
      expect((await post(t, validBody, `10.0.0.${i}, 203.0.113.9`)).status).toBe(200);
    }
    const res = await post(t, validBody, "10.9.9.9, 203.0.113.9");
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "ip" });
  });

  test("a different IP is not affected by another IP's limit", async () => {
    const t = makeT();
    for (let i = 0; i < 3; i++) await post(t, validBody, "203.0.113.9");
    expect((await post(t, validBody, "198.51.100.7")).status).toBe(200);
  });

  test("429 global when the daily cap is used up", async () => {
    const t = makeT();
    await t.run(async (ctx) => {
      await rateLimiter.limit(ctx, "freeToolFlashcardsGlobal", {
        count: FREE_FLASHCARD_GLOBAL_DAILY_LIMIT,
      });
    });
    const res = await post(t, validBody);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "rate_limited", scope: "global" });
  });

  test("a failed generation returns 502 and does not consume the limit", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValueOnce(new Error("upstream 500"));
    const t = makeT();
    const failed = await post(t, validBody);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "generation_failed" });
    for (let i = 0; i < 3; i++) expect((await post(t, validBody)).status).toBe(200);
  });

  test("a timeout returns 504", async () => {
    vi.mocked(invokeStructuredOutput).mockRejectedValueOnce(
      new Error("free_flashcards timeout after 90000ms")
    );
    const t = makeT();
    const res = await post(t, validBody);
    expect(res.status).toBe(504);
  });

  test("503 when the server is not configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const t = makeT();
    expect((await post(t, validBody)).status).toBe(503);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/freeTools/flashcardsHttp.test.ts`
Expected: FAIL — 404 responses (route not registered) / cannot resolve `./freeTools/flashcardsHttp.ts`.

- [ ] **Step 3: Write the handler**

```ts
// convex/freeTools/flashcardsHttp.ts
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { allowedOrigins } from "../_lib/allowedOrigins";
import {
  countWords,
  FREE_FLASHCARD_MAX_BODY_BYTES,
  parseFreeFlashcardRequest,
} from "../_lib/freeToolBounds";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { clientIpFromHeaders, forwardedForHopCount, hashClientIp } from "./clientIp";
import { verifyTurnstileToken } from "./turnstile";

/** Anonymous endpoint: no credentials, so no Allow-Credentials and only Content-Type allowed. */
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "origin",
  };
}

export async function handleFreeFlashcardsOptions(
  _ctx: ActionCtx,
  request: Request
): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

/**
 * POST /tools/flashcards — the free no-signup flashcard tool.
 * Order matters for cost: cheap validation → Turnstile → rate limits → one LLM call.
 * Limits are consumed only after cards were generated. Raw IPs are never logged or stored.
 */
export async function handleFreeFlashcardsPost(
  ctx: ActionCtx,
  request: Request
): Promise<Response> {
  const headers = corsHeaders(request.headers.get("origin"));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  const logger = createServiceLogger("free_tools", "flashcards");

  const declaredBytes = Number(request.headers.get("content-length") ?? 0);
  if (declaredBytes > FREE_FLASHCARD_MAX_BODY_BYTES) return json(413, { error: "too_large" });
  const raw = await request.text();
  if (raw.length > FREE_FLASHCARD_MAX_BODY_BYTES) return json(413, { error: "too_large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const parsed = parseFreeFlashcardRequest(body);
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { text, cardCount, turnstileToken } = parsed.value;

  // Read at call time (not the env.ts snapshot) so a rotated secret applies without a redeploy.
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const salt = process.env.FREE_TOOL_IP_SALT;
  if (!secret || !salt) {
    logger.error("free_tool_not_configured", undefined, { secret: !!secret, salt: !!salt });
    return json(503, { error: "unavailable" });
  }

  const ip = clientIpFromHeaders(request.headers);
  const hops = forwardedForHopCount(request.headers);
  const turnstile = await verifyTurnstileToken({ token: turnstileToken, secret, remoteIp: ip });
  if (!turnstile.ok) {
    logger.warn("turnstile_rejected", { codes: turnstile.codes });
    return json(403, { error: "captcha_failed" });
  }

  const ipKey = await hashClientIp(ip ?? "unknown", salt);
  const limit = await ctx.runMutation(internal.freeTools.rateLimit.checkFreeFlashcardLimits, {
    ipKey,
  });
  if (!limit.ok) {
    logger.info("rate_limited", { scope: limit.scope });
    return json(429, { error: "rate_limited", scope: limit.scope, retryAfterMs: limit.retryAfterMs });
  }

  const startedAt = Date.now();
  try {
    const deck = await ctx.runAction(internal.freeTools.flashcards.generate, { text, cardCount });
    await ctx.runMutation(internal.freeTools.rateLimit.consumeFreeFlashcardLimits, { ipKey });
    logger.info("generated", {
      cards: deck.cards.length,
      requested: cardCount,
      words: countWords(text),
      durationMs: Date.now() - startedAt,
      xffHops: hops,
      ipKnown: ip !== null,
    });
    return json(200, deck);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.includes("timeout");
    logger.warn("generation_failed", { message, timedOut, durationMs: Date.now() - startedAt });
    return json(timedOut ? 504 : 502, { error: timedOut ? "timeout" : "generation_failed" });
  }
}
```

- [ ] **Step 4: Register the routes**

In `convex/http.ts` add after the `./auth` import:

```ts
import { handleFreeFlashcardsOptions, handleFreeFlashcardsPost } from "./freeTools/flashcardsHttp";
```

and before `export default http;`:

```ts
// ============================================================
// Free tools (anonymous, Turnstile + per-IP/global rate limits)
// ============================================================

http.route({
  path: "/tools/flashcards",
  method: "OPTIONS",
  handler: httpAction(handleFreeFlashcardsOptions),
});

http.route({
  path: "/tools/flashcards",
  method: "POST",
  handler: httpAction(handleFreeFlashcardsPost),
});
```

- [ ] **Step 5: Regenerate Convex types**

Run: `npx convex codegen`
Expected: completes; `git status` shows `convex/_generated/api.d.ts` modified with `freeTools/*` and `_lib/freeToolBounds` entries.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test:convex -- convex/freeTools/flashcardsHttp.test.ts`
Expected: PASS (11 tests). If `logger.error` has a different signature than `(message, error, meta)`, check `convex/_lib/logging/serviceLogger.ts:160` and adapt the call.

- [ ] **Step 7: Run the whole Convex suite and typecheck**

Run: `bun run typecheck:convex && bun run test:convex`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(free-tools): anonymous POST /tools/flashcards with Turnstile and rate limits (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools/flashcardsHttp.ts convex/freeTools/flashcardsHttp.test.ts convex/http.ts convex/_generated
```

---

### Task 9: `claimDeck` mutation

**Files:**
- Create: `convex/freeTools/claimDeck.ts`
- Test: `convex/freeTools/claimDeck.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/freeTools/claimDeck.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { FREE_FLASHCARD_MIN_WORDS } from "../_lib/freeToolBounds";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const SOURCE = Array.from({ length: FREE_FLASHCARD_MIN_WORDS + 5 }, (_, i) => `w${i}`).join(" ");
const CARDS = [
  { type: "wh-question" as const, front: "What makes ATP?", back: "Mitochondria", topic: null },
  { type: "true-false" as const, front: "True or False: plants lack mitochondria.", back: "False" },
];

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "T" }));
}

describe("freeTools.claimDeck.claimDeck", () => {
  test("requires sign-in", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.freeTools.claimDeck.claimDeck, { title: "Deck", sourceText: SOURCE, cards: CARDS })
    ).rejects.toThrow("Unauthenticated");
  });

  test("creates a notebook, a text source and a completed deck", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|s1` });

    const { notebookId, flashcardId } = await asUser.mutation(api.freeTools.claimDeck.claimDeck, {
      title: "Cell energy",
      sourceText: SOURCE,
      cards: CARDS,
    });

    const { notebook, docs, deck } = await t.run(async (ctx) => ({
      notebook: await ctx.db.get(notebookId),
      docs: await ctx.db
        .query("documents")
        .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
        .collect(),
      deck: await ctx.db.get(flashcardId),
    }));

    expect(notebook).toMatchObject({ userId, title: "Cell energy" });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      fileType: "text",
      fileName: "Cell energy",
      fileUrl: SOURCE,
      status: "pending",
    });
    expect(deck).toMatchObject({ userId, notebookId, status: "completed", title: "Cell energy" });
    expect(deck?.cardsData).toHaveLength(2);
    expect(deck?.metadata).toMatchObject({ cardCount: 2, source: "free_tool" });
  });

  test("rejects an empty or oversized deck", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = t.withIdentity({ subject: `${userId}|s1` });
    await expect(
      asUser.mutation(api.freeTools.claimDeck.claimDeck, { title: "D", sourceText: SOURCE, cards: [] })
    ).rejects.toThrow();
    const many = Array.from({ length: 31 }, () => CARDS[0]);
    await expect(
      asUser.mutation(api.freeTools.claimDeck.claimDeck, { title: "D", sourceText: SOURCE, cards: many })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:convex -- convex/freeTools/claimDeck.test.ts`
Expected: FAIL — `api.freeTools.claimDeck` is undefined.

- [ ] **Step 3: Write the implementation**

```ts
// convex/freeTools/claimDeck.ts
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import {
  countWords,
  FREE_FLASHCARD_CARD_COUNTS,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
} from "../_lib/freeToolBounds";
import { checkNotebookLimit } from "../_lib/limits";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import * as Notebooks from "../_model/notebooks";
import { normalizeMathMarkdownDeep } from "../_shared/mathMarkdown";
import { getAuthUserId } from "../auth";
import { freeDeckCardValidator } from "./flashcards";

const MAX_CARDS = Math.max(...FREE_FLASHCARD_CARD_COUNTS);
const MAX_CARD_SIDE_CHARS = 4000;

/**
 * Save a deck made with the free tool: new notebook + the source text as a `text` source
 * (embedded like any pasted text) + a completed flashcard set ready for the Due queue.
 */
export const claimDeck = mutation({
  args: {
    title: v.string(),
    sourceText: v.string(),
    cards: v.array(freeDeckCardValidator),
  },
  returns: v.object({ notebookId: v.id("notebooks"), flashcardId: v.id("flashcards") }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    const words = countWords(args.sourceText);
    if (words < FREE_FLASHCARD_MIN_WORDS || words > FREE_FLASHCARD_MAX_WORDS) {
      throw new InputValidationError("Source text is outside the free tool's limits", {
        field: "sourceText",
      });
    }
    if (args.cards.length === 0 || args.cards.length > MAX_CARDS) {
      throw new InputValidationError(`A deck needs 1–${MAX_CARDS} cards`, { field: "cards" });
    }
    if (args.cards.some((c) => c.front.length > MAX_CARD_SIDE_CHARS || c.back.length > MAX_CARD_SIDE_CHARS)) {
      throw new InputValidationError("A card is too long", { field: "cards" });
    }

    await checkNotebookLimit(ctx);

    const title = (args.title.trim() || "Flashcards").slice(0, TEXT_TITLE_MAX_LENGTH);
    const notebookId = await Notebooks.createNotebook(ctx, { userId, title });
    const now = Date.now();

    // Same shape documents.upload writes for pasted text (fileUrl holds the text).
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: title,
      fileType: "text",
      fileUrl: args.sourceText,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
      documentId,
      userId,
      notebookId,
    });

    const cards = normalizeMathMarkdownDeep(args.cards);
    const flashcardId = await ctx.db.insert("flashcards", {
      userId,
      notebookId,
      title,
      status: "completed",
      cardsData: cards,
      metadata: {
        title,
        cardCount: args.cards.length,
        phase: "completed",
        progress: 100,
        completedAt: now,
        source: "free_tool",
      },
      createdAt: now,
      updatedAt: now,
    });

    return { notebookId, flashcardId };
  },
});
```

- [ ] **Step 4: Regenerate and run the test**

Run: `npx convex codegen && bun run test:convex -- convex/freeTools/claimDeck.test.ts`
Expected: PASS (3 tests). If importing `freeDeckCardValidator` from a `"use node"` file is rejected by codegen ("use node" modules can only be imported by other Node modules), move `freeDeckCardValidator` into a new non-node file `convex/freeTools/validators.ts` and import it from both `flashcards.ts` and `claimDeck.ts`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(free-tools): claimDeck saves a free-tool deck into a new notebook (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- convex/freeTools convex/_generated
```

---

### Task 10: Export formatters

**Files:**
- Create: `apps/web/src/features/tools/lib/flashcardExport.ts`
- Test: `apps/web/src/features/tools/lib/flashcardExport.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/tools/lib/flashcardExport.test.ts
import { describe, expect, it } from "vitest";
import { exportFileName, toAnkiText, toCsv, toQuizletText } from "./flashcardExport";

const cards = [
  { front: "What makes ATP?", back: "Mitochondria" },
  { front: 'Define "osmosis"\n(short)', back: "Water moves\tacross a membrane" },
];

describe("toAnkiText", () => {
  it("writes Anki's file headers and one tab-separated card per line", () => {
    expect(toAnkiText(cards)).toBe(
      [
        "#separator:tab",
        "#html:false",
        "#columns:Front\tBack",
        "What makes ATP?\tMitochondria",
        'Define "osmosis" (short)\tWater moves across a membrane',
        "",
      ].join("\n")
    );
  });
});

describe("toQuizletText", () => {
  it("writes term TAB definition, one card per line, no headers", () => {
    expect(toQuizletText(cards)).toBe(
      'What makes ATP?\tMitochondria\nDefine "osmosis" (short)\tWater moves across a membrane'
    );
  });
});

describe("toCsv", () => {
  it("starts with a BOM and quotes every cell", () => {
    const csv = toCsv(cards);
    expect(csv.startsWith("\uFEFFFront,Back\r\n")).toBe(true);
    expect(csv).toContain('"Define ""osmosis""\n(short)","Water moves\tacross a membrane"');
  });
});

describe("exportFileName", () => {
  it("slugs the title", () => {
    expect(exportFileName("Cell Biology: Mitochondria!", "txt")).toBe(
      "cell-biology-mitochondria-flashcards.txt"
    );
  });
  it("falls back when the title has no letters", () => {
    expect(exportFileName("!!!", "csv")).toBe("flashcards.csv");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/flashcardExport.test.ts`
Expected: FAIL — cannot resolve `./flashcardExport`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/tools/lib/flashcardExport.ts
/** Exports for the free flashcard tool. Pure string builders + one DOM download helper. */

export type ExportCard = { front: string; back: string };

/** Anki/Quizlet text imports split fields on tabs and cards on newlines. */
const flatten = (value: string) =>
  value
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

const tabLine = (card: ExportCard) => `${flatten(card.front)}\t${flatten(card.back)}`;

/** Anki "Import File" plain text with file headers (Anki 2.1.55+). */
export function toAnkiText(cards: ExportCard[]): string {
  return `${["#separator:tab", "#html:false", "#columns:Front\tBack", ...cards.map(tabLine)].join("\n")}\n`;
}

/** Paste into Quizlet's "Import" box with "Between term and definition: Tab" and "Between rows: New line". */
export function toQuizletText(cards: ExportCard[]): string {
  return cards.map(tabLine).join("\n");
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** BOM so Excel reads UTF-8; CRLF rows per RFC 4180. */
export function toCsv(cards: ExportCard[]): string {
  const rows = cards.map((c) => `${csvCell(c.front)},${csvCell(c.back)}`);
  return `\uFEFF${["Front,Back", ...rows].join("\r\n")}`;
}

export function exportFileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug ? `${slug}-flashcards.${extension}` : `flashcards.${extension}`;
}

export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/flashcardExport.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): Anki, Quizlet and CSV flashcard exports (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools/lib/flashcardExport.ts apps/web/src/features/tools/lib/flashcardExport.test.ts
```

---

### Task 11: Endpoint client and pending-deck storage

**Files:**
- Create: `apps/web/src/features/tools/lib/freeToolClient.ts`, `apps/web/src/features/tools/lib/pendingDeck.ts`
- Test: `apps/web/src/features/tools/lib/freeToolClient.test.ts`, `apps/web/src/features/tools/lib/pendingDeck.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/tools/lib/freeToolClient.test.ts
import { describe, expect, it, vi } from "vitest";
import { generateFreeDeck } from "./freeToolClient";

const req = { text: "words", cardCount: 20 as const, turnstileToken: "tok" };
const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("generateFreeDeck", () => {
  it("returns the deck and drops null topics", async () => {
    const fetchImpl = respond(200, {
      title: "Cells",
      cards: [{ type: "definition", front: "Define: cell", back: "Unit of life", topic: null }],
    });
    const result = await generateFreeDeck(req, fetchImpl);
    expect(result).toEqual({
      kind: "ok",
      deck: {
        title: "Cells",
        cards: [{ type: "definition", front: "Define: cell", back: "Unit of life" }],
      },
    });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/\/tools\/flashcards$/);
  });

  it("maps 400, 403, 429 and 5xx", async () => {
    expect(await generateFreeDeck(req, respond(400, { error: "text_too_short" }))).toEqual({
      kind: "invalid",
      error: "text_too_short",
    });
    expect(await generateFreeDeck(req, respond(403, { error: "captcha_failed" }))).toEqual({
      kind: "captcha",
    });
    expect(
      await generateFreeDeck(req, respond(429, { error: "rate_limited", scope: "ip", retryAfterMs: 5 }))
    ).toEqual({ kind: "limited", scope: "ip", retryAfterMs: 5 });
    expect(await generateFreeDeck(req, respond(502, { error: "generation_failed" }))).toEqual({
      kind: "failed",
    });
  });

  it("treats a network error as failed", async () => {
    expect(await generateFreeDeck(req, vi.fn().mockRejectedValue(new TypeError("offline")))).toEqual({
      kind: "failed",
    });
  });
});
```

```ts
// apps/web/src/features/tools/lib/pendingDeck.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { clearPendingDeck, readPendingDeck, savePendingDeck } from "./pendingDeck";

const deck = {
  title: "Cells",
  sourceText: "some source text",
  cards: [{ type: "definition" as const, front: "Define: cell", back: "Unit of life" }],
};

describe("pendingDeck", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved deck", () => {
    expect(savePendingDeck(deck, 1_000)).toBe(true);
    expect(readPendingDeck(2_000)).toEqual({ ...deck, savedAt: 1_000 });
  });

  it("expires after 24 hours", () => {
    savePendingDeck(deck, 0);
    expect(readPendingDeck(24 * 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("ignores malformed data and clears", () => {
    localStorage.setItem("solomind.freeTool.pendingDeck", "{bad");
    expect(readPendingDeck()).toBeNull();
    savePendingDeck(deck);
    clearPendingDeck();
    expect(readPendingDeck()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/freeToolClient.test.ts src/features/tools/lib/pendingDeck.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

```ts
// apps/web/src/features/tools/lib/freeToolClient.ts
import type { FreeFlashcardCardCount } from "@convex/_lib/freeToolBounds";
import type { Flashcard } from "@/shared/types/index";

// HTTP actions live on the .site host. Kept local (not chatStream.ts) so this page's chunk
// doesn't pull in the chat module.
const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL || import.meta.env.VITE_CONVEX_URL?.replace(".cloud", ".site");

export const FREE_FLASHCARDS_URL = `${CONVEX_SITE_URL ?? ""}/tools/flashcards`;

export type FreeDeckCard = Pick<Flashcard, "type" | "front" | "back" | "topic">;
export type FreeDeck = { title: string; cards: FreeDeckCard[] };

export type GenerateFreeDeckResult =
  | { kind: "ok"; deck: FreeDeck }
  | { kind: "invalid"; error: string }
  | { kind: "captcha" }
  | { kind: "limited"; scope: "ip" | "global"; retryAfterMs: number }
  | { kind: "failed" };

type WireCard = Omit<FreeDeckCard, "topic"> & { topic?: string | null };

export async function generateFreeDeck(
  request: { text: string; cardCount: FreeFlashcardCardCount; turnstileToken: string },
  fetchImpl: typeof fetch = fetch
): Promise<GenerateFreeDeckResult> {
  let response: Response;
  try {
    response = await fetchImpl(FREE_FLASHCARDS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: "failed" };
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 200) {
    const cards = (body.cards as WireCard[]).map(({ topic, ...card }) =>
      topic ? { ...card, topic } : card
    );
    return { kind: "ok", deck: { title: String(body.title), cards } };
  }
  if (response.status === 400 || response.status === 413) {
    return { kind: "invalid", error: String(body.error ?? "invalid_body") };
  }
  if (response.status === 403) return { kind: "captcha" };
  if (response.status === 429) {
    return {
      kind: "limited",
      scope: body.scope === "global" ? "global" : "ip",
      retryAfterMs: Number(body.retryAfterMs ?? 0),
    };
  }
  return { kind: "failed" };
}
```

```ts
// apps/web/src/features/tools/lib/pendingDeck.ts
import type { FreeDeckCard } from "./freeToolClient";

/** A free-tool deck waiting for sign-in, so it can be saved into a notebook afterwards. */
const KEY = "solomind.freeTool.pendingDeck";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type PendingDeck = {
  title: string;
  sourceText: string;
  cards: FreeDeckCard[];
  savedAt: number;
};

export function savePendingDeck(deck: Omit<PendingDeck, "savedAt">, now = Date.now()): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...deck, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function readPendingDeck(now = Date.now()): PendingDeck | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const deck = JSON.parse(raw) as PendingDeck;
    const valid =
      typeof deck.title === "string" &&
      typeof deck.sourceText === "string" &&
      Array.isArray(deck.cards) &&
      typeof deck.savedAt === "number";
    if (!valid || now - deck.savedAt > MAX_AGE_MS) return null;
    return deck;
  } catch {
    return null;
  }
}

export function clearPendingDeck(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/freeToolClient.test.ts src/features/tools/lib/pendingDeck.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): endpoint client and pending-deck handoff for the flashcard tool (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools/lib
```

---

### Task 12: PDF text extraction

**Files:**
- Create: `apps/web/src/features/tools/lib/extractPdfText.ts`
- Test: `apps/web/src/features/tools/lib/extractPdfText.test.ts`

Only the pure item-joining is unit-tested; the pdfjs path is covered by the manual check (Task 19).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/features/tools/lib/extractPdfText.test.ts
import { describe, expect, it } from "vitest";
import { pageItemsToText } from "./extractPdfText";

describe("pageItemsToText", () => {
  it("joins runs with spaces and breaks lines on hasEOL", () => {
    expect(
      pageItemsToText([
        { str: "Cell", hasEOL: false },
        { str: "biology", hasEOL: true },
        { str: "Mitochondria make ATP.", hasEOL: true },
      ])
    ).toBe("Cell biology\nMitochondria make ATP.");
  });

  it("skips marked-content items without str and collapses blank lines", () => {
    expect(
      pageItemsToText([{ str: "A", hasEOL: true }, {}, { str: "", hasEOL: true }, { str: "", hasEOL: true }, { str: "B" }])
    ).toBe("A\n\nB");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/extractPdfText.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/tools/lib/extractPdfText.ts
import { FREE_FLASHCARD_MAX_PDF_PAGES } from "@convex/_lib/freeToolBounds";

type TextItemLike = { str?: string; hasEOL?: boolean };

export function pageItemsToText(items: TextItemLike[]): string {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
    else if (item.str && !item.str.endsWith(" ")) out += " ";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PdfTextResult = { text: string; pagesRead: number; totalPages: number };

/** Text layer of the first pages, in the browser. Empty text means a scanned (image-only) PDF. */
export async function extractPdfText(file: File): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist");
  // Same worker file PdfViewer uses (copied to /public by the pdfjsWorker Vite plugin).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const totalPages = doc.numPages;
    const pagesRead = Math.min(totalPages, FREE_FLASHCARD_MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pagesRead; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageItemsToText(content.items as TextItemLike[]));
    }
    return { text: pages.join("\n\n").trim(), pagesRead, totalPages };
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --cwd apps/web test -- src/features/tools/lib/extractPdfText.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): extract PDF text in the browser with pdfjs (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools/lib/extractPdfText.ts apps/web/src/features/tools/lib/extractPdfText.test.ts
```

---

### Task 13: Turnstile and claim hooks

**Files:**
- Create: `apps/web/src/features/tools/hooks/useTurnstile.ts`, `apps/web/src/features/tools/hooks/useClaimPendingDeck.ts`
- Modify: `apps/web/src/vite-env.d.ts`

- [ ] **Step 1: Declare the env var**

In `apps/web/src/vite-env.d.ts`, inside `ImportMetaEnv`, add:

```ts
  /** Overrides the Turnstile site key (default: production key; use 1x00000000000000000000BB to test). */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
```

- [ ] **Step 2: Write `useTurnstile`**

```ts
// apps/web/src/features/tools/hooks/useTurnstile.ts
import { type RefObject, useCallback, useEffect, useRef } from "react";

/** Public site key ("SolomindLM free tools" widget, invisible mode). Not a secret. */
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAAFQDDSV1WRFKhINF";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 30_000;

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile_missing"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile_load_failed"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Pending = { resolve: (token: string) => void; reject: (error: Error) => void };

/**
 * Invisible Turnstile: the script loads on first use, and `getToken()` runs a fresh challenge
 * each call (tokens are single-use). The container stays empty unless Cloudflare needs interaction.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const widgetId = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(
    () => () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    },
    []
  );

  const getToken = useCallback(async (): Promise<string> => {
    const turnstile = await loadTurnstile();
    const container = containerRef.current;
    if (!container) throw new Error("turnstile_no_container");

    const token = new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
    });

    if (widgetId.current === null) {
      widgetId.current = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (value: string) => pending.current?.resolve(value),
        "error-callback": (code: string) => pending.current?.reject(new Error(`turnstile_${code}`)),
        "expired-callback": () => pending.current?.reject(new Error("turnstile_expired")),
      });
    } else {
      turnstile.reset(widgetId.current);
    }
    turnstile.execute(widgetId.current);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("turnstile_timeout")), TOKEN_TIMEOUT_MS);
    });
    try {
      return await Promise.race([token, timeout]);
    } finally {
      clearTimeout(timer);
      pending.current = null;
    }
  }, [containerRef]);

  return { getToken };
}
```

- [ ] **Step 3: Write `useClaimPendingDeck`**

```ts
// apps/web/src/features/tools/hooks/useClaimPendingDeck.ts
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { useToast } from "@/shared/contexts/ToastContext";
import { clearPendingDeck, readPendingDeck } from "../lib/pendingDeck";

/**
 * Once signed in, save a deck the visitor made on the free tool and open its notebook.
 * Mounted on the tool page (email/password sign-in) and on /home (OAuth redirects land there).
 */
export function useClaimPendingDeck(): void {
  const { isAuthenticated } = useAuth();
  const claimDeck = useMutation(api.freeTools.claimDeck.claimDeck);
  const navigate = useNavigate();
  const toast = useToast();
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    const deck = readPendingDeck();
    if (!deck) return;
    started.current = true;
    claimDeck({ title: deck.title, sourceText: deck.sourceText, cards: deck.cards })
      .then(({ notebookId }) => {
        clearPendingDeck();
        navigate(`/notebook/${notebookId}`);
      })
      .catch(() => {
        clearPendingDeck();
        toast.error("We couldn't save your flashcards. Export them from the free tool instead.");
      });
  }, [isAuthenticated, claimDeck, navigate, toast]);
}
```

- [ ] **Step 4: Check the toast API, then typecheck**

Run: `grep -n "error" apps/web/src/shared/contexts/ToastContext.tsx | head`
If the context exposes a different method (e.g. `showToast(message, "error")`), use that call instead.
Run: `bun run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tools): invisible Turnstile hook and post-sign-in deck claim (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools/hooks apps/web/src/vite-env.d.ts
```

---

### Task 14: Page copy and SEO registration

**Files:**
- Create: `apps/web/src/features/tools/toolPages.ts`, `apps/web/src/shared/seo/toolPrerenderHtml.ts`
- Modify: `apps/web/src/shared/seo/structuredData.ts` (append), `apps/web/src/shared/seo/publicSeoPages.ts`, `apps/web/src/shared/seo/publicSeoPrerenderHtml.ts`, `apps/web/src/shared/seo/seoHtml.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/shared/seo/seoHtml.test.ts` (add the two imports at the top of the file with the others):

```ts
import { buildPublicSeoPrerenderBody } from "./publicSeoPrerenderHtml";
import { PDF_TO_FLASHCARDS_PAGE } from "@/features/tools/toolPages";

describe("free tool pages", () => {
  it("registers /tools/pdf-to-flashcards with tool, how-to, FAQ and breadcrumb data", () => {
    const page = getPublicSeoPageByPath(PDF_TO_FLASHCARDS_PAGE.path);
    expect(page).toBeDefined();
    const types = (page!.structuredData as Record<string, unknown>[]).map((item) => item["@type"]);
    expect(types).toEqual(
      expect.arrayContaining(["WebApplication", "HowTo", "FAQPage", "BreadcrumbList"])
    );
  });

  it("prerenders the H1, steps and FAQ for crawlers", () => {
    const body = buildPublicSeoPrerenderBody(PDF_TO_FLASHCARDS_PAGE.path);
    expect(body).toContain(`<h1>${PDF_TO_FLASHCARDS_PAGE.h1}</h1>`);
    expect(body).toContain(PDF_TO_FLASHCARDS_PAGE.faqs[0].question);
    expect(body).toContain('href="/students/ai-flashcards"');
  });
});
```

(Skip the `buildPublicSeoPrerenderBody` import if the file already imports it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/web test -- src/shared/seo/seoHtml.test.ts`
Expected: FAIL — cannot resolve `@/features/tools/toolPages`.

- [ ] **Step 3: Write the page config**

```ts
// apps/web/src/features/tools/toolPages.ts
import type { BreadcrumbItem } from "@/shared/seo/structuredData";

export type ToolPageConfig = {
  path: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  intro: string;
  steps: { name: string; text: string }[];
  sections: { heading: string; paragraphs: string[] }[];
  faqs: { question: string; answer: string }[];
  related: { path: string; label: string }[];
};

export const PDF_TO_FLASHCARDS_PAGE: ToolPageConfig = {
  path: "/tools/pdf-to-flashcards",
  title: "Free PDF to Flashcards Maker — No Signup, Anki & Quizlet Export | SolomindLM",
  description:
    "Turn a PDF or your notes into flashcards for free, no account needed. Export to Anki, Quizlet or CSV, or save the deck to study with spaced repetition.",
  keywords:
    "pdf to flashcards, flashcard maker, free flashcard maker, ai flashcard generator, notes to flashcards, pdf to anki, pdf to quizlet",
  h1: "Free PDF to Flashcards Maker",
  intro:
    "Drop in a PDF or paste your notes and get a study-ready deck in under a minute. No account, no watermark: export to Anki, Quizlet or CSV.",
  steps: [
    {
      name: "Add your material",
      text: "Upload a PDF with selectable text (up to 40 pages) or paste lecture notes, a chapter or an article.",
    },
    {
      name: "Choose how many cards",
      text: "Pick 10, 20 or 30 cards. The generator mixes question, fill-in-the-blank, true/false, definition and scenario cards.",
    },
    {
      name: "Generate and review",
      text: "Flip through the deck and check every card against your material before you study.",
    },
    {
      name: "Export or keep studying",
      text: "Download an Anki file, copy the deck into Quizlet, save a CSV, or create a free account to study it with spaced repetition.",
    },
  ],
  sections: [
    {
      heading: "Why flashcards made from your own material work",
      paragraphs: [
        "Retrieval practice, answering a question before you see the answer, is one of the most reliable ways to remember what you read. Cards built from your own PDF test the facts, terms and reasoning your course actually covers.",
        "Spaced repetition then brings each card back just before you would forget it. Anki and SolomindLM both schedule reviews this way, so a short daily session keeps the whole deck fresh.",
      ],
    },
    {
      heading: "How to import your deck into Anki",
      paragraphs: [
        "Click Download for Anki to save a .txt file. In Anki, choose File → Import, pick the file, and confirm that the fields map to Front and Back. The file already tells Anki it is tab-separated plain text.",
      ],
    },
    {
      heading: "How to import your deck into Quizlet",
      paragraphs: [
        "Click Copy for Quizlet. In Quizlet, create a study set, choose Import, and paste. Set “Between term and definition” to Tab and “Between cards” to New line.",
      ],
    },
    {
      heading: "What the free tool can and can’t read",
      paragraphs: [
        "The free tool reads the text layer of a PDF in your browser; your file is not uploaded. Scanned pages are images with no text layer, so they come back empty. A free SolomindLM account runs OCR on scanned PDFs and also takes slides, YouTube videos and web pages.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is this flashcard maker really free?",
      answer:
        "Yes. You can make up to three decks a day without an account and export every one of them. A free account adds more decks, OCR for scanned PDFs and spaced-repetition study.",
    },
    {
      question: "Do I need to sign up?",
      answer:
        "No. Generate and export without an account. Sign up only if you want to keep the deck in a notebook and review it on a schedule.",
    },
    {
      question: "Is my PDF uploaded?",
      answer:
        "No. The text is extracted in your browser, and only that text is sent to generate the cards. Nothing is stored unless you choose to save the deck to an account.",
    },
    {
      question: "Can I export to Anki or Quizlet?",
      answer:
        "Yes. Download an Anki-ready text file, copy a Quizlet import, or save a CSV that opens in Excel, Google Sheets, RemNote and most flashcard apps.",
    },
    {
      question: "Why did my PDF produce no text?",
      answer:
        "It is probably a scanned document: the pages are pictures, so there is no text to read. Paste the text instead, or sign up free and add the PDF to a notebook, which runs OCR.",
    },
    {
      question: "How accurate are the cards?",
      answer:
        "Cards are generated from your material and checked for empty sides, duplicates and answers that leak onto the front, but AI can still be wrong. Review the deck before you rely on it.",
    },
  ],
  related: [
    { path: "/students/ai-flashcards", label: "AI flashcards in your notebook" },
    { path: "/students/ai-quizzes", label: "AI quiz generator" },
    { path: "/students", label: "All student tools" },
  ],
};

export const FREE_TOOL_PAGES: ToolPageConfig[] = [PDF_TO_FLASHCARDS_PAGE];

export function getToolPageByPath(path: string): ToolPageConfig | undefined {
  return FREE_TOOL_PAGES.find((page) => page.path === path);
}

export function getToolBreadcrumbItems(page: ToolPageConfig): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: "Free tools", path: page.path },
    { name: page.h1, path: page.path },
  ];
}
```

Before writing, confirm `BreadcrumbItem`'s fields: `sed -n '79,84p' apps/web/src/shared/seo/structuredData.ts`. If it uses other field names than `name`/`path`, match them. If no `/tools` index page exists, drop the middle "Free tools" crumb so no crumb points at the page twice: return `[{ name: "Home", path: "/" }, { name: page.h1, path: page.path }]`.

- [ ] **Step 4: Add structured-data generators**

Append to `apps/web/src/shared/seo/structuredData.ts`:

```ts
export const generateWebApplicationStructuredData = (args: {
  name: string;
  description: string;
  path: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: args.name,
  description: args.description,
  url: `${SEO_BASE_URL}${args.path}`,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web browser)",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  provider: { "@type": "Organization", name: "SolomindLM", url: SEO_BASE_URL },
});

export const generateHowToStructuredData = (args: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}) => ({
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: args.name,
  description: args.description,
  step: args.steps.map((step, index) => ({
    "@type": "HowToStep",
    position: index + 1,
    name: step.name,
    text: step.text,
  })),
});
```

- [ ] **Step 5: Register in the SEO registry**

In `apps/web/src/shared/seo/publicSeoPages.ts`:
- Add imports: `import { FREE_TOOL_PAGES, getToolBreadcrumbItems } from "@/features/tools/toolPages";` and add `generateHowToStructuredData, generateWebApplicationStructuredData` to the `./structuredData` import.
- After `INTENT_SEO_PAGES`, add:

```ts
const TOOL_SEO_PAGES: PublicSeoPage[] = FREE_TOOL_PAGES.map((page) => ({
  path: page.path,
  title: page.title,
  description: page.description,
  keywords: page.keywords,
  changefreq: "weekly",
  priority: 0.9,
  structuredData: [
    generateBreadcrumbStructuredData(getToolBreadcrumbItems(page)),
    generateWebApplicationStructuredData({
      name: page.h1,
      description: page.description,
      path: page.path,
    }),
    generateHowToStructuredData({ name: page.h1, description: page.intro, steps: page.steps }),
    generateFAQStructuredData(page.faqs),
  ],
}));
```

- Add `...TOOL_SEO_PAGES,` to `PUBLIC_SEO_PAGES` after `...INTENT_SEO_PAGES,` (a separate line from the `SEO_CONTENT` entry, to stay clear of the compare-pages branch).

- [ ] **Step 6: Write the prerender body**

```ts
// apps/web/src/shared/seo/toolPrerenderHtml.ts
import type { ToolPageConfig } from "@/features/tools/toolPages";
import { escapeHtml } from "./seoHtml";

export function buildToolPrerenderBody(page: ToolPageConfig): string {
  const steps = page.steps
    .map((step) => `          <li><strong>${escapeHtml(step.name)}.</strong> ${escapeHtml(step.text)}</li>`)
    .join("\n");
  const sections = page.sections
    .map(
      (section) =>
        `      <section>\n        <h2>${escapeHtml(section.heading)}</h2>\n${section.paragraphs
          .map((p) => `        <p>${escapeHtml(p)}</p>`)
          .join("\n")}\n      </section>`
    )
    .join("\n");
  const faqs = page.faqs
    .map(
      (faq) =>
        `        <div>\n          <h3>${escapeHtml(faq.question)}</h3>\n          <p>${escapeHtml(faq.answer)}</p>\n        </div>`
    )
    .join("\n");
  const related = page.related
    .map((link) => `          <li><a href="${link.path}">${escapeHtml(link.label)}</a></li>`)
    .join("\n");

  return `    <main>\n      <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <h1>${escapeHtml(page.h1)}</h1>
        <p>${escapeHtml(page.intro)}</p>
      </header>
      <section aria-labelledby="seo-tool-steps">
        <h2 id="seo-tool-steps">How it works</h2>
        <ol>
${steps}
        </ol>
      </section>
${sections}
      <section aria-labelledby="seo-tool-faq">
        <h2 id="seo-tool-faq">Frequently asked questions</h2>
${faqs}
      </section>
      <section aria-labelledby="seo-tool-related">
        <h2 id="seo-tool-related">Related</h2>
        <ul>
${related}
        </ul>
      </section>
      <footer>
        <p><a href="/">SolomindLM home</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></p>
      </footer>
      </article>\n    </main>`;
}
```

Note: the test asserts `<h1>${PDF_TO_FLASHCARDS_PAGE.h1}</h1>` — the H1 has no characters `escapeHtml` changes, so escaping is safe.

- [ ] **Step 7: Dispatch it**

In `apps/web/src/shared/seo/publicSeoPrerenderHtml.ts` add imports `import { getToolPageByPath } from "@/features/tools/toolPages";` and `import { buildToolPrerenderBody } from "./toolPrerenderHtml";`, and before the final `return undefined;`:

```ts
  const toolPage = getToolPageByPath(path);
  if (toolPage) {
    return buildToolPrerenderBody(toolPage);
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun run --cwd apps/web test -- src/shared/seo`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(tools): SEO registry, JSON-LD and crawler body for /tools/pdf-to-flashcards (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools/toolPages.ts apps/web/src/shared/seo
```

---

### Task 15: Page UI

**Files:**
- Create: `apps/web/src/features/tools/components/SourceInput.tsx`, `DeckPreview.tsx`, `ExportBar.tsx`, `apps/web/src/features/tools/pages/PdfToFlashcardsPage.tsx`
- Modify: `apps/web/src/App.tsx` (imports ~line 62, `isPublicPage` lines 172–181, routes ~line 417)

Read `docs/design/principles.md` first: primitives only, layout classes at the call site, semantic tokens, one solid primary button per view, no `dark:`.

- [ ] **Step 1: `SourceInput`**

```tsx
// apps/web/src/features/tools/components/SourceInput.tsx
import {
  countWords,
  FREE_FLASHCARD_MAX_PDF_PAGES,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
} from "@convex/_lib/freeToolBounds";
import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { extractPdfText } from "../lib/extractPdfText";

export type SourceState = { text: string; label: string; note?: string };

type Props = {
  onChange: (source: SourceState | null) => void;
  onScannedPdf: () => void;
};

export function SourceInput({ onChange, onScannedPdf }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [pdfStatus, setPdfStatus] = useState<
    { kind: "idle" } | { kind: "reading" } | { kind: "ready"; label: string; note?: string } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const readPdf = async (file: File) => {
    setPdfStatus({ kind: "reading" });
    try {
      const { text, pagesRead, totalPages } = await extractPdfText(file);
      if (countWords(text) < FREE_FLASHCARD_MIN_WORDS) {
        setPdfStatus({
          kind: "error",
          message:
            "We couldn't find enough text in this PDF. It may be scanned. Paste the text instead, or sign up free to use OCR.",
        });
        onChange(null);
        onScannedPdf();
        return;
      }
      const note =
        totalPages > pagesRead ? `Read the first ${pagesRead} of ${totalPages} pages.` : undefined;
      setPdfStatus({ kind: "ready", label: file.name, note });
      onChange({ text, label: file.name, note });
    } catch {
      setPdfStatus({ kind: "error", message: "That file couldn't be opened as a PDF." });
      onChange(null);
    }
  };

  const updatePasted = (value: string) => {
    setPasted(value);
    onChange(countWords(value) >= FREE_FLASHCARD_MIN_WORDS ? { text: value, label: "Pasted notes" } : null);
  };

  const pastedWords = countWords(pasted);

  return (
    <Tabs defaultValue="pdf" className="w-full" onValueChange={() => onChange(null)}>
      <TabsList>
        <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
        <TabsTrigger value="paste">Paste notes</TabsTrigger>
      </TabsList>

      <TabsContent value="pdf" className="mt-4 space-y-3">
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Choose a PDF"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readPdf(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-32 w-full flex-col gap-2"
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void readPdf(file);
          }}
        >
          {pdfStatus.kind === "reading" ? <Spinner /> : pdfStatus.kind === "ready" ? <FileText /> : <Upload />}
          <span>
            {pdfStatus.kind === "ready"
              ? pdfStatus.label
              : pdfStatus.kind === "reading"
                ? "Reading your PDF…"
                : "Drop a PDF here or click to choose"}
          </span>
          <span className="text-xs text-muted-foreground">
            Text PDFs up to {FREE_FLASHCARD_MAX_PDF_PAGES} pages · stays in your browser
          </span>
        </Button>
        {pdfStatus.kind === "ready" && pdfStatus.note ? (
          <p className="text-sm text-muted-foreground">{pdfStatus.note}</p>
        ) : null}
        {pdfStatus.kind === "error" ? (
          <Alert variant="warning">
            <AlertDescription>{pdfStatus.message}</AlertDescription>
          </Alert>
        ) : null}
      </TabsContent>

      <TabsContent value="paste" className="mt-4 space-y-2">
        <Textarea
          value={pasted}
          onChange={(event) => updatePasted(event.target.value)}
          placeholder="Paste lecture notes, a chapter or an article…"
          className="min-h-48"
          aria-label="Notes to turn into flashcards"
        />
        <p className="text-sm text-muted-foreground">
          {pastedWords.toLocaleString()} words
          {pastedWords > 0 && pastedWords < FREE_FLASHCARD_MIN_WORDS
            ? ` · add at least ${FREE_FLASHCARD_MIN_WORDS - pastedWords} more`
            : pastedWords > FREE_FLASHCARD_MAX_WORDS
              ? ` · the first ${FREE_FLASHCARD_MAX_WORDS.toLocaleString()} words will be used`
              : ""}
        </p>
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: `DeckPreview`**

```tsx
// apps/web/src/features/tools/components/DeckPreview.tsx
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { FlashcardBack, FlashcardFront } from "@/features/studio/components/flashcards/FlashcardContent";
import { FlipCard } from "@/features/studio/components/flashcards/FlipCard";
import { Button } from "@/shared/components/ui/button";
import type { Flashcard } from "@/shared/types/index";
import type { FreeDeckCard } from "../lib/freeToolClient";

export function DeckPreview({ cards }: { cards: FreeDeckCard[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[index] as Flashcard;

  const go = (next: number) => {
    setIndex((next + cards.length) % cards.length);
    setFlipped(false);
  };

  return (
    <div className="space-y-6">
      <FlipCard
        className="mx-auto h-72 w-full max-w-xl"
        flipped={flipped}
        onActivate={() => setFlipped((value) => !value)}
        label={`Card ${index + 1} of ${cards.length}`}
        front={<FlashcardFront card={card} />}
        back={<FlashcardBack card={card} />}
        frontFooter="Tap or press Space to flip"
        backFooter="Tap or press Space to flip back"
      />
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Previous card" onClick={() => go(index - 1)}>
          <ChevronLeft />
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          {index + 1} / {cards.length}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next card" onClick={() => go(index + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <ol className="divide-y divide-border/50 rounded-2xl bg-card shadow-xs ring-1 ring-hairline">
        {cards.map((c, i) => (
          <li key={`${i}-${c.front}`} className="grid gap-1 px-5 py-4 sm:grid-cols-2 sm:gap-6">
            <p className="text-sm text-foreground">{c.front}</p>
            <p className="text-sm text-muted-foreground">{c.back}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

Before writing, check `FlipCard` sizing: read `apps/web/src/features/studio/components/flashcards/FlipCard.tsx` lines 40–90. If it sizes itself and ignores height classes, drop `h-72`. Check that `Button` has `size="icon"`: `grep -n "icon" apps/web/src/shared/components/ui/button.tsx`.

- [ ] **Step 3: `ExportBar`**

```tsx
// apps/web/src/features/tools/components/ExportBar.tsx
import { Copy, Download } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  downloadTextFile,
  exportFileName,
  toAnkiText,
  toCsv,
  toQuizletText,
} from "../lib/flashcardExport";
import type { FreeDeck } from "../lib/freeToolClient";

export function ExportBar({ deck }: { deck: FreeDeck }) {
  const toast = useToast();

  const copyForQuizlet = async () => {
    try {
      await navigator.clipboard.writeText(toQuizletText(deck.cards));
      toast.success("Copied. In Quizlet, choose Import and paste.");
    } catch {
      toast.error("Couldn't copy. Download the CSV instead.");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() =>
          downloadTextFile(exportFileName(deck.title, "txt"), toAnkiText(deck.cards), "text/plain")
        }
      >
        <Download /> Download for Anki
      </Button>
      <Button variant="secondary" onClick={copyForQuizlet}>
        <Copy /> Copy for Quizlet
      </Button>
      <Button
        variant="outline"
        onClick={() => downloadTextFile(exportFileName(deck.title, "csv"), toCsv(deck.cards), "text/csv")}
      >
        <Download /> CSV
      </Button>
    </div>
  );
}
```

(Use the same toast call shape you confirmed in Task 13, Step 4.)

- [ ] **Step 4: The page**

```tsx
// apps/web/src/features/tools/pages/PdfToFlashcardsPage.tsx
import {
  FREE_FLASHCARD_CARD_COUNTS,
  FREE_FLASHCARD_DEFAULT_CARD_COUNT,
  FREE_FLASHCARD_MAX_WORDS,
  type FreeFlashcardCardCount,
  truncateToWords,
} from "@convex/_lib/freeToolBounds";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Footer } from "@/features/landing/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { DeckPreview } from "../components/DeckPreview";
import { ExportBar } from "../components/ExportBar";
import { type SourceState, SourceInput } from "../components/SourceInput";
import { useClaimPendingDeck } from "../hooks/useClaimPendingDeck";
import { useTurnstile } from "../hooks/useTurnstile";
import { type FreeDeck, generateFreeDeck } from "../lib/freeToolClient";
import { savePendingDeck } from "../lib/pendingDeck";
import { PDF_TO_FLASHCARDS_PAGE as PAGE } from "../toolPages";

type Status =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done"; deck: FreeDeck; sourceText: string }
  | { kind: "error"; title: string; message: string; signup?: boolean };

const hoursUntil = (ms: number) => Math.max(1, Math.ceil(ms / 3_600_000));

export default function PdfToFlashcardsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const { getToken } = useTurnstile(turnstileContainer);
  const [source, setSource] = useState<SourceState | null>(null);
  const [cardCount, setCardCount] = useState<FreeFlashcardCardCount>(FREE_FLASHCARD_DEFAULT_CARD_COUNT);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [authOpen, setAuthOpen] = useState(false);
  useClaimPendingDeck();

  if (isNativeShell()) {
    if (isLoading) return <div className="min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const generate = async () => {
    if (!source) return;
    const { text } = truncateToWords(source.text, FREE_FLASHCARD_MAX_WORDS);
    setStatus({ kind: "generating" });

    let result: Awaited<ReturnType<typeof generateFreeDeck>> | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let turnstileToken: string;
      try {
        turnstileToken = await getToken();
      } catch {
        setStatus({
          kind: "error",
          title: "We couldn't verify your browser",
          message: "Check that nothing is blocking challenges.cloudflare.com, then try again.",
        });
        return;
      }
      result = await generateFreeDeck({ text, cardCount, turnstileToken });
      if (result.kind !== "captcha") break;
    }

    if (!result || result.kind === "captcha") {
      setStatus({ kind: "error", title: "Verification failed", message: "Please try again." });
    } else if (result.kind === "ok") {
      setStatus({ kind: "done", deck: result.deck, sourceText: text });
    } else if (result.kind === "limited") {
      setStatus(
        result.scope === "ip"
          ? {
              kind: "error",
              title: "You've used today's 3 free decks",
              message: `Free decks reset in about ${hoursUntil(result.retryAfterMs)} hours. A free account gives you more decks every day.`,
              signup: true,
            }
          : {
              kind: "error",
              title: "The free tool is busy today",
              message: "Create a free account to keep generating flashcards right away.",
              signup: true,
            }
      );
    } else if (result.kind === "invalid") {
      setStatus({ kind: "error", title: "Check your text", message: "Add at least a few paragraphs of material." });
    } else {
      setStatus({ kind: "error", title: "Something went wrong", message: "Generation failed. Try again; it won't count against your free decks." });
    }
  };

  const saveAndSignUp = () => {
    if (status.kind === "done") {
      savePendingDeck({ title: status.deck.title, sourceText: status.sourceText, cards: status.deck.cards });
    }
    setAuthOpen(true);
  };

  return (
    <>
      <SEOMeta pagePath={PAGE.path} title={PAGE.title} description={PAGE.description} keywords={PAGE.keywords} />
      <div className="min-h-screen landing-grid-pattern">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-6 sm:px-8 lg:px-12">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img src="/SolomindLM_logo.png" alt="SolomindLM" className="h-8 w-8 shrink-0 object-contain" />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">SolomindLM</span>
            </Link>
            <Button variant="ghost" onClick={() => setAuthOpen(true)}>
              Sign in
            </Button>
          </div>
        </header>

        <main className="px-4 pb-20 sm:px-6">
          <section className="mx-auto max-w-3xl space-y-4 pt-14 text-center md:pt-20">
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">{PAGE.h1}</h1>
            <p className="text-lg text-muted-foreground">{PAGE.intro}</p>
          </section>

          <section className="mx-auto mt-10 max-w-3xl space-y-6 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline sm:p-8">
            <SourceInput onChange={setSource} onScannedPdf={() => undefined} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Cards</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={String(cardCount)}
                  onValueChange={(value) => value && setCardCount(Number(value) as FreeFlashcardCardCount)}
                  aria-label="Number of cards"
                >
                  {FREE_FLASHCARD_CARD_COUNTS.map((count) => (
                    <ToggleGroupItem key={count} value={String(count)}>
                      {count}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Button size="lg" disabled={!source || status.kind === "generating"} onClick={generate}>
                {status.kind === "generating" ? <Spinner /> : <Sparkles />}
                {status.kind === "generating" ? "Making your flashcards…" : "Generate flashcards"}
              </Button>
            </div>
            <div ref={turnstileContainer} />
            {status.kind === "error" ? (
              <Alert variant="warning">
                <AlertTitle>{status.title}</AlertTitle>
                <AlertDescription>
                  {status.message}
                  {status.signup ? (
                    <Button variant="link" className="h-auto p-0" onClick={() => setAuthOpen(true)}>
                      Create a free account
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </section>

          {status.kind === "done" ? (
            <section className="mx-auto mt-10 max-w-3xl space-y-6" aria-labelledby="deck-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="deck-heading" className="font-display text-2xl font-bold text-foreground">
                    {status.deck.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">{status.deck.cards.length} cards · review them before you study</p>
                </div>
                <ExportBar deck={status.deck} />
              </div>
              <DeckPreview cards={status.deck.cards} />
              <div className="rounded-2xl bg-card p-6 text-center shadow-xs ring-1 ring-hairline">
                <p className="font-display text-lg text-foreground">Keep this deck and study it on a schedule</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save it to a free notebook: spaced repetition picks the cards you're about to forget.
                </p>
                <Button variant="secondary" className="mt-4" onClick={saveAndSignUp}>
                  Save &amp; study with spaced repetition
                </Button>
              </div>
            </section>
          ) : null}

          <article className="mx-auto mt-20 max-w-3xl space-y-12">
            <section aria-labelledby="how-heading">
              <h2 id="how-heading" className="font-display text-2xl font-bold text-foreground">How it works</h2>
              <ol className="mt-4 space-y-3">
                {PAGE.steps.map((step, i) => (
                  <li key={step.name} className="text-foreground">
                    <span className="font-semibold">{i + 1}. {step.name}.</span>{" "}
                    <span className="text-muted-foreground">{step.text}</span>
                  </li>
                ))}
              </ol>
            </section>
            {PAGE.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-2xl font-bold text-foreground">{section.heading}</h2>
                {section.paragraphs.map((p) => (
                  <p key={p.slice(0, 32)} className="mt-3 leading-relaxed text-muted-foreground">{p}</p>
                ))}
              </section>
            ))}
            <section aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="font-display text-2xl font-bold text-foreground">Frequently asked questions</h2>
              <dl className="mt-4 space-y-5">
                {PAGE.faqs.map((faq) => (
                  <div key={faq.question}>
                    <dt className="font-semibold text-foreground">{faq.question}</dt>
                    <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <nav aria-label="Related" className="flex flex-wrap gap-3">
              {PAGE.related.map((link) => (
                <Button key={link.path} variant="outline" asChild>
                  <Link to={link.path}>{link.label}</Link>
                </Button>
              ))}
            </nav>
          </article>
        </main>
        <Footer />
      </div>
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={() => setAuthOpen(false)} />
    </>
  );
}
```

`onAuthenticated` only closes the modal; `useClaimPendingDeck` sees `isAuthenticated` flip and saves + navigates. Without a pending deck (plain "Sign in"), the user simply stays on the page signed in. Remove the unused `onScannedPdf` prop from `SourceInput` if it stays a no-op (Knip flags unused exports, not props, but keep it lean): delete the prop and its call in both files.

Check: `Button` supports `variant="link"` and `asChild` (`grep -n "link\|asChild" apps/web/src/shared/components/ui/button.tsx`); `ToggleGroup` supports `variant="outline"` (from Task 13 grep it has `variant`). Adjust to existing variants if not.

- [ ] **Step 5: Route it**

In `apps/web/src/App.tsx`:
- Below the `DesignGallery` const (~line 66) add:

```ts
// Free tools: own chunk so the marketing shell doesn't ship pdfjs or the tool UI.
const PdfToFlashcardsPage = lazy(() => import("./features/tools/pages/PdfToFlashcardsPage"));
```

- Add the import `import { getToolPageByPath } from "./features/tools/toolPages";` with the other feature imports.
- In `isPublicPage` add `getToolPageByPath(location.pathname) !== undefined ||` before `isIntentLandingPath(...)`.
- After the `/faq` route add:

```tsx
              <Route
                path="/tools/pdf-to-flashcards"
                element={
                  <Suspense fallback={<div className="min-h-screen bg-background" />}>
                    <PdfToFlashcardsPage />
                  </Suspense>
                }
              />
```

- [ ] **Step 6: Typecheck, lint, design lint**

Run: `bun run typecheck:web && bun run lint && bun run lint:design`
Expected: PASS; design-lint counts do not go up. Fix any `no-arbitrary-values` hit by using existing tokens/classes (the header classes are copied from `SeoContentPage.tsx`, which already passes).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(tools): /tools/pdf-to-flashcards page with preview, exports and save CTA (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/tools apps/web/src/App.tsx
```

---

### Task 16: Claim on /home, links, llms.txt, CSP

**Files:**
- Modify: `apps/web/src/features/notebooks/components/HomePage.tsx` (line ~26), `apps/web/src/features/landing/components/Footer.tsx` (Company column, ~line 138), `apps/web/src/features/landing/intentLandingPages.ts` (`/students/ai-flashcards` entry, ~line 183), `apps/web/public/llms.txt` (canonical pages, lines 35–67), `apps/web/vercel.json` (CSP line 43), `e2e/csp/csp.spec.ts` (line 21)

- [ ] **Step 1: Claim on /home**

In `HomePage.tsx` add `import { useClaimPendingDeck } from "@/features/tools/hooks/useClaimPendingDeck";` and call `useClaimPendingDeck();` as the first line of the `HomePage` component body.

- [ ] **Step 2: Footer "Free tools"**

In `Footer.tsx` import `FREE_TOOL_PAGES` from `@/features/tools/toolPages`, and wrap the Company column like Comparisons/Guides:

```tsx
          <div className="lg:col-span-2">
            <FooterLinkColumn title="Company">
              {COMPANY_LINKS.map((link) => (
                <FooterLink key={link.to} to={link.to}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterLinkColumn>
            <div className="mt-10">
              <FooterLinkColumn title="Free tools">
                {FREE_TOOL_PAGES.map((page) => (
                  <FooterLink key={page.path} to={page.path}>
                    PDF to flashcards
                  </FooterLink>
                ))}
              </FooterLinkColumn>
            </div>
          </div>
```

Then make the label data-driven: add `navLabel: "PDF to flashcards"` to `ToolPageConfig` (type + `PDF_TO_FLASHCARDS_PAGE`) and render `{page.navLabel}`.

- [ ] **Step 3: Cross-link from the intent page**

In `intentLandingPages.ts`, inside the `/students/ai-flashcards` entry after `sourceToOutput`, add:

```ts
    heroCrossLink: {
      path: "/tools/pdf-to-flashcards",
      label: "Try the free PDF to flashcards tool",
      description: "No account needed: make a deck from a PDF and export it to Anki or Quizlet.",
    },
```

- [ ] **Step 4: llms.txt**

Add under "## Canonical pages" in `apps/web/public/llms.txt`, matching the surrounding line format:

```
- [Free PDF to flashcards maker](https://www.solomindlm.com/tools/pdf-to-flashcards): no-signup tool that turns a PDF or notes into flashcards with Anki, Quizlet and CSV export.
```

- [ ] **Step 5: CSP**

In `apps/web/vercel.json` CSP value: append ` https://challenges.cloudflare.com` to `script-src` and to `frame-src`. `connect-src` already allows `https://*.convex.site`.

- [ ] **Step 6: CSP smoke covers the page**

In `e2e/csp/csp.spec.ts` change `PUBLIC_ROUTES` to `["/", "/sign-in", "/faq", "/privacy", "/tools/pdf-to-flashcards"]`.

- [ ] **Step 7: Typecheck, web tests, Knip**

Run: `bun run typecheck:web && bun run test:web && bunx knip`
Expected: PASS (Knip: no new unused exports — `getToolBreadcrumbItems`, `FREE_TOOL_PAGES`, `getToolPageByPath` are all used).

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(tools): link the flashcard tool from footer, intent page and llms.txt; allow Turnstile in CSP (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/src/features/notebooks/components/HomePage.tsx apps/web/src/features/landing apps/web/src/features/tools/toolPages.ts apps/web/public/llms.txt apps/web/vercel.json e2e/csp/csp.spec.ts
```

---

### Task 17: End-to-end test

**Files:**
- Create: `e2e/tools/pdf-to-flashcards.spec.ts`

Needs only the web dev server (`bun run dev:web`); Turnstile and the Convex endpoint are stubbed with `page.route`.

- [ ] **Step 1: Write the test**

```ts
// e2e/tools/pdf-to-flashcards.spec.ts
import { expect, test } from "@playwright/test";

const NOTES = Array.from({ length: 120 }, (_, i) => `Mitochondria fact ${i} explains ATP.`).join(" ");

test.beforeEach(async ({ page }) => {
  // Stub Turnstile: render returns an id, execute fires the callback with a dummy token.
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
        _cb: null,
        render(el, opts) { this._cb = opts.callback; return "w1"; },
        execute() { setTimeout(() => this._cb("e2e-token"), 10); },
        reset() {}, remove() {}
      };`,
    })
  );
  await page.route("**/tools/flashcards", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const body = route.request().postDataJSON();
    expect(body.turnstileToken).toBe("e2e-token");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        title: "Mitochondria",
        cards: [
          { type: "wh-question", front: "What do mitochondria make?", back: "ATP", topic: null },
          { type: "definition", front: "Define: mitochondrion", back: "The cell's power plant" },
        ],
      }),
    });
  });
});

test("paste notes → generate → preview → Anki download", async ({ page }) => {
  await page.goto("/tools/pdf-to-flashcards");
  await expect(page.getByRole("heading", { level: 1, name: "Free PDF to Flashcards Maker" })).toBeVisible();

  await page.getByRole("tab", { name: "Paste notes" }).click();
  await page.getByLabel("Notes to turn into flashcards").fill(NOTES);
  await page.getByRole("button", { name: "Generate flashcards" }).click();

  await expect(page.getByRole("heading", { name: "Mitochondria" })).toBeVisible();
  await expect(page.getByText("2 cards")).toBeVisible();
  await expect(page.getByText("What do mitochondria make?").first()).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download for Anki" }).click();
  expect((await download).suggestedFilename()).toBe("mitochondria-flashcards.txt");
});

test("shows the daily-limit message on 429", async ({ page }) => {
  await page.route("**/tools/flashcards", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: "rate_limited", scope: "ip", retryAfterMs: 7_200_000 }),
    })
  );
  await page.goto("/tools/pdf-to-flashcards");
  await page.getByRole("tab", { name: "Paste notes" }).click();
  await page.getByLabel("Notes to turn into flashcards").fill(NOTES);
  await page.getByRole("button", { name: "Generate flashcards" }).click();
  await expect(page.getByText("You've used today's 3 free decks")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Start the web server in the background (one per worktree; it picks this worktree's port) and run:
`bunx playwright test e2e/tools/pdf-to-flashcards.spec.ts e2e/csp/csp.spec.ts --timeout 60000`
Expected: PASS. The CSP spec needs a production build served (`e2e/csp/serve-dist.ts`); follow its header comment if it does not run against the dev server.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(e2e): free PDF to flashcards tool flow (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- e2e/tools/pdf-to-flashcards.spec.ts
```

---

### Task 18: Validation gates

- [ ] **Step 1: Typechecks (one at a time)**

Run: `bun run typecheck:web`, then `bun run typecheck:convex`, then `bun run typecheck:evals`.
Expected: all PASS.

- [ ] **Step 2: Tests and lint**

Run: `bun run test:convex`, then `bun run test:web`, then `bun run lint`, then `bun run lint:design`.
Expected: all PASS; design-lint counts unchanged or lower.

- [ ] **Step 3: Build with prerender**

Run: `bun run --cwd apps/web build`
Expected: succeeds; `apps/web/dist/tools/pdf-to-flashcards/index.html` exists and contains `<h1>Free PDF to Flashcards Maker</h1>`, `"@type":"HowTo"` and `"@type":"WebApplication"`; `apps/web/dist/sitemap.xml` contains `/tools/pdf-to-flashcards`.
Check: `grep -c "pdf-to-flashcards" apps/web/dist/sitemap.xml && grep -o '"@type":"HowTo"' apps/web/dist/tools/pdf-to-flashcards/index.html`
Then check that the tool is its own chunk and the entry chunk does not contain pdfjs: `ls apps/web/dist/assets | grep -i "PdfToFlashcards"`.

- [ ] **Step 4: Keep the committed sitemap**

The build rewrites `apps/web/public/sitemap.xml`. Commit that change (it now lists the tool) instead of reverting it:

```bash
git commit -m "chore(seo): sitemap lists /tools/pdf-to-flashcards (#93)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- apps/web/public/sitemap.xml
```

---

### Task 19: Manual verification on dev, then prod salt

- [ ] **Step 1: Deploy functions to dev once**

Check no other session runs `convex dev` on `prestigious-canary-33`; then run `npx convex dev --once`.
Expected: functions pushed, including `freeTools/*` and the `/tools/flashcards` route.

- [ ] **Step 2: Real run in the browser pane**

Start the web dev server via the preview tools, open `/tools/pdf-to-flashcards`, upload a real text PDF (any lecture PDF), generate 20 cards. Confirm: cards render and flip, Anki download opens in Anki's importer format, Quizlet copy lands on the clipboard, CSV opens. Take a screenshot (light, dark, 390 px wide) for the PR.

- [ ] **Step 3: Header behaviour and spoof test**

In the Convex dashboard logs (dev), find the `free_tools` `generated` line: note `xffHops` (expect 1) and `ipKnown: true`.

Limit test: generate 3 decks on the page, then a 4th. Expect "You've used today's 3 free decks". Then generate once from a different network (phone hotspot or VPN) and expect a deck: that proves the key varies by caller and is not one shared internal address.

Spoof test (the unit and HTTP tests cover the logic; this checks the real edge): in the browser pane's devtools, copy the 4th (429) request as fetch, add header `"x-forwarded-for": "198.51.100.1"`, and replay it with a fresh token by clicking Generate again while a request-override is set — or, if that is impractical, skip it and rely on `xffHops`: with `xffHops: 1` on unspoofed requests the edge overwrites or appends a single hop, and the last-entry rule holds.

If `xffHops` > 1 on a plain request (internal hops appended), the last entry may be an internal address shared by everyone: switch `clientIpFromHeaders` to Convex's documented client-IP source if one exists, update `clientIp.test.ts`, and re-run Steps 1–3.

- [ ] **Step 4: Sign-up carry-over**

In a private window: generate a deck, click "Save & study with spaced repetition", sign up with a throwaway email. Expect navigation to `/notebook/<id>` with one text source (processing → ready) and a completed flashcard set titled like the deck. Delete the test notebook/account afterwards.

- [ ] **Step 5: Set the production salt**

Run (value generated in place, never printed):

```bash
npx convex env set --prod FREE_TOOL_IP_SALT "$(openssl rand -hex 32)" >/dev/null && npx convex env list --prod | cut -d= -f1 | grep FREE_TOOL_IP_SALT
```

Expected: prints `FREE_TOOL_IP_SALT`.

- [ ] **Step 6: Open the PR**

Push and open a PR titled `feat(tools): free PDF to flashcards tool, no signup (#93)` with: summary, the spoof-test result, screenshots, the note that Vercel previews use `*.vercel.app` (not in the Turnstile hostname list) so the tool's generate call fails on previews unless `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000BB` is set for Preview and the preview Convex deployment has the matching test secret, and `Closes #93`. Mention the merge-conflict risk with `feature/compare-pages` in `publicSeoPages.ts`, `Footer.tsx`, `llms.txt` and `sitemap.xml`.
