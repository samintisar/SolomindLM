# Landing content pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four content-page templates (hubs, tool pages, comparison/guide pages, /faq) on the
home page's design system, and bring `features/landing` to 0 design-lint findings.

**Architecture:** One shared frame (`MarketingPage`) replaces four copies of the old header and shell. The
templates compose small shared pieces under `features/landing/components/content/` (hero, breadcrumbs,
link cards, the source → output stage, the FAQ block), plus the home page's nav, FAQ rows, closing section
and footer. Each tool page's picture comes from a typed registry, `intentScenes.tsx`, that reuses home demo
cards where they exist.

**Tech Stack:** React 19, React Router 7, Tailwind v4, shadcn primitives (`@/shared/components/ui`),
Vitest + Testing Library + user-event, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-landing-templates-design.md`. Approved mockups:
`.superpowers/brainstorm/*/content/tool-page-layouts.html` (option B) and `other-pages.html`.

**Worktree / branch:** `.worktrees/landing`, branch `feature/landing-templates` (from `origin/main` at 34ec83a7).

---

## Ground rules (read before every task)

- **Design lint** (`docs/design/principles.md`):
  - On primitives (`Button`, `Card`, `Badge`, `Table*`…) use **layout classes only**: margin, width, grid
    and flex placement. Padding, gap, colour, text, radius and shadow on a primitive count as restyling. Put
    them on a plain wrapper element instead, or add a variant to the primitive.
  - No arbitrary values (`[...]`), raw colours, inline `style`, or `dark:`.
  - Class strings must be static: per-item tones go through a `cva` (see `components/home/tone.ts`).
- The pages are pinned light: the frame carries `auth-form-light`. Portaled overlays need `theme="light"`
  (see `SheetContent` in `LandingNav`).
- Decorative pictures are `aria-hidden` and `inert`. Text that carries meaning is never inside them.
- Fonts: `font-display` (Libre Baskerville) for headings, `font-serif` (Lora) for body, `font-sans` (Inter)
  for UI.
- Radix Tabs and Collapsible react to real pointer events: use `userEvent`, not `fireEvent`.
- Commit with an explicit pathspec: `git commit -m "…" -- <paths>`. Never use bare `git stash`.
- Never kill processes by name, only by PID.
- Run commands from `apps/web` unless noted. Single test file: `bunx vitest run <path>`.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `features/landing/components/home/LandingNav.tsx` | modify | Nav items scroll on `/`, link to `/#id` elsewhere |
| `features/landing/LandingPage.tsx` | modify | Scroll to `location.hash` after mount |
| `features/landing/components/FaqList.tsx` | create | FAQ rows (moved out of home `FaqSection`), with an optional learn-more link |
| `features/landing/components/home/FaqSection.tsx` | modify | Uses `FaqList` |
| `features/landing/components/home/FirstNotebookCta.tsx` | modify | Optional `body` and `ctaLabel` props |
| `features/landing/components/content/MarketingPage.tsx` | create | Frame: light pin, nav, main, closing, footer, sign-up modal, native-shell redirect |
| `features/landing/components/content/PageHero.tsx` | create | Centred hero: eyebrow or breadcrumbs, accented h1, lede, CTA, fine print |
| `features/landing/components/content/Breadcrumbs.tsx` | create | `nav` + `ol` breadcrumb trail |
| `features/landing/components/content/accentHeading.tsx` | create | Splits an h1 around its `h1Accent` |
| `features/landing/components/content/LinkCard.tsx` | create | Whole-card link with optional tool icon (hub tools, related pages, guides) |
| `features/landing/components/content/CheckRow.tsx` | create | Proof points and summary bullets as a row of checks |
| `features/landing/components/content/ContentFaq.tsx` | create | Two-column FAQ block (heading left, `FaqList` right) |
| `features/landing/components/content/Stage.tsx` | create | The muted panel (`rounded-3xl bg-muted/40 …`) |
| `features/landing/components/content/SourceToOutput.tsx` | create | Tool-page stage: source cards → arrow → output, with captions |
| `features/landing/components/content/OutputCard.tsx` | create | Generic result card for tools without a home demo |
| `features/landing/intentTools.ts` | create | intentKey → icon + tone |
| `features/landing/intentScenes.tsx` | create | intentKey → scene (sources + output) |
| `features/landing/intentLandingPages.ts` | modify | `cardBlurb`, `h1Accent` |
| `features/landing/clusterHubPages.ts` | modify | `h1Accent` |
| `features/landing/seoContentPages.ts`, `competitorComparePages.ts` | modify | `h1Accent` |
| `shared/components/ui/table.tsx` | modify | `highlight` variant on `TableHead` / `TableCell` |
| `dev/DesignGallery.tsx` | modify | Show the highlighted column |
| `features/landing/IntentLandingPage.tsx` | rewrite | Tool page |
| `features/landing/ClusterHubLandingPage.tsx` | rewrite | Hub |
| `features/landing/SeoContentPage.tsx` | rewrite | Comparison, guide and compare-hub pages |
| `features/landing/FaqPage.tsx` | rewrite | /faq |
| `index.css` | modify | Delete `.landing-grid-pattern` (both rules) |
| `apps/web/eslint.config.mjs`, `design-lint-baseline.json` | modify | Add to `MIGRATED`; ratchet the baseline |

All paths under `apps/web/src/` unless they start with `apps/`.

---

### Task 1: Nav links work from any page; home scrolls to the hash

**Files:**
- Modify: `features/landing/components/home/LandingNav.tsx`
- Modify: `features/landing/LandingPage.tsx`
- Test: `features/landing/components/home/LandingNav.test.tsx` (exists; extend), `features/landing/LandingPage.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Add to `LandingNav.test.tsx` (keep the existing tests; they render at `/`):

```tsx
it("links nav items to home sections when not on the home page", () => {
  render(
    <MemoryRouter initialEntries={["/students/ai-flashcards"]}>
      <LandingNav onGetStarted={vi.fn()} onLogin={vi.fn()} />
    </MemoryRouter>
  );
  const nav = screen.getByRole("navigation", { name: "Main" });
  for (const item of NAV_ITEMS) {
    expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute(
      "href",
      `/#${item.target}`
    );
  }
});
```

Add to `LandingPage.test.tsx`:

```tsx
it("scrolls to the section named in the URL hash", () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  render(
    <MemoryRouter initialEntries={["/#pricing"]}>
      <LandingPage onGetStarted={vi.fn()} />
    </MemoryRouter>
  );
  expect(scrollIntoView).toHaveBeenCalled();
  expect(scrollIntoView.mock.contexts[0]).toHaveProperty("id", "pricing");
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `bunx vitest run src/features/landing/components/home/LandingNav.test.tsx src/features/landing/LandingPage.test.tsx`
Expected: the new tests fail. The nav items are buttons, not links, and nothing reacts to the hash.

- [ ] **Step 3: Implement**

`LandingNav.tsx`:
- `const onHome = useLocation().pathname === "/";`
- Add a `NavItemButton` helper used by both the desktop and the Sheet navs:

```tsx
function NavItemButton({
  item,
  onHome,
  onNavigate,
  className,
}: {
  item: (typeof NAV_ITEMS)[number];
  onHome: boolean;
  onNavigate: (target: string) => void;
  className?: string;
}) {
  if (onHome) {
    return (
      <Button variant="ghost" size="sm" className={className} onClick={() => onNavigate(item.target)}>
        {item.label}
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm" className={className}>
      <Link to={`/#${item.target}`}>{item.label}</Link>
    </Button>
  );
}
```

- The Sheet version passes `className="justify-start"` and has no `size` today. Give the helper an optional
  `size` prop so the mobile items keep the default size.
- In the Sheet, a link click must also close the menu. Add `onClick={() => setMenuOpen(false)}` on the `Link`
  through a prop.

`LandingPage.tsx`:

```tsx
const { hash } = useLocation();
useEffect(() => {
  if (hash) scrollToSection(hash.slice(1));
}, [hash]);
```

Place it before the native-shell early return, because hooks can't follow a conditional return. Import
`scrollToSection` from `./components/home/scrollToSection`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run the same command. Expected: PASS, and the existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): nav links reach home sections from any page; home scrolls to the hash" -- src/features/landing/components/home/LandingNav.tsx src/features/landing/components/home/LandingNav.test.tsx src/features/landing/LandingPage.tsx src/features/landing/LandingPage.test.tsx
```

---

### Task 2: Shared FAQ rows, and a closing section that takes page copy

**Files:**
- Create: `features/landing/components/FaqList.tsx`, `features/landing/components/FaqList.test.tsx`
- Modify: `features/landing/components/home/FaqSection.tsx`, `features/landing/components/home/FirstNotebookCta.tsx`, `features/landing/components/home/FirstNotebookCta.test.tsx`

- [ ] **Step 1: Write the failing tests**

`FaqList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FaqList } from "./FaqList";

const FAQS = [
  { question: "Q1", answer: "A1", learnMorePath: "/students", learnMoreLabel: "Student tools" },
  { question: "Q2", answer: "A2" },
];

function renderList(defaultOpenIndex?: number) {
  render(
    <MemoryRouter>
      <FaqList faqs={FAQS} defaultOpenIndex={defaultOpenIndex} />
    </MemoryRouter>
  );
}

describe("FaqList", () => {
  it("keeps closed answers in the DOM but hidden", () => {
    renderList();
    expect(screen.getByText("A1")).not.toBeVisible();
    expect(screen.getByText("A2")).not.toBeVisible();
  });

  it("opens the default row and toggles on click", async () => {
    renderList(0);
    expect(screen.getByText("A1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Q2" }));
    expect(screen.getByText("A2")).toBeVisible();
  });

  it("renders the learn-more link inside the answer", () => {
    renderList(0);
    expect(screen.getByRole("link", { name: /Student tools/ })).toHaveAttribute("href", "/students");
  });
});
```

`FirstNotebookCta.test.tsx`: add

```tsx
it("uses the page's copy when given", () => {
  render(<FirstNotebookCta onGetStarted={vi.fn()} body="Custom promise." ctaLabel="Create free account" />);
  expect(screen.getByText("Custom promise.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Create free account/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them and confirm they fail** (`FaqList` doesn't exist; the props are ignored)

- [ ] **Step 3: Implement**

`FaqList.tsx`:
- Move `FaqRow` out of `home/FaqSection.tsx` unchanged: the `Card variant="flush"`, the controlled
  `Collapsible`, the `Button variant="disclosure" size="chip"`, the rotating `Plus`, and
  `CollapsibleContent forceMount hidden={!open}`.
- Add the optional learn-more link under the answer `<p>`, styled like the home FAQ's "See all questions"
  link but with `pb-5` on a wrapping `div` and `px-4`.
- `FaqList({ faqs, defaultOpenIndex }: { faqs: FaqListItem[]; defaultOpenIndex?: number })` renders
  `<ul className="flex flex-col gap-2.5">` with one `<li>` per row.
- `FaqListItem = FAQItem & { learnMorePath?: string; learnMoreLabel?: string }` (the `RegisteredFaq` shape;
  check `faqRegistry.ts` and reuse its type if it already matches).
- Keep the doc comment about `forceMount` + `hidden`.

`FaqSection.tsx`: replace the local `FaqRow` and `ul` with `<FaqList faqs={LANDING_FAQS} defaultOpenIndex={0} />`.

`FirstNotebookCta.tsx`:
- Signature `{ onGetStarted, body, ctaLabel }: { onGetStarted: () => void; body?: string; ctaLabel?: string }`.
- Fall back to the current paragraph and to "Create my first notebook".

- [ ] **Step 4: Run all landing tests and confirm they pass**

Run: `bunx vitest run src/features/landing`. Expected: PASS. `FaqSection.test.tsx` must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(landing): FaqList shared by home and content pages; closing section takes page copy" -- src/features/landing/components/FaqList.tsx src/features/landing/components/FaqList.test.tsx src/features/landing/components/home/FaqSection.tsx src/features/landing/components/home/FirstNotebookCta.tsx src/features/landing/components/home/FirstNotebookCta.test.tsx
```

---

### Task 3: Content fields (`cardBlurb`, `h1Accent`) and the tool icon map

**Files:**
- Modify: `features/landing/intentLandingPages.ts`, `clusterHubPages.ts`, `seoContentPages.ts`, `competitorComparePages.ts`
- Create: `features/landing/intentTools.ts`
- Test: `features/landing/intentLandingPages.test.ts`, `features/landing/seoContentPages.test.ts` (extend), `features/landing/intentTools.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

`intentLandingPages.test.ts`, add:

```ts
it("gives every tool page a short card blurb", () => {
  for (const page of INTENT_LANDING_PAGES) {
    expect(page.cardBlurb.length, page.path).toBeGreaterThan(0);
    expect(page.cardBlurb.length, page.path).toBeLessThanOrEqual(60);
  }
});

it("only accents a phrase that is in the h1", () => {
  for (const page of [...INTENT_LANDING_PAGES, ...CLUSTER_HUB_PAGES]) {
    if (page.h1Accent) expect(page.h1, page.path).toContain(page.h1Accent);
  }
});
```

`seoContentPages.test.ts`: the same accent test over `SEO_CONTENT_PAGES`.

`intentTools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { INTENT_LANDING_PAGES } from "./intentLandingPages";
import { getIntentTool } from "./intentTools";

describe("intentTools", () => {
  it("has an icon and tone for every tool page", () => {
    for (const page of INTENT_LANDING_PAGES) {
      expect(getIntentTool(page.intentKey), page.intentKey).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

- [ ] **Step 3: Add the fields and the values**

Types:
- `IntentLandingPageConfig` gains `cardBlurb: string; h1Accent?: string`.
- `ClusterHubPageConfig` and `SeoContentPageConfig` gain `h1Accent?: string`.

Values:

| intentKey | cardBlurb | h1Accent |
| --- | --- | --- |
| sourceUpload | PDFs, slides, audio, YouTube, Drive or pasted text. | in one place |
| sourceDiscovery | Find web and news articles to add beside your uploads. | for your notebook |
| notebookSharing | Give classmates a link to view or fork your notebook. | or study groups |
| flashcards | Spaced repetition from your own PDF. | from your PDF |
| quiz | Multiple choice that explains every answer. | from your study materials |
| audio | A spoken recap of your sources to play anywhere. | on the go |
| mindmap | See how the ideas in a chapter connect. | from your sources |
| reports | Study guides and briefings with clear sections. | from your materials |
| infographic | A one-page visual summary of a process or topic. | your study content |
| writtenQuestions | Short answers and essays with graded feedback. | on your answers |
| spreadsheets | Pull figures from several sources into one table. | from your sources |
| academicDiscovery | Search OpenAlex, Semantic Scholar, arXiv and more. | for your research notebook |
| paperImport | Bring papers in by DOI, BibTeX or reference manager. | and reference managers |
| citationStyles | APA, MLA, Chicago and nine more, formatted for you. | for your research output |
| literatureReview | Search, screen and synthesize a set of papers. | for your paper set |
| chat | Ask your papers questions; every answer is cited. | across your notebook |
| deepResearch | A multi-step report from the web and your sources. | and your sources |

Hubs:
- `/students`: `your course materials`
- `/research`: `for your papers`

SEO content pages:

| Page | h1Accent |
| --- | --- |
| How to Study From PDFs With AI | `With AI` |
| AI literature review guide | `with your papers` |
| compare hub | `other AI research and study tools` |
| NotebookLM | `now Gemini Notebook` |
| Elicit | `which fits your literature review?` |
| Consensus | `evidence search or research notebook?` |
| ChatPDF | `and what comes after` |
| SciSpace | `research assistant or research notebook?` |
| Humata | `document Q&A for teams or for study?` |
| STORM | `who writes the research report?` |
| Quizlet | `built on your own notes` |
| Perplexity | `web answers or a notebook of your sources?` |

If an h1 in the file differs from what this table assumes, pick the trailing phrase after the colon (or the
last 2–5 words) so the test passes. Don't edit the h1.

`intentTools.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import {
  AudioLines, BookOpen, CircleHelp, FileInput, FileText, GitFork, Globe, GraduationCap,
  Image as ImageIcon, Layers, MessageCircle, MessageSquareText, Quote, Share2, Table2, Telescope, Upload,
} from "lucide-react";
import type { Tone } from "./components/home/tone";

export interface IntentTool {
  icon: LucideIcon;
  tone: Tone;
}

/** The icon and Studio tone each tool page shows on cards and in its scene (same as the home Studio tiles). */
const INTENT_TOOLS: Record<string, IntentTool> = {
  sourceUpload: { icon: Upload, tone: "book" },
  sourceDiscovery: { icon: Globe, tone: "web" },
  notebookSharing: { icon: Share2, tone: "share" },
  flashcards: { icon: Layers, tone: "flashcard" },
  quiz: { icon: CircleHelp, tone: "quiz" },
  audio: { icon: AudioLines, tone: "audio" },
  mindmap: { icon: GitFork, tone: "mindmap" },
  reports: { icon: FileText, tone: "report" },
  infographic: { icon: ImageIcon, tone: "infographic" },
  writtenQuestions: { icon: MessageSquareText, tone: "written" },
  spreadsheets: { icon: Table2, tone: "spreadsheet" },
  academicDiscovery: { icon: GraduationCap, tone: "book" },
  paperImport: { icon: FileInput, tone: "pdf" },
  citationStyles: { icon: Quote, tone: "literature" },
  literatureReview: { icon: BookOpen, tone: "literature" },
  chat: { icon: MessageCircle, tone: "chat" },
  deepResearch: { icon: Telescope, tone: "research" },
};

