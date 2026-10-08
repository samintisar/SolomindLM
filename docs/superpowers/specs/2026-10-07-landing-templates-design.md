# Landing content pages on the design system (#263, PR 2 of 2)

Status: approved direction (option B), 2026-10-07. Mockups: `.superpowers/brainstorm/*/content/tool-page-layouts.html`
(option B) and `other-pages.html`.

## Goal

Move every public content page off the old look and onto the home page's design (#405), so the marketing
site reads as one product. `features/landing` reaches 0 design-lint findings and joins `MIGRATED`.

| Template | Routes | Count |
| --- | --- | --- |
| `ClusterHubLandingPage` | `/students`, `/research` | 2 |
| `IntentLandingPage` | `/students/*`, `/research/*` tool pages | 17 |
| `SeoContentPage` | `/compare` hub, 8+ comparisons, guides | 15 |
| `FaqPage` | `/faq` | 1 |

Out of scope: page titles, meta descriptions, structured data, sitemap and the prerendered HTML
(`shared/seo/*`) do not change. Copy changes are limited to the additions listed under **Content**.

## Shared frame

All four templates use one frame, `MarketingPage`, replacing four copies of the same header and shell:

- `auth-form-light min-h-screen bg-background font-serif` (pinned light, like the home page).
- The home `LandingNav`, `<main>`, the closing section, `Footer`, and the sign-up `AuthModal`.
- Native shell: same redirect as today (`/home` or `/sign-in`).
- The old sticky header with "Back to home" and `.landing-grid-pattern` are removed.

**Nav on other pages.** On `/` the nav items scroll to sections as now. On every other page they are links to
`/#features`, `/#use-cases`, `/#pricing`, `/#faq`. The home page scrolls to `location.hash` after it mounts
(this also fixes the footer's existing `/#features` and `/#pricing` links, which land at the top today).
"Get started" and "Log in" open the sign-up modal on content pages.

**Closing section.** `FirstNotebookCta` takes optional `body` and `ctaLabel` props; content pages pass the
page's `conversionPromise` and `ctaLabel`. The heading ("Your next notebook is one upload away.") and the
new-notebook demo stay.

**FAQ.** The home `FaqRow` moves into a shared `FaqList` (controlled `Collapsible`, `forceMount` + `hidden`,
so closed answers stay in the HTML for the FAQ structured data). It accepts an optional learn-more link.
Content pages show their FAQ in the home FAQ's two-column layout: heading on the left, questions on the right.

## Hero (all templates)

`PageHero`, centred, on the masked graph paper (`.landing-paper`):

- Above the h1: a breadcrumb trail (`nav aria-label="Breadcrumb"`) on tool, comparison and guide pages, or
  an eyebrow ("For students", "For researchers", "Help center") on the hubs and `/faq`.
- h1 in `font-display`. An optional `h1Accent` (a substring of `h1`) renders in the italic primary accent.
- Lede in Lora, at most `max-w-2xl`.
- Primary button with the page's `ctaLabel`, plus the fine print "Free plan, no card".
- Comparison heroes with a quick answer have no hero button, because the quick answer carries it.

## Tool pages (IntentLandingPage)

1. Hero.
2. **Stage: "Your source → What you get".** One wide muted panel (`rounded-3xl bg-muted/40 ring-1
   ring-hairline ring-inset`, like the home beats).
   - Left: two or three source cards (file icon, name, meta), slightly rotated.
   - Middle: an arrow.
   - Right: the output.
   - Each side has a small label ("Your source", "What you get") and, under it, the page's existing
     `sourceToOutput.source` and `sourceToOutput.output` text as a caption. That keeps the words on the page
     for readers and search.
   - On phones the two sides stack, with the arrow pointing down.
   - The pictures are decorative (`aria-hidden`, `inert`); the captions are not.
3. **Proof points**: the page's `proofBullets` as a row of check items (four columns on desktop, two on
   tablet, one on phones).
4. `heroCrossLink`, when present, is a small card under the proof points.
5. FAQ, then "Related tools" (link cards, see **Tool cards**), then the closing section.

**Scenes.** `intentScenes.tsx` maps every `intentKey` to `{ sources, output }`. A test fails if any intent page
has no scene.
- Sources are short, plausible file cards that match the page's `sourceToOutput.source`, for example
  "Ch. 10 · Beta blockers.pdf" and "Lecture 12 slides".
- Output reuses a home demo card where one exists:

