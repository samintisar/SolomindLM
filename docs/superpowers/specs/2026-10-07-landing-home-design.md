# Landing home page on the design system (#263, PR 1 of 2)

**Status:** approved in brainstorming, 2026-10-07.
**Mockup (source of truth for look and copy):** [`2026-10-07-landing-home-mockup.html`](2026-10-07-landing-home-mockup.html)
(open it in a browser; it is interactive and fixed at a 1280px design width).

## Goal

Rebuild the marketing home page (`/`) on the shadcn primitives and semantic tokens, with a new story and
copy, so `features/landing` stops carrying design-lint debt and the page sells the product instead of listing it.

## Scope

**PR 1 (this spec):** the home page: `LandingPage.tsx` and everything under `features/landing/components/`,
including `Footer.tsx` (shared with the content templates) and the landing helpers in `index.css`.

**PR 2 (separate spec):** the content templates: `IntentLandingPage`, `ClusterHubLandingPage`,
`SeoContentPage`, `FaqPage`. They get the new nav, footer and surfaces, then the whole folder joins `MIGRATED`.

Out of scope: new marketing pages (#88–#92), copy on the content templates, phone-app shell (native shell
redirects stay as they are).

## Design decisions (from brainstorming)

- **Theme:** pinned light with `.auth-form-light` on the page root, like sign-in. No dark variant.
- **Logo:** the real `/SolomindLM_logo.png` (nav, footer, the preview's header), not a drawn mark.
- **Type:** headings in `font-display` (Libre Baskerville), body in the serif body face (Lora), controls in
  sans (Inter). Every heading has one italic accent phrase in `text-primary`, regular weight.
- **Surfaces:** soft layered only: `bg-card` + `shadow-xs` + `ring-1 ring-hairline` for in-flow cards,
  `shadow-xl` for floating callouts. No borders thicker than a hairline, no palette colours, no gradient text.
- **Background:** faint graph paper (the chat panel's grid language) behind the hero, fading out with a
  radial mask. Replaces the dot grid and the orange/amber/rose glows.
- **Motion:** sections fade and rise 12px once as they enter the viewport (house `ease-out`, ~700ms),
  off under `prefers-reduced-motion`. The hero is never hidden behind a reveal (LCP). The Studio marquee
  keeps scrolling (#231) and pauses on hover.

## Running order and copy

Copy is final; implement it verbatim (straight from the mockup).

0. **Nav:** logo + "SolomindLM"; anchor buttons Features, Use cases, Pricing, FAQ; "Log in" (ghost, opens
   `AuthModal`); "Get started" (default, `onGetStarted`). Transparent at the top, `bg-background/80` with
   blur and a hairline once scrolled.
1. **Hero (B3):**
   - H1: "AI that makes you think, *not thinks for you.*"
   - Lede: "SolomindLM won't write your essay. It reads your sources with you, answers with citations, and
     quizzes you until it sticks — so what you know at the exam is actually yours."
   - Buttons: **Start free** (`onGetStarted`), **How it works** (outline, scrolls to `#features`).
   - Fine print with check icons: "Free plan, no card" · "Works with any course".
   - Right: the **notebook preview** (below).
2. **Source strip:** italic "Bring what you already have", then icon + label: PDFs, Slides & docs, YouTube,
   Web pages, Audio, Scans, Research papers, Google Drive. Hairlines above and below.
3. **How it works** (`id="features"`, so existing `/#features` links keep working; nav "Features" scrolls here): eyebrow "How it works", H2 "Read it.
   Practise it. *Go deeper.*", sub "One notebook per course or project. Every step stays tied to the sources
   you put in it." Then three alternating beats (text / visual), each with a numbered label, H3, paragraph
   and check-list:
   - **1 · Read with it** — "Every answer shows its working." Visual: answer card with citations; citation
     **2** active; source card "Lecture 12 – Beta blockers.pdf · Slide 15" with the cited line highlighted
     and pinned with the same **2**.
   - **2 · Practise it** — "Then it makes you prove you know it." Visual: flashcard (with ratings), quiz
     (Bisoprolol correct, one-line explanation), "Due today · 12 cards" chip, written question marked 4/5
     with feedback citing "Lecture 12, slide 15". Bullets: Spaced-repetition flashcards · Quizzes that
     explain every answer · Written answers with feedback · Mind maps and audio recaps.
   - **3 · Go deeper** — "When the slides aren't enough." Visual: literature table (two Included, one
     Excluded with "Not human subjects") and a PRISMA card (Found 214 → Screened 96 → Included 12).
4. **Studio** (on a `bg-card` band): eyebrow "Studio", H2 "Twelve ways to work with *one notebook.*",
   sub "Everything Studio makes is built from your sources and saved right next to them." Two marquee rows
   (opposite directions) of tool tiles: tinted icon square, title, one-line description (12 tools as in the
   mockup).
5. **Who it's for** (`id="use-cases"`): H2 "For people who have to *actually know it.*" `Tabs`: Students ·
   Medical students · Researchers · Professionals. Each panel: H3 scenario, paragraph, three numbered steps,
   link to the audience page, and a sample notebook card (cover, title, source count, output chips).
   Links: `/students`, `/students/ai-flashcards`, `/research/ai-literature-review`, `/students/ai-reports`.
6. **Pricing** (`id="pricing"`): H2 "Start free. *Upgrade when it's worth it.*" Annual / Monthly toggle
   with "Save 50%". Free and Pro cards (Pro floating with a primary ring and a "Best value" badge on annual).
   Plan numbers are today's (`pricingPlans`), phrased as in the mockup.
7. **FAQ** (`id="faq"`): two columns. Left: H2 "Questions, *answered.*", "Can't find yours? Email
   support@solomindlm.com, a person reads every message.", link "See all questions" → `/faq`. Right:
   disclosure rows, first open. Renders **all** `LANDING_FAQS` (the FAQ structured data and prerender use
   that list, so visible content must match it).
8. **Closing — "Your first notebook":** eyebrow "Your turn", H2 "Your next notebook is *one upload away.*",
   lede "Start with the lecture you're dreading. Ask it anything, then let it question you back. Free, no
   card, and you can stop whenever." One button **Create my first notebook →** (`onGetStarted`). Right: a new
   notebook card (brown cover, title "Your course" with a blinking caret, "0 sources · start with one", two
   empty slots and "Add your first source") over two ghost cards. No pricing button.
9. **Footer:** logo + tagline "An AI study and research partner that works from the material you give it.";
   columns Product, For students, For research, Company (links from today's footer data:
   `getIntentPagesByCluster`, comparison and guide pages, privacy, terms, socials); copyright row with
   "Made for people who'd rather understand it."

### The notebook preview (hero)

A **static, decorative** picture of the real notebook. `aria-hidden`, `inert`, no handlers, no Convex, no
Studio modal imports (today's `LandingHeroMockup` imports seven Studio modals; it goes).

- Built at app size with normal type, then scaled with `scale-76` from the top-left, so the type stays on
  the Tailwind scale. Header (logo, "Pharmacology · Week 6", Share chip, avatar), then three columns:
  Sources (Add source button, five typed source tiles with checks), Chat on graph paper (question, cited
  answer with **[1]** active, composer with the Chat mode chip), Studio (six-tool grid incl. Written
  questions; Saved list with "Week 6 written questions" selected).
- **Citation tooltip:** inside the chat column, directly under the active [1], arrow on the number, small
  (≈236px): file + slide, quote with the key sentence highlighted, "Open in source".
- **Written-question callout:** full size, floating over the bottom-right of the frame (4/5, your answer,
  feedback with the slide reference).

## Building with the system

- Primitives at call sites take layout classes only. New looks are new `cva` variants in
  `src/shared/components/ui`: `Card` `featured` (Pro plan) and `Badge` `success`. Decorative
  product pictures use a feature-local `DemoSurface`, not a primitive.
- Plain elements (headings, paragraphs, the decorative preview's inner markup) use tokens and the spacing
  scale; no arbitrary values, raw colours, inline styles (custom properties only) or hand-rolled shadows.
- FAQ rows: `Collapsible` inside `Card variant="flush"` (the variant already handles the trigger's ring).
- Audience switcher and billing switch: `Tabs`.
- `index.css`: add a `landing-paper` background utility; drop `.hero-search-glass`. `.landing-grid-pattern`
  stays until PR 2 (templates use it).
- Split the home page into focused files under `features/landing/components/home/` (nav, hero, preview,
  source strip, each beat, studio marquee, audiences, pricing, FAQ, closing). `Footer.tsx` stays shared.
- Data that is content (tools, audiences, pricing plans, source types) lives in typed constants next to the
  components, not inline JSX.

## Phone layout (< 768px)

Not mocked; follow these rules and show screenshots in the PR.

- Nav: logo, "Get started", and a menu button opening a `Sheet` with the four links and "Log in".
- Hero: copy first (H1 ≈ 40px), buttons stacked full width. Preview below: only the Chat column (with the
  tooltip) at full width; the written-question callout overlaps its bottom edge, centred.
- Source strip: a 4-column grid of icon-over-label items.
- Beats: text then visual; visuals become a vertical stack with small overlaps instead of absolute layouts.
- Marquee: two rows kept, narrower tiles. Tabs list scrolls horizontally; panel stacks.
- Pricing cards stack; FAQ heading sits above the rows; closing stacks (ghost cards hidden); footer in two
  columns.

## Must keep working

- `e2e/smoke/smoke.spec.ts`: buttons named "Get Started", "Features", "Pricing" are visible on desktop, and
  exactly one button matches "Get Started" (Playwright is case-insensitive substring by default, so no other
  button may contain it). "Get Started" leads to `/home` or `/sign-in`.
- SEO: one `h1`; `SEOMeta pagePath="/"`; FAQ structured data matches the visible FAQ; update the tagline in
  `shared/seo/publicSeoPrerenderHtml.ts` to the new lede's first sentence.
- Native shell redirect at the top of `LandingPage` unchanged.
- No Lighthouse regression on `/` (performance, SEO). Dropping the Studio modal imports should help (#94).

## Done when

- `features/landing/components/**` and `LandingPage.tsx` are in `MIGRATED` at 0 findings; the baseline
  drops in the same PR (`lint:design:update`).
- Unit tests cover: Get started / Start free / Create my first notebook call `onGetStarted`; Log in opens
  the auth modal; nav anchors scroll; audience tabs switch panels; billing toggle switches price and badge;
  FAQ rows open and close; the preview is hidden from assistive tech.
- Gates: typecheck, Biome, design lint, Knip, `test:web`, smoke e2e; screenshots at 1440 and 390 attached.