export function getIntentTool(intentKey: string): IntentTool | undefined {
  return INTENT_TOOLS[intentKey];
}
```

Cross-check each icon against `STUDIO_TILES` in `components/home/landingHomeContent.ts`. Where a tile exists
for the same tool, use the tile's icon.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bunx vitest run src/features/landing src/shared/seo`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): card blurbs, headline accents and tool icons for the content pages" -- src/features/landing/intentLandingPages.ts src/features/landing/clusterHubPages.ts src/features/landing/seoContentPages.ts src/features/landing/competitorComparePages.ts src/features/landing/intentTools.ts src/features/landing/intentTools.test.ts src/features/landing/intentLandingPages.test.ts src/features/landing/seoContentPages.test.ts
```

---

### Task 4: The frame and the shared pieces

**Files (all create, under `features/landing/components/content/`):**
- `MarketingPage.tsx`, `PageHero.tsx`, `Breadcrumbs.tsx`, `accentHeading.tsx`, `LinkCard.tsx`, `CheckRow.tsx`, `ContentFaq.tsx`, `Stage.tsx`
- Tests: `accentHeading.test.tsx`, `PageHero.test.tsx`, `MarketingPage.test.tsx`, `LinkCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

`accentHeading.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccentHeading } from "./accentHeading";

describe("AccentHeading", () => {
  it("wraps the accent phrase in <em> and keeps the full text", () => {
    render(<h1><AccentHeading text="Make AI flashcards from your PDF in minutes" accent="from your PDF" /></h1>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Make AI flashcards from your PDF in minutes");
    expect(screen.getByText("from your PDF").tagName).toBe("EM");
  });

  it("renders plain text when the accent is missing or not found", () => {
    render(<h1><AccentHeading text="Plain" accent="nope" /></h1>);
    expect(screen.getByRole("heading", { level: 1 }).querySelector("em")).toBeNull();
  });
});
```