| intentKey | Output |
| --- | --- |
| flashcards | `FlashcardDemo` |
| quiz | `QuizDemo` |
| writtenQuestions | `WrittenQuestionDemo` |
| chat | `AnswerDemo` |
| literatureReview | `LiteratureTableDemo` |
| everything else | `OutputCard` |

`OutputCard` is a new card: a tinted tool icon, a title, and three or four short lines in the tool's shape.
Examples: an audio player with a waveform, a mind map's three branches, a report's section headings, a
spreadsheet's header row, a share link with "View" and "Fork".

## Hubs (ClusterHubLandingPage)

1. Hero with an eyebrow.
2. **Stage: the tool directory.**
   - Each hub section is a numbered group heading ("1 · Bring your materials in") with a count.
   - Each group has a grid of **tool cards**: one column on phones, then two, three or four columns, with
     four used for the 8-tool group.
3. `summaryBullets` as a row of checks.
4. "Guides and comparisons": plain link cards.
5. FAQ, then the closing section.

**Tool cards** (`ToolLinkCard`, also used for "Related tools"):
- The tool's Studio icon in its tone (`toneIcon`).
- The tool's `navLabel`, plus a new one-line `cardBlurb`.
- "Learn more →".
- The whole card is the link, with a hover lift and a visible focus ring.

## Comparison and guide pages (SeoContentPage)

1. Hero with breadcrumbs and the `intro` as the lede.
2. **Stage: Quick answer** (only when `quickAnswer` exists). Two cards side by side ("Choose {competitor}
   if…" and "Choose SolomindLM if…"); ours uses the `featured` card and carries the sign-up button. They stack
   on phones.
3. **Table** (only when `comparisonTable` exists).
   - "Side by side" heading, then the table in a flush card.
   - Row headers are `th scope="row"`.
   - The SolomindLM column has a light primary tint, including its header.
   - The "details checked {date} against: …" sources line sits right under the card.
   - On narrow screens the table scrolls sideways inside the card (`overflow-x-auto`, with a min width).
4. **Article**: `sections` at reading width (`max-w-170`), h2 in `font-display`, paragraphs in Lora at a
   relaxed line height, bullets as a styled list.
5. FAQ, then "Related pages" (link cards), then the closing section.

Guides and the `/compare` hub have no quick answer or table, so they render hero → article → FAQ → related →
closing.

## /faq (FaqPage)

1. Hero: "Help center" eyebrow, then the h1 "Frequently asked *questions*". The h1 text is unchanged for
   search; the accent on "questions" is hardcoded because this page has no config. There's no hero button.
2. Topic chips (links to `#category-id`) that wrap on phones.
3. One block per category in the two-column FAQ layout: title and description on the left, `FaqList` on the
   right, with each row's learn-more link.
4. The closing section.

## Content

New fields, typed and covered by tests:

- `IntentLandingPageConfig.cardBlurb`: one line, at most 60 characters, plain and specific (for example
  Flashcards: "Spaced repetition from your own PDF.").
- `h1Accent?` on intent, hub and SEO content configs: optional; a test checks that every value is a substring
  of its `h1`. It gets filled where a natural trailing phrase exists.

## Accessibility and SEO

- One h1 per page; section headings are h2 and card titles h3.
- Breadcrumbs are a `nav` with an `ol`.
- Decorative scenes are `aria-hidden` and `inert`.
- All FAQ answers stay in the DOM.
- The table keeps its header semantics.
- Lighthouse accessibility and SEO stay at 100 on one page of each type.

## Lint and cleanup

- Add `IntentLandingPage.tsx`, `ClusterHubLandingPage.tsx`, `SeoContentPage.tsx`, `FaqPage.tsx` and the new
  shared components to `MIGRATED`.
- `features/landing` baseline goes 25 → 0.
- Delete `.landing-grid-pattern` from `index.css`.

## Testing

- Each template: renders one h1, the breadcrumb or eyebrow, the CTA opens the sign-up modal, and the FAQ
  answers are in the DOM.
- Comparison pages also render the table with row headers and the sources line.
- Scene registry: every intent page has a scene. `h1Accent` substrings are valid. `cardBlurb` is present and
  at most 60 characters.
- Nav: on a content page the items link to `/#…`; the home page scrolls to the hash on mount.
- Existing config tests (`intentLandingPages`, `seoContentPages`, `faqRegistry`, `seoHtml`) stay green.
- Manual check with screenshots at 1440 and 390px for one page of each type, plus smoke e2e.
