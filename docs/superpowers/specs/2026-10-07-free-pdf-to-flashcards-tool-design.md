# Free PDF → flashcards tool (no signup) — design

Issue: #93 (part of #87). Growth plan: organic initiative #1 — "flashcard maker" (~22K/mo), "pdf to flashcards".

## Goal

A single-purpose public page, `/tools/pdf-to-flashcards`, where anyone can turn a PDF or pasted notes
into flashcards without an account, export them to Anki / Quizlet / CSV, and optionally sign up to keep
studying the deck with spaced repetition. It must rank (prerendered head, structured data, sitemap) and
keep anonymous LLM spend bounded.

## Decisions

| Question | Decision |
| --- | --- |
| Abuse protection | Cloudflare Turnstile (invisible) + per-IP daily limit + global daily cap |
| Input | PDF text extracted in the browser with `pdfjs-dist` (already a dependency), or pasted notes. No upload, no OCR |
| Save on signup | Deck + source text carried into a new notebook after sign-in |
| Transport | Convex **HTTP action** — the only Convex entry point that can read the caller IP |

## Architecture

```
/tools/pdf-to-flashcards (prerendered head + crawler body; lazy React route)
  ├─ PDF → pdfjs getTextContent (lazy chunk)  ─┐
  ├─ or paste notes ───────────────────────────┤→ text, capped at MAX_WORDS
  ├─ Turnstile invisible widget → token        │
  └─ fetch POST {VITE_CONVEX_SITE_URL}/tools/flashcards { text, cardCount, turnstileToken }
       convex/http.ts → convex/freeTools/flashcardsHttp.ts
         1. CORS allowlist (getCorsHeaders) + body size caps
         2. verify Turnstile token (siteverify; TURNSTILE_SECRET_KEY)
         3. atomic reservation (reserveFreeFlashcardRun, one mutation): the success windows are checked, not
            consumed — freeToolFlashcardsIp (key = SHA-256(ip + FREE_TOOL_IP_SALT)), freeToolFlashcardsGlobal —
            and one attempt is consumed from each attempt window (6/IP, 600 global) before the LLM call
         4. ctx.runAction(internal.freeTools.flashcards.generate) — one structured LLM call
         5. on success consume the success windows (consumeFreeFlashcardLimits) → 200 { title, cards }
  ├─ results: FlipCard preview + full list
  ├─ export: Anki .txt, Quizlet clipboard text, CSV
  └─ "Save & study with spaced repetition"
       → localStorage { title, sourceText, cards, savedAt } (24 h expiry) → AuthModal
       → after sign-in: mutation freeTools.claimDeck → navigate to /notebook/:id
```

### Backend units

- `convex/freeTools/flashcardsHttp.ts` — `httpAction`. Parses and validates the body, verifies Turnstile,
  reserves an attempt, consumes the success limits after generation, calls the generate action, maps outcomes to status codes. Raw IPs are never
  stored or logged; only the salted hash is used as a rate-limit key.
- `convex/freeTools/turnstile.ts` — `verifyTurnstileToken(token, ip, secret)` → `{ ok, codes }`; plain `fetch`.
- `convex/freeTools/flashcards.ts` (`"use node"`) — `internalAction generate({ text, cardCount })` →
  `{ title, cards }`. Reuses `getMapPrompt`, `FlashcardArraySchema`, `cleanFrontText`/`cleanBackText`,
  `isUsableFlashcard`, `heuristicDedupeFlashcards`; card validators live in `convex/freeTools/validators.ts`
  (runtime-neutral, shared with `claimDeck`); model `env.FAST_LLM`, single call through the existing
  structured-output path with a 90 s timeout. Title from the first heading/line of the text (no extra LLM call).
- `convex/freeTools/claimDeck.ts` — authenticated `mutation claimDeck({ title, sourceText, cards })`: validates
  sizes, creates a notebook, adds `sourceText` as a `text` document in the shape `documents.upload` writes and
  schedules embedding (so it is chunked and embedded), and inserts a `completed` flashcards row with
  `ctx.db.insert` (not `_model/flashcards`). Counts as the user's normal notebook creation for plan limits:
  the notebook `LimitError` is rethrown as a `ConvexError` so the client keeps its data.
- Rate limits in `convex/_lib/rateLimits.ts`: `freeToolFlashcardsIp` (fixed window, 3 / day) and
  `freeToolFlashcardsGlobal` (fixed window, 300 / day). Numbers live next to the other limits.

### Bounds

- Input: `MIN_WORDS = 80`, `MAX_WORDS = 12_000` (client truncates and tells the user; server rejects above
  exactly `MAX_WORDS`). Body caps: the real cap is 200_000 characters (`raw.length`); the `content-length`
  precheck is in UTF-8 bytes, so it allows 4× that (`FREE_FLASHCARD_MAX_BODY_UTF8_BYTES`) and 3-byte scripts
  (Hindi, Tamil, Bengali) within the word cap are not refused. PDFs: first 40 pages read.
  Word counting/truncation and these constants live in `convex/_lib/freeToolBounds.ts`, shared with the web page.
- Output: `cardCount ∈ {10, 20, 30}`, default 20.
- Client IP = last `x-forwarded-for` entry (not spoofable whether the edge appends or overwrites); verified on dev in the manual check.
- Every LLM call first reserves an attempt (failures and timeouts included) in one mutation; successful
  decks are counted separately after generation. Worst-case daily spend = global attempts cap (600) × one
  FAST_LLM call on ≤ 12k words. Per IP: ≤ 6 calls/day, ≤ 3 successful decks/day. Nothing stored for
  anonymous runs.