`PageHero.test.tsx`:
- With `breadcrumbs`: there's a `navigation` named "Breadcrumb"; the last item is `aria-current="page"` and
  not a link; earlier items are links.
- With `eyebrow`: the eyebrow text renders and there's no breadcrumb nav.
- `cta` renders a button that calls `onClick`, and the fine print "Free plan, no card" is present.
- Without `cta`: no button.

`MarketingPage.test.tsx` mocks `useAuth`, `SEOMeta` and `platformDetection` like `LandingPage.test.tsx`.
Mock `AuthModal` to render `isOpen ? <div role="dialog" aria-label="Sign up" /> : null`. Check:
- the `.auth-form-light` wrapper, `main`, the footer (`contentinfo`) and the closing section (`#cta-title`)
  render;
- clicking the render-prop's signup trigger opens the mocked dialog;
- with `isNativeShell` true it redirects. Render inside `<Routes>` with a `/sign-in` route showing "signin",
  and expect that text.

`LinkCard.test.tsx`: the whole card is one link with the given `href`; title and description are inside it;
the icon is `aria-hidden`.

- [ ] **Step 2: Run them and confirm they fail**

- [ ] **Step 3: Implement**

`accentHeading.tsx`:

```tsx
import { Accent } from "../home/SectionHeading";

/** Renders `text` with `accent` (a substring of it) in the landing accent style. */
export function AccentHeading({ text, accent }: { text: string; accent?: string }) {
  const at = accent ? text.indexOf(accent) : -1;
  if (!accent || at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Accent>{accent}</Accent>
      {text.slice(at + accent.length)}
    </>
  );
}
```

`Breadcrumbs.tsx`:
- `nav aria-label="Breadcrumb"` > `ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-sans text-sm text-muted-foreground"`.
- Each `li` is `inline-flex items-center gap-2`.
- Separator: `<ChevronRight aria-hidden className="size-3.5 text-border" />` before every item but the first.
- Earlier items are `<Link className="transition-colors hover:text-foreground">`.
- The last item is `<span aria-current="page" className="font-medium text-foreground">`.
- Props: `items: { name: string; path: string }[]`.

`PageHero.tsx`:

```tsx
interface PageHeroProps {
  eyebrow?: string;
  breadcrumbs?: { name: string; path: string }[];
  title: string;
  titleAccent?: string;
  lede: string;
  cta?: { label: string; onClick: () => void };
}
```

- `section className="relative overflow-hidden px-6 pt-32 pb-12 lg:pt-36"` with the
  `<div aria-hidden className="landing-paper pointer-events-none absolute inset-0" />` layer, as in
  `HeroSection`.
- Inner: `relative mx-auto flex max-w-4xl flex-col items-center gap-6 text-center`.
- Eyebrow `p` uses the same classes as `SectionHeading`'s eyebrow.
- `h1 className="font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl"`
  containing `<AccentHeading text={title} accent={titleAccent} />`.