### Responses

| Status | When | UI |
| --- | --- | --- |
| 200 | Cards generated | Show deck |
| 400 / 413 | Bad body, too short, too long, or body over the cap | Alert with a message for the cause: `text_too_short` → "Add a bit more text"; `text_too_long` / `too_large` → "That's longer than the free tool accepts"; otherwise "Check your text" |
| 403 | Turnstile failed | Fetch a fresh token and retry once automatically; then "Verification failed" alert |
| 429 `ip` | Per-IP limit hit (3 decks or 6 attempts a day) | "You've reached today's free limit" + reset time + signup CTA |
| 429 `global` | Global cap hit | "The free tool is busy today" + signup CTA |
| 502 / 504 | LLM error / timeout, or zero usable cards | Alert; Generate stays enabled to retry. Does not use up a free deck (it does use one of the 6 daily attempts) |
| 503 | `TURNSTILE_SECRET_KEY` / `FREE_TOOL_IP_SALT` unset | Generic "Something went wrong" alert |

## Frontend units (`apps/web/src/features/tools/`)

- `pages/PdfToFlashcardsPage.tsx` — page shell (lazy route), `SEOMeta`, `Footer`, `AuthModal`; native shell
  redirects like `SeoContentPage`.
- `components/SourceInput.tsx` — tabs: PDF drop zone / paste textarea; word count + cap notice.
- `components/DeckPreview.tsx` — `FlipCard` + `FlashcardFront`/`FlashcardBack` from studio, plus list view.
- `components/ExportBar.tsx` — Anki, Quizlet, CSV.
- `lib/extractPdfText.ts` — pdfjs `getTextContent` over the first 40 pages; returns `{ text, pagesRead, totalPages }`;
  empty text ⇒ "looks scanned — sign up free to use OCR".
- `lib/flashcardExport.ts` — pure formatters:
  - Anki: `#separator:tab`, `#html:false`, `#columns:Front\tBack` headers, one card per line, tabs/newlines
    in fields flattened to spaces.
  - Quizlet: `front\tback` per line (copied to clipboard) with import instructions.
  - CSV: `Front,Back`, quoted, `""` escaping, UTF-8 BOM.
- Word counting and truncation: `convex/_lib/freeToolBounds.ts` (imported via `@convex/_lib/freeToolBounds`; no web `lib/textBounds.ts`).
- `lib/freeToolClient.ts` — `fetch` to the HTTP endpoint, typed result union.
- `lib/pendingDeck.ts` — localStorage read/write/clear (try/catch), 24 h expiry.
- `hooks/useTurnstile.ts` — loads `challenges.cloudflare.com/turnstile/v0/api.js` on demand, invisible widget.
  A failed challenge (error codes 300xxx / 600xxx) shows "Security check failed — try refreshing the page or
  using a different browser" (`lib/turnstileErrors.ts`); a load failure or timeout shows "We couldn't verify
  your browser — check that nothing is blocking challenges.cloudflare.com".
- After sign-in, the page (and `/home` as a fallback) checks `pendingDeck` and calls `claimDeck`.

The page uses `fetch`, not the Convex React client, for generation, so the anonymous path pulls in no
Convex/auth code beyond what the shell already loads.

## SEO

- Register in `PUBLIC_SEO_PAGES` with `WebApplication`, `HowTo`, `FAQPage` and breadcrumb JSON-LD;
  add a prerender body builder (`toolPrerenderHtml.ts`) dispatched from `buildPublicSeoPrerenderBody`.
  Sitemap and IndexNow follow from the registry.
- `App.tsx`: lazy `<Route>` + `isPublicPage`. `llms.txt`: add under canonical pages.
- Footer: new "Free tools" column (separate from the compare branch's edits). Cross-link from
  `/students/ai-flashcards`.
- Below-the-fold copy: how it works, why spaced repetition, importing into Anki, importing into Quizlet, FAQ.
- CSP: allow `https://challenges.cloudflare.com` in `script-src` and `frame-src`.

## Configuration

- Convex env (dev + prod): `TURNSTILE_SECRET_KEY`, `FREE_TOOL_IP_SALT`.
- Web: site key `0x4AAAAAAFQDDSV1WRFKhINF` is the code default; `VITE_TURNSTILE_SITE_KEY` overrides it (e.g. Cloudflare's test key `1x00000000000000000000BB`).
- Dev and tests use Cloudflare's published always-pass test keys.

## Testing

- `test:convex`: HTTP handler with Turnstile and LLM mocked — 400/403/429-ip/429-global/502 paths, limits
  consumed only on success, IP never stored unhashed; `claimDeck` requires auth and creates notebook + text
  source + completed deck; rate-limit config test covers the new windows.
- `test:web`: export formatters, invalid-text messages, pendingDeck, and the `seoHtml` registry test for the tool page.
- `test:e2e`: paste → mocked endpoint → cards render → Anki download.
- Manual: one real PDF on the dev deployment with Turnstile test keys. No eval changes (prompt reused unchanged).

## Out of scope

Other free tools (citation checker, PDF summarizer), `.apkg` export, OCR for scanned PDFs on the anonymous
path, custom analytics events, the broader marketing-bundle split.