- Lede `p className="max-w-2xl font-serif text-lg leading-relaxed text-foreground/75"`.
- When `cta` is set: a flex row (`flex flex-col items-center gap-4 sm:flex-row`) with
  `<Button size="lg" onClick={cta.onClick}>{cta.label}<ArrowRight aria-hidden /></Button>` and the fine print
  ("Free plan, no card" with the green `Check`, markup copied from `HeroSection`'s `FINE_PRINT` list).

`Stage.tsx`:

```tsx
/** The soft muted panel the home beats put product pictures on. Layout classes come from the caller. */
export function Stage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-3xl bg-muted/40 p-5 ring-1 ring-hairline ring-inset sm:p-8 lg:p-10", className)}>
      {children}
    </div>
  );
}
```

`LinkCard.tsx`:

```tsx
interface LinkCardProps {
  to: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  tone?: Tone;
}
```

- Renders `<Card variant="interactive" className="h-full">` containing `<Link to={to}
  className="flex h-full flex-col gap-3 p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">`.
- Inside the link:
  - The optional icon: `<span aria-hidden className={toneIcon({ tone, className: "size-9 rounded-xl" })}><Icon className="size-4.5" /></span>`.
  - The title as `<h3 className="font-sans text-base font-semibold">`.
  - The description: `<p className="flex-1 font-sans text-sm leading-relaxed text-muted-foreground">`.
  - "Learn more" + `ArrowRight` in `font-sans text-sm font-semibold text-primary`.
- If `focus-visible:ring-*` on a `Link` inside a `Card` trips design lint, check how `interactive` cards
  elsewhere put the ring on the inner element (`grep -rn 'variant="interactive"' src`) and copy that.

`CheckRow.tsx`:
- `ul className="grid grid-cols-1 gap-4 font-sans text-sm sm:grid-cols-2 lg:grid-cols-4"`.
- Each item is `li className="flex items-start gap-2.5 leading-relaxed"` with
  `<Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />`.
- Props: `items: string[]`, `columns?: 2 | 4` through a small `cva` (2 → `lg:grid-cols-2`).

`ContentFaq.tsx`:
- Props: `faqs`, `title?: ReactNode` (default `<>Questions, <Accent>answered.</Accent></>`), `id`.
- `section aria-labelledby={id} className="px-6 py-16 md:py-24"`.
- Grid copied from home `FaqSection`: `mx-auto grid max-w-280 grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-20`.
- Left: `SectionHeading align="start" eyebrow="FAQ"` in `lg:col-span-4`.
- Right: `<Reveal className="lg:col-span-8"><FaqList faqs={faqs} defaultOpenIndex={0} /></Reveal>`.

`MarketingPage.tsx`:

```tsx
interface MarketingPageProps {
  closing?: { body?: string; ctaLabel?: string };
  children: (openSignup: () => void) => ReactNode;
}

export function MarketingPage({ closing, children }: MarketingPageProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (isNativeShell()) {
    if (isLoading) return <div className="auth-form-light min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const openSignup = () => setAuthModalOpen(true);
  return (
    <>
      {/* Pinned light, like the home page: the marketing pages don't follow the app theme. */}
      <div className="auth-form-light min-h-screen bg-background font-serif text-foreground antialiased">
        <LandingNav onGetStarted={openSignup} onLogin={openSignup} />
        <main>
          {children(openSignup)}
          <FirstNotebookCta onGetStarted={openSignup} body={closing?.body} ctaLabel={closing?.ctaLabel} />
        </main>
        <Footer />
      </div>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={() => navigate("/home", { replace: true })}
      />
    </>
  );
}
```

Check that `Footer` renders a `<footer>`, which gives the `contentinfo` role (it does today).

- [ ] **Step 4: Run the tests and confirm they pass**, then `bun run lint:design` from the repo root. Expected: no new findings in `components/content/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): content-page frame, hero, breadcrumbs, link cards and FAQ block" -- src/features/landing/components/content
```

---

### Task 5: Tool-page scenes (source → output)

**Files:**
- Create: `features/landing/components/content/OutputCard.tsx`, `features/landing/components/content/SourceToOutput.tsx`, `features/landing/intentScenes.tsx`
- Test: `features/landing/intentScenes.test.tsx`, `features/landing/components/content/SourceToOutput.test.tsx`

- [ ] **Step 1: Write the failing tests**

`intentScenes.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { INTENT_LANDING_PAGES } from "./intentLandingPages";
import { getIntentScene } from "./intentScenes";

describe("intentScenes", () => {
  it("has a scene with 1-3 sources for every tool page", () => {
    for (const page of INTENT_LANDING_PAGES) {
      const scene = getIntentScene(page.intentKey);
      expect(scene, page.intentKey).toBeDefined();
      expect(scene?.sources.length).toBeGreaterThanOrEqual(1);
      expect(scene?.sources.length).toBeLessThanOrEqual(3);
    }
  });
});
```

`SourceToOutput.test.tsx`: render the flashcards page's scene. Check:
- both captions (`sourceToOutput.source` and `.output`) are in the document, outside any `aria-hidden`
  element (assert `caption.closest("[aria-hidden]")` is null);
- the pictures' wrappers have `aria-hidden="true"` and the `inert` attribute.

- [ ] **Step 2: Run them and confirm they fail**

- [ ] **Step 3: Implement**

`OutputCard.tsx` is decorative. Build it from `DemoSurface` (floating) and `DemoLabel` (from
`components/home/demo/DemoSurface`), like the home demos.

```tsx
interface OutputCardProps {
  intentKey: string;     // for the icon and tone via getIntentTool
  title: string;
  meta: string;
  rows: string[];
  shape?: "list" | "waveform" | "columns";
  className?: string;
}
```

- Header: tone icon (`toneIcon`, `size-8 rounded-lg`), then the title (`font-display text-sm font-bold`) and
  the meta (`DemoLabel`).
- `list`: rows as `font-serif text-sm` lines, each in a `rounded-lg bg-muted/60 px-3 py-2` box.
- `waveform`: a row of 28 bars, with heights from a fixed array in the file (no randomness, so renders stay
  stable). Use a `cva` or a fixed set of `h-*` classes (`h-2` … `h-8`), never inline styles. Each bar is
  `w-1 rounded-full bg-primary/70`; bars after index 17 use `bg-primary/25`. Rows appear under the waveform as
  a caption.
- `columns`: each row is split on `" · "` into a 3-column `grid grid-cols-3`. The first row is the header
  (`DemoLabel` style); the rest are `font-sans text-xs`.

`SourceToOutput.tsx`:
- Props `{ intentKey: string; caption: { source: string; output: string } }`. Looks up the scene and
  returns `null` if none.
- Layout inside `<Stage>`:
  `grid grid-cols-1 items-center gap-8 md:grid-cols-12`.
  - Source column `md:col-span-5`: a label row ("Your source" with `FileText`, as a `DemoLabel`-style `p`,
    not hidden), then a picture `div aria-hidden inert className="relative flex flex-col gap-3"`. Each source
    is a `DemoSurface` (flat) row: tone icon, name (`font-sans text-sm font-semibold`), meta
    (`text-xs text-muted-foreground`). Odd ones get `-rotate-1`, even ones `rotate-1 md:ml-6`. Last comes the
    caption `p className="font-serif text-sm text-foreground/70"` with `caption.source`.
  - Arrow `md:col-span-2 flex justify-center`: a `span aria-hidden` circle (`grid size-11 place-items-center
    rounded-full bg-card shadow-md ring-1 ring-hairline text-primary`) holding
    `<ArrowDown className="md:hidden" /><ArrowRight className="max-md:hidden" />`.
  - Output column `md:col-span-5`: label row ("What you get", `Sparkles`), the output picture inside
    `aria-hidden inert`, then the caption with `caption.output`.

`intentScenes.tsx`:

```tsx
interface SceneSource { name: string; meta: string; icon: LucideIcon; tone: Tone }
type SceneOutput =
  | { kind: "demo"; render: (className: string) => ReactNode }
  | { kind: "card"; title: string; meta: string; rows: string[]; shape?: "list" | "waveform" | "columns" };
export interface IntentScene { sources: SceneSource[]; output: SceneOutput }
export function getIntentScene(intentKey: string): IntentScene | undefined
```

Scene data. Icons come from lucide; tones from `tone.ts`. Demo outputs render with `className="w-full"`.

| intentKey | sources (name · meta · icon · tone) | output |
| --- | --- | --- |
| sourceUpload | Lecture 3 · Cell signalling.pdf · 18 pages · FileText · pdf; Week 3 recap · YouTube · 14 min · Youtube · video | card "Week 3 · Cell biology" / "2 sources ready" / rows: Chat with your sources; Make flashcards; Generate a quiz |
| sourceDiscovery | Search: climate policy · News · last 30 days · Search · web | card "Imported articles" / "20 found" / rows: Carbon pricing in the EU; City heat-resilience targets; Emissions trading prices |
| notebookSharing | BIO 201 · Midterm · 6 sources · 3 outputs · BookOpen · share | card "Share link" / "Anyone with the link" / rows: View · read and study; Fork · make their own copy |
| flashcards | Ch. 10 · Beta blockers.pdf · 32 pages · FileText · pdf; Lecture 12 slides · 48 slides · Presentation · book | demo `FlashcardDemo` |
| quiz | Unit 4 notes · 12 pages · FileText · book; Textbook § 10.3 · Pharmacology · BookOpen · book | demo `QuizDemo` |
| audio | Sleep and memory · Article · Globe · web; Spaced practice · Article · Globe · web; Class notes · 6 pages · FileText · book | card "Audio overview" / "8 min · two voices" / waveform / rows: Why sleep helps memory stick |
| mindmap | Ch. 6 · Cell signalling.pdf · 40 pages · FileText · pdf | card "Cell signalling" / "Mind map · 18 ideas" / rows: Receptors; Second messengers; Kinase cascades; Switching the signal off |
| reports | Reading 1 · Supply shocks.pdf · 14 pages · FileText · pdf; Reading 2 · Monetary policy.pdf · 22 pages · FileText · pdf | card "Study guide · Unit 3" / "Report · 6 sections" / rows: 1. Key terms; 2. How supply shocks spread; 3. What central banks can do; 4. Likely exam questions |
| infographic | Lecture 5 · Photosynthesis.pdf · 20 pages · FileText · pdf; Lecture 6 · Calvin cycle.pdf · 16 pages · FileText · pdf | card "Photosynthesis in four steps" / "Infographic · 1 page" / rows: Light is absorbed; Water is split; ATP and NADPH are made; Carbon is fixed |
| writtenQuestions | Treaty of Versailles · Primary source · ScrollText · book; Wilson's Fourteen Points · Primary source · ScrollText · book | card "Essay prompt · 2 of 5" / rows: Explain why the Treaty of Versailles fuelled German resentment.; Feedback · 4 / 5: strong on reparations; add the war guilt clause. (see note) |
| spreadsheets | Case A · Retailer.pdf · FileText · pdf; Case B · Airline.pdf · FileText · pdf; Case C · Telecom.pdf · FileText · pdf | card "Case comparison" / "Spreadsheet · 3 rows" / columns / rows: Case · Revenue · Margin; Retailer · $4.2B · 6%; Airline · $9.8B · 3%; Telecom · $6.1B · 18% |
| academicDiscovery | Search: transformers in biology · OpenAlex · Semantic Scholar · Search · research | card "Papers found" / "Sorted by citations" / rows: Transformer models for protein structure · 2023; Attention-based gene expression prediction · 2024; Language models for single-cell data · 2025 |
| paperImport | thesis-project.bib · Zotero export · 24 entries · FileInput · pdf | card "Imported papers" / "24 papers · metadata attached" / rows: DOI, authors and year filled in; Abstracts attached; Ready to read and cite |
| citationStyles | 12 imported articles · Notebook papers · BookOpen · literature | card "References · APA 7" / "Bibliography" / rows: Nguyen, L. (2024). Sleep and memory consolidation. Journal of Cognitive Science, 12(3), 45–61.; Okafor, C., & Lind, M. (2023). Spaced practice in undergraduate biology. Learning Research, 8(1), 3–19. |
| literatureReview | 24 papers · Beta blockers in asthma · BookOpen · literature | demo `LiteratureTableDemo` |
| chat | Ch. 10 · Beta blockers.pdf · 32 pages · FileText · pdf; Lecture 12 slides · 48 slides · Presentation · book; Asthma guideline.pdf · 60 pages · FileText · pdf | demo `AnswerDemo` |
| deepResearch | Question: are beta blockers safe in asthma? · 10 notebook papers · Telescope · research | card "Research report" / "Web + notebook sources" / rows: 1. Background; 2. What the trials show; 3. Where sources disagree; Sources · 10 notebook · 14 web |

Note on `writtenQuestions`: it uses a `card`, not `WrittenQuestionDemo`. That demo is about pharmacology,
and this page's caption is "Primary sources for a history unit", so the picture has to match the caption. Use
the same reasoning for any other demo whose topic doesn't match its caption. The meta line for this card is
"Written questions".

- [ ] **Step 4: Run the tests and confirm they pass**, then `bun run lint:design`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): source-to-output scenes for every tool page" -- src/features/landing/intentScenes.tsx src/features/landing/intentScenes.test.tsx src/features/landing/components/content/OutputCard.tsx src/features/landing/components/content/SourceToOutput.tsx src/features/landing/components/content/SourceToOutput.test.tsx
```

---

### Task 6: Tool page (IntentLandingPage)

**Files:**
- Rewrite: `features/landing/IntentLandingPage.tsx`
- Test: `features/landing/IntentLandingPage.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Use the mocks from `LandingPage.test.tsx`, plus the `AuthModal` mock from Task 4. Render
`/students/ai-flashcards` inside `MemoryRouter`. Check:
- exactly one h1, whose text equals the page's `h1`;
- a Breadcrumb nav with links Home and Students, and the current item Flashcards;
- both `sourceToOutput` captions;
- every `proofBullets` item;
- every FAQ answer in the DOM;
- "Related tools" link cards pointing to the `getRelatedIntentPages(page)` paths;
- clicking the hero's "Create free account" opens the dialog;
- for `/students/ai-quizzes` (which has `heroCrossLink`), a link to `heroCrossLink.path`;
- an unknown path renders `<Navigate to="/">`. Use `Routes` with a `/` route that shows "home" and expect
  that text.

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**

```tsx
export function IntentLandingPage({ pagePath }: { pagePath: string }) {
  const page = getIntentLandingPageByPath(pagePath);
  if (!page) return <Navigate to="/" replace />;
  const related = getRelatedIntentPages(page);
  return (
    <>
      <SEOMeta pagePath={page.path} title={page.title} description={page.description} keywords={page.keywords} />
      <MarketingPage closing={{ body: page.conversionPromise, ctaLabel: page.ctaLabel }}>
        {(openSignup) => (
          <>
            <PageHero
              breadcrumbs={getIntentBreadcrumbItems(page)}
              title={page.h1}
              titleAccent={page.h1Accent}
              lede={page.subheadline}
              cta={{ label: page.ctaLabel, onClick: openSignup }}
            />
            <section aria-label="How it works" className="px-6">
              <div className="mx-auto max-w-280">
                <Reveal>
                  <SourceToOutput intentKey={page.intentKey} caption={page.sourceToOutput} />
                </Reveal>
                <div className="mt-10 md:mt-12">
                  <CheckRow items={page.proofBullets} />
                </div>
                {page.heroCrossLink ? <CrossLinkCard link={page.heroCrossLink} /> : null}
              </div>
            </section>
            {page.faqs.length > 0 ? <ContentFaq id="tool-faq-title" faqs={page.faqs} /> : null}
            {related.length > 0 ? <RelatedTools pages={related} cluster={page.cluster} /> : null}
          </>
        )}
      </MarketingPage>
    </>
  );
}
```

- `CrossLinkCard` (local): a `Card variant="flush"` holding a padded `div` (`mt-10 max-w-xl p-5 md:p-6`,
  centred with `mx-auto`) with the label (`font-sans text-sm font-semibold`), the description (`font-serif
  text-base text-foreground/75`) and a `Link` "Written questions with feedback →". The link text is the
  current hardcoded string: keep it, or better, use `heroCrossLink.label`.
- `RelatedTools` (local):
  - `section aria-labelledby="related-title" className="px-6 pb-8"`.
  - `SectionHeading id="related-title" eyebrow="Related tools"` with title "Explore other `<Accent>`study
    tools`</Accent>`" (or "research tools", by `cluster`).
  - A grid `mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` of
    `<LinkCard to={p.path} title={p.navLabel} description={p.cardBlurb} {...getIntentTool(p.intentKey)} />`.
- Keep the section order from the spec: hero → stage → checks → cross-link → FAQ → related → closing (added by
  the frame).

- [ ] **Step 4: Run the tests and confirm they pass**: `bunx vitest run src/features/landing src/shared/seo`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): tool pages on the design system" -- src/features/landing/IntentLandingPage.tsx src/features/landing/IntentLandingPage.test.tsx
```

---

### Task 7: Hubs (ClusterHubLandingPage)

**Files:**
- Rewrite: `features/landing/ClusterHubLandingPage.tsx`
- Test: `features/landing/ClusterHubLandingPage.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Render `/students`. Check:
- one h1, plus the eyebrow "For students" and no breadcrumb nav;
- one numbered group heading per section ("1 · Bring your materials in"), each with a tool count;
- a link card for every `resolveHubSectionPages` page, showing its `navLabel` and `cardBlurb`;
- every `summaryBullets` item;
- a link card per `guideLinks` entry;
- FAQ answers in the DOM;
- the hero CTA opens the dialog.

Render `/research` too and expect the eyebrow "For researchers".

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**
- Hero: `eyebrow` "For students" / "For researchers", `title={page.h1}`, `titleAccent={page.h1Accent}`,
  `lede={page.subheadline}`, and a CTA.
- `section aria-labelledby="tools-title" className="px-6"`, with the `h2` "tools-title" visually hidden:
  `<h2 id="tools-title" className="sr-only">{cluster === "students" ? "Study tools" : "Research tools"}</h2>`.
- `<Stage className="mx-auto max-w-280">`. For each section with resolved pages:
  - `div` with heading row `flex items-baseline justify-between gap-4`:
    `<h3 className="font-display text-xl font-bold">{index + 1} · {section.title}</h3>` and
    `<p className="font-sans text-sm text-muted-foreground">{pages.length} tools</p>`;
  - then `section.description` as `font-serif text-base text-foreground/70 mt-2`;
  - then the grid.
  - Grid classes go through a `cva` keyed on page count: `grid grid-cols-1 gap-3 mt-5 sm:grid-cols-2`, plus
    `lg:grid-cols-3` when there are 3 or fewer pages and `lg:grid-cols-4` when there are more.
  - Gap between sections: `mt-10` on every section after the first.
- Below the stage: `mx-auto mt-12 max-w-280` holding `<CheckRow items={page.summaryBullets} columns={2} />`.
- Guides: `section aria-labelledby="guides-title" className="px-6 pt-20"` with a `SectionHeading`
  (eyebrow "Keep reading", title "Guides and `<Accent>`comparisons`</Accent>`", sub from the current copy),
  then a `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` of `LinkCard`s with no icon.
- `ContentFaq`, then the closing section from the frame.

- [ ] **Step 4: Run the tests and confirm they pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): student and research hubs on the design system" -- src/features/landing/ClusterHubLandingPage.tsx src/features/landing/ClusterHubLandingPage.test.tsx
```

---

### Task 8: Table highlight variant, and the comparison and guide pages (SeoContentPage)

**Files:**
- Modify: `shared/components/ui/table.tsx`, `dev/DesignGallery.tsx`
- Rewrite: `features/landing/SeoContentPage.tsx`
- Test: `shared/components/ui/ui.smoke.test.tsx` (extend), `features/landing/SeoContentPage.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Smoke test: `<TableCell highlight>` and `<TableHead highlight>` get `data-highlight="true"`.

`SeoContentPage.test.tsx`:
- `/compare/solomindlm-vs-elicit`:
  - one h1 and a breadcrumb trail Home › Compare › SolomindLM vs Elicit;
  - two quick-answer cards, the first containing `quickAnswer.chooseCompetitor` and the second
    `quickAnswer.chooseSolomindlm` plus a "Create free account" button that opens the dialog;
  - no hero button (the only sign-up buttons are in the quick answer and the closing section);
  - a `table` whose row headers (`rowheader` role) equal the `comparisonTable` topics, with the SolomindLM
    column cells marked `data-highlight="true"`;
  - the "details checked" sources line with one link per source;
  - every section `h2`;
  - FAQ answers in the DOM;
  - the related links.
- `/guides/how-to-study-from-pdfs-with-ai`: no table, no quick answer, a hero button, and the section h2s.
- `/compare` (hub): renders, with no table.

- [ ] **Step 2: Run them and confirm they fail**

- [ ] **Step 3: Implement**

`table.tsx`:
- Add `highlight: { true: "bg-primary/5", false: "" }` to `tableCellVariants`.
- Add a `tableHeadVariants` cva with `highlight: { true: "bg-primary/8 text-primary", false: "" }`. `TableHead`
  has `bg-muted` by default, so the true variant must replace it. Use `cn` ordering, and check the result in
  the gallery.
- Set `data-highlight={highlight ? "true" : undefined}` on both elements.
- Document it in a one-line comment: "highlight: the column the page is about (e.g. ours in a comparison)."

`DesignGallery.tsx`: in the Tables section, give one column `highlight`.

`SeoContentPage.tsx`:
- Hero:
  - `breadcrumbs={getSeoContentBreadcrumbItems(page)}`, `title`, `titleAccent`, `lede={page.intro}`.
  - `cta` only when there's no `quickAnswer`.
  - `SEOMeta` keeps `ogType="article"`.
- Quick answer (when `page.quickAnswer`):
  - `section aria-labelledby="quick-answer-title" className="px-6"` holding
    `<Stage className="mx-auto max-w-280">`.
  - Inside the stage: a centred label `h2 id="quick-answer-title"` styled like a `DemoLabel` ("Quick
    answer", with the `Scale` icon), then `grid grid-cols-1 gap-4 md:grid-cols-2 mt-6`.
  - Card 1 (only if `chooseCompetitor`): `Card variant="flush"` > `div p-6 md:p-7`, holding an `h3`
    "Choose {competitorName} if…" (`font-display text-lg font-bold`) and the text (`font-serif text-base
    leading-relaxed text-foreground/80 mt-3`).
  - Card 2: `Card variant="featured"` > `div p-6 md:p-7`, holding an `h3` "Choose SolomindLM if…" in
    `text-primary`, the text, and `<Button className="mt-5" onClick={openSignup}>{page.ctaLabel}<ArrowRight aria-hidden /></Button>`.
  - With no competitor card, card 2 spans both columns (`md:col-span-2`); use a `cva` or two static strings.
- Table (when `page.comparisonTable`):
  - `section aria-labelledby="table-title" className="px-6 pt-16"` > `mx-auto max-w-280`.
  - `h2 id="table-title"` "Side by side" in `font-display text-3xl font-bold tracking-tight`.
  - `Card variant="flush" className="mt-6"` > `Table className="min-w-160"` with:
    - `TableHeader`: `TableHead` "Topic", `TableHead highlight` "SolomindLM", `TableHead` `{competitorName}`;
    - `TableBody`: per row, `<TableHead scope="row">` (or `TableCell` rendered as `th` if `TableHead` only
      fits headers; check the primitive), `TableCell highlight` for ours, `TableCell` for theirs.
  - Then `SeoContentSources` (keep the current logic and date formatting) as
    `p className="mt-3 font-sans text-xs leading-relaxed text-muted-foreground"`, with links using
    `underline underline-offset-2 hover:text-foreground`.
- Article: `section className="px-6 pt-16"` > `mx-auto max-w-170`, sections spaced with `space-y-14`. Each
  is an `article`:
  - `h2` in `font-display text-3xl font-bold tracking-tight`;
  - paragraphs in `mt-5 font-serif text-lg leading-relaxed text-foreground/80`;
  - bullets as `ul mt-5 grid gap-3`, each `li` `flex gap-3 font-serif text-lg leading-relaxed` with a
    `span aria-hidden className="mt-3 size-1.5 shrink-0 rounded-full bg-primary"` dot.
- `ContentFaq`.
- Related: same shape as the hub's guides block (eyebrow "Keep reading", title "Related `<Accent>`pages`</Accent>`").

- [ ] **Step 4: Run the tests and confirm they pass.** Then run `bun run lint:design` and the design snapshot
  update for the table change (Docker, run in the background, from the worktree root; the URL comes from the
  main checkout's `.env.local`, the first entry of `git worktree list`):
  `export $(grep -E '^VITE_CONVEX_URL=' "$(git worktree list --porcelain | head -1 | cut -d' ' -f2)/apps/web/.env.local" | xargs) && bun run test:design:update`.
  Keep only the snapshot files that actually changed because of the Tables section. Restore any others with
  `git checkout -- <file>`; the 390px images are known to be flaky.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): comparison and guide pages on the design system; table highlight column" -- src/shared/components/ui/table.tsx src/shared/components/ui/ui.smoke.test.tsx src/dev/DesignGallery.tsx src/features/landing/SeoContentPage.tsx src/features/landing/SeoContentPage.test.tsx e2e/design/__screenshots__
```

(Adjust the snapshot path to the files that actually changed.)

---

### Task 9: /faq (FaqPage)

**Files:**
- Rewrite: `features/landing/FaqPage.tsx`
- Test: `features/landing/FaqPage.test.tsx` (create)

- [ ] **Step 1: Write the failing test**
- One h1 with the text "Frequently asked questions" and an `em` "questions", plus the eyebrow "Help center".
- A `navigation` "FAQ topics" with one link per category to `#{category.id}`.
- Each category title as an h2 inside an element with `id={category.id}`.
- Every answer in the DOM, and the learn-more links.
- No hero button. The closing section's button opens the dialog.

- [ ] **Step 2: Run it and confirm it fails**

- [ ] **Step 3: Implement**
- `MarketingPage` with `closing={{ body: "Create a free account, upload your first sources, and generate study or research outputs in minutes.", ctaLabel: "Create free account" }}`.
- The hero is custom: `PageHero` takes a string title, and this page needs a hardcoded accent. Either:
  - add an optional `titleNode?: ReactNode` prop to `PageHero` and pass
    `<>Frequently asked <Accent>questions</Accent></>`; or
  - pass `title="Frequently asked questions" titleAccent="questions"`, which already works. **Use this one.**
- Topic chips: `nav aria-label="FAQ topics"` holding
  `ul className="flex flex-wrap justify-center gap-2"`, each item a
  `<Button asChild variant="outline" size="sm"><a href={`#${category.id}`}>{category.title}</a></Button>`.
  Place it inside the hero section's flow, right after `PageHero`, in its own `div className="px-6 pt-2"`.
- Categories:
  - `section className="px-6 pt-12"`, then one block per category:
    `div id={category.id} className="mx-auto grid max-w-280 scroll-mt-24 grid-cols-1 gap-8 py-10 lg:grid-cols-12 lg:gap-20"`.
  - Left `lg:col-span-4`: `h2` in `font-display text-2xl font-bold` and the description in `mt-3 font-serif
    text-base text-foreground/70`.
  - Right `lg:col-span-8`: `<FaqList faqs={category.faqs} />`, all rows closed.

- [ ] **Step 4: Run the tests and confirm they pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(landing): /faq on the design system" -- src/features/landing/FaqPage.tsx src/features/landing/FaqPage.test.tsx
```

---

### Task 10: Lint ratchet, cleanup, gates

**Files:** `apps/web/eslint.config.mjs`, `apps/web/design-lint-baseline.json`, `apps/web/src/index.css`

- [ ] **Step 1:** In `eslint.config.mjs`, add `"src/features/landing/*.tsx"` to `MIGRATED`. It covers the
  four templates and `LandingPage.tsx`; remove the now-redundant `LandingPage.tsx` entry.
  `components/**/*.tsx` already covers `components/content/`.
- [ ] **Step 2:** Delete `.landing-grid-pattern` and `.dark .landing-grid-pattern` from `index.css`. Check that
  `grep -rn "landing-grid-pattern" src` returns nothing.
- [ ] **Step 3:** From the repo root, run `bun run lint:design`. Fix every finding in the landing files; don't
  baseline them. Then run `bun run lint:design:update` and confirm the `features/landing` entry is gone from
  `design-lint-baseline.json`.
- [ ] **Step 4:** Run the gates from the repo root, one at a time:
  - `bun run typecheck:web`
  - `bun run lint`
  - `bun run test:web`
  - `bunx knip` (the CI command lives in `package.json`; use that script if one exists)

  Expected: all pass, and Knip reports nothing new. If `getIntentBreadcrumbItems`, `IntentBreadcrumbItem` or
  other exports went unused, make them module-private or delete them.
- [ ] **Step 5: Commit**

```bash
git commit -m "chore(design-lint): landing content pages join MIGRATED (landing 25 → 0)" -- apps/web/eslint.config.mjs apps/web/design-lint-baseline.json apps/web/src/index.css
```

(run from the repo root, or adjust the paths)

---

### Task 11: Visual and end-to-end verification

- [ ] **Step 1:** Start the dev server with `preview_start` config **landing** (port 5180; it serves
  `.worktrees/landing/apps/web`). Signed out, open these pages:
  - `/students/ai-flashcards`
  - `/students/ai-audio-overview`
  - `/research/ai-literature-review`
  - `/students`
  - `/compare/solomindlm-vs-elicit`
  - `/guides/how-to-study-from-pdfs-with-ai`
  - `/faq`

  For each, check the console for errors and take screenshots at 1440×900 and 390×844, using a Playwright
  script in the worktree root (`shot-tmp.mjs`, deleted after use). Look for:
  - horizontal page scroll on phones; only the table may scroll, inside its card;
  - the stage stacking with a downward arrow;
  - card grids at 1, 2 and 4 columns;
  - the nav: "Features" leads to `/#features` and the home page scrolls there;
  - the breadcrumbs wrapping.
- [ ] **Step 2:** Run the smoke e2e against :5180, using a temporary config without `globalSetup`
  (`testDir ./e2e/smoke`, baseURL `http://localhost:5180`). Expected: all pass. Delete the temporary config.
- [ ] **Step 3:** Run Lighthouse (accessibility and SEO) on production builds of the flashcards, Elicit and
  /faq pages. Expected: 100 / 100. Note mobile performance next to the home page's numbers.
- [ ] **Step 4:** Commit any fixes, each with its own pathspec.
