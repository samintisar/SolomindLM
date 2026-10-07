# Landing Home Page (PR 1 of #263) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the marketing home page (`/`) to the approved design (B3 hero, "show, then list" story, "Your first notebook" close) on the shadcn primitives and tokens, so `LandingPage.tsx` and `features/landing/components/**` join `MIGRATED` at 0 design-lint findings.

**Architecture:**
- The page is composed in `LandingPage.tsx` from focused section components in `features/landing/components/home/`. Content (sources, Studio tools, audiences, plans, nav items) lives in typed constants in `home/landingHomeContent.ts`; colour per tool/source is a `cva` in `home/tone.ts` so every class string stays static.
- All product pictures (the hero notebook, citation cards, flashcard, quiz, written question, literature table, PRISMA, new-notebook card) are **decorative static markup** in `home/demo/`, built from plain elements and a feature-local `DemoSurface`. They are `aria-hidden`, have no handlers and import nothing from Studio. The hero notebook is built at app size and shrunk with `scale-76`, so its type stays on the Tailwind scale.
- Real controls use the primitives: `Button`, `Tabs` (audiences and the Annual/Monthly switch), `Card` + `Collapsible` (FAQ), `Sheet` (phone menu), `Badge`. Two new variants: `Card variant="featured"` (Pro plan) and `Badge variant="success"` ("Save 50%").
- The page root carries `.auth-form-light` (light pin, like sign-in). Sections fade up once with a small `Reveal` wrapper (IntersectionObserver + Tailwind transitions, off under reduced motion). The Studio marquee stays on `react-fast-marquee` (#231).

**Tech Stack:** React 19.2, React Router 7, Tailwind v4.3 (`mask-x-from-*`, numeric spacing scale), shadcn/ui on Radix (`Tabs`, `Collapsible`, `Sheet`, `Card`, `Badge`, `Button`), `react-fast-marquee`, `motion/react` (`useReducedMotion` hook only), lucide-react, Vitest + Testing Library + user-event.

**Spec:** `docs/superpowers/specs/2026-10-07-landing-home-design.md`. **Mockup** (look and copy source of truth): `docs/superpowers/specs/2026-10-07-landing-home-mockup.html` — open it in a browser.

**Working directory:** worktree `.worktrees/landing` (`C:\Users\samin\Documents\GitHub\SolomindLM\.claude\worktrees\premium-ui-shadcn-linter-74efdb\.worktrees\landing`), branch `feature/landing-home`, created from `origin/main` at `6edda874`; `bun install` already done.
- **One web test file:** `bun run test <path>`, run from `apps/web`.
- **Design lint for files:** `bunx eslint --max-warnings 0 <files>`, run from `apps/web`. Until Task 8 the landing files are not in `MIGRATED`, so findings show as warnings; **0 problems is the target for every file you touch**.
- **Typecheck:** `bun run typecheck:web`, run from the repo root.
- **Editing:** use Edit/Write (Serena is bound to the main checkout) and confirm with `git status`. The edit hook runs Biome per file; if it reports formatting, run `bunx biome format --write <files>`.
- **Commits:** other agents may share this worktree. **Always commit with an explicit pathspec**: `git commit -m "…" -- <paths>`. Never a bare `git commit`. Retry on `index.lock`.
- **Never kill processes by name**, only by PID. **No browser tools and no Docker** in Tasks 1–8; the controller does visuals in Task 9.

**Design-lint rules** (`docs/design/principles.md`):
- On **primitives** (`@/shared/components/ui/*`) only layout classes are allowed: margin, width/height, display, position/inset, z, flex/grid placement (`flex-1`, `col-span-*`, `justify-*`, `items-*`, `self-*`, `order-*`), overflow. **Padding, gap, space-*, colour, radius, shadow, font and text classes count as restyling.** Need different spacing inside a `Card`? Use `variant="flush"` (no padding) and put the padding on a plain inner `div`.
- **Plain elements** (`div`, `p`, `span`, `h*`, `table`, `a`) and the feature-local `DemoSurface` may carry any token classes.
- No arbitrary values (`[...]`) — use the numeric scale: `max-w-280` (1120px), `w-215` (860px), `h-122`, `top-75`, `scale-76`, `opacity-55`, `bg-studio-audio/12`, fractions like `w-4/5`. No palette colours, no `dark:`, no `shadow-[…]`, no `bg-black/…`/`bg-white/…`, no `border-2`, no `style` except custom properties.
- Class strings must be static: conditionals pick between whole literals (`cond ? "a b" : "c d"`), per-item colours go through a `cva` (`toneIcon({ tone })`), never `` `text-${x}` ``.
- Fonts: headings `font-display`; reading text `font-serif` (Lora); controls, labels and numbers `font-sans`.

---

## Contracts that must keep working

| What | Where | Detail |
|---|---|---|
| `LandingPage` props `{ onGetStarted: () => void }` | `App.tsx:413` | unchanged; native-shell redirect block at the top unchanged (only its placeholder `bg-[#FDFBF7]` becomes `auth-form-light bg-background`) |
| Smoke e2e | `e2e/smoke/smoke.spec.ts` | buttons named "Get Started", "Features", "Pricing" visible at desktop width; **exactly one** button whose name contains "get started" (case-insensitive substring); clicking it leads to `/home` or `/sign-in` |
| `Footer` | `IntentLandingPage`, `ClusterHubLandingPage`, `SeoContentPage`, `FaqPage` | same export and no props |
| Section ids | footer links `/#features`, `/#pricing` | How it works keeps `id="features"`; pricing `id="pricing"`; also `use-cases`, `faq` |
| `LANDING_FAQS` | FAQ structured data, prerender | the home FAQ renders **all** of them, in order |
| `.landing-grid-pattern` (index.css) | content templates | keep until PR 2 |

## File map

Create (all under `apps/web/src/features/landing/components/home/`):

| File | Responsibility |
|---|---|
| `tone.ts` | `toneIcon` and `notebookCover` cva variants; `Tone`, `CoverTone` types |
| `landingHomeContent.ts` | `NAV_ITEMS`, `SOURCE_TYPES`, `STUDIO_TILES`, `AUDIENCES`, `PLANS`, `Billing` |
| `scrollToSection.ts` (+ test) | smooth scroll to a section id |
| `Reveal.tsx` (+ test) | fade/lift-in wrapper |
| `SectionHeading.tsx` | eyebrow + h2 (+ sub), and `Accent` (italic brand-coloured phrase) |
| `demo/DemoSurface.tsx` | decorative card surface (`flat` / `floating`) and `DemoLabel` |
| `demo/CitationDemo.tsx` | `CitationChip`, `CitationTooltip`, `AnswerDemo`, `SourceSlideDemo` |
| `demo/StudyDemo.tsx` | `FlashcardDemo`, `QuizDemo`, `DueTodayDemo`, `WrittenQuestionDemo` |
| `demo/ResearchDemo.tsx` | `LiteratureTableDemo`, `PrismaDemo` |
| `demo/NewNotebookDemo.tsx` | the closing section's new-notebook card stack |
| `demo/PreviewWindow.tsx` | the notebook window (header, Sources, Chat with tooltip, Studio); exports `ChatColumn` |
| `NotebookPreview.tsx` (+ test) | hero picture: full window (md+) or chat-only (phone) + written-question callout |
| `LandingNav.tsx` (+ test) | fixed nav, phone `Sheet` menu |
| `HeroSection.tsx` (+ test) | B3 copy, buttons, fine print, preview |
| `SourceStrip.tsx` | "Bring what you already have" strip |
| `Beat.tsx` | one "how it works" row (text + visual, optional flip) |
| `HowItWorks.tsx` (+ test) | section heading + three beats with their visuals |
| `StudioMarquee.tsx` (+ test) | Studio band with two marquee rows |
| `AudienceTabs.tsx` (+ test) | "Who it's for" tabs |
| `PricingSection.tsx` (+ test) | billing switch + Free/Pro cards |
| `FaqSection.tsx` (+ test) | FAQ two-column with disclosure rows |
| `FirstNotebookCta.tsx` (+ test) | closing section |

Modify: `shared/components/ui/card.tsx`, `shared/components/ui/badge.tsx`, `dev/DesignGallery.tsx`, `index.css`, `features/landing/LandingPage.tsx`, `features/landing/components/Footer.tsx`, `shared/seo/publicSeoPrerenderHtml.ts`, `eslint.config.mjs`, `design-lint-baseline.json`, possibly `features/landing/constants.ts` (Knip).

Delete: `features/landing/components/{ContentShowcase,FAQSection,FeaturesGrid,HeroSection,LandingHeroMockup,NavigationHeader,PricingSection,UseCasesSection}.tsx`.

**Order:** Task 1 → Task 2 → Task 3, then Tasks 4–7 in parallel (disjoint files), then Task 8, then Task 9 (controller).

---

### Task 1: `Card featured` and `Badge success` variants

**Files:**
- Modify: `apps/web/src/shared/components/ui/card.tsx` (the `cardVariants` `variant` map)
- Modify: `apps/web/src/shared/components/ui/badge.tsx` (the `badgeVariants` `variant` map)
- Modify: `apps/web/src/dev/DesignGallery.tsx` (`CardsSection`, `BadgesAndAlertsSection`)

- [ ] **Step 1: Add the Card variant.** In `cardVariants.variants.variant`, after `interactive`, add:

```ts
        // The one card a section wants picked (e.g. the Pro plan): floating shadow and a brand ring.
        // No padding or gap, like flush; the children own their spacing.
        featured: "gap-0 py-0 shadow-xl ring-2 ring-primary/35",
```

- [ ] **Step 2: Add the Badge variant.** In `badgeVariants.variants.variant`, after `secondary`, add:

```ts
        success: "bg-success-muted text-success-muted-foreground",
```

- [ ] **Step 3: Show them in the gallery.** In `CardsSection`, after the `interactive` card, add:

```tsx
        <Card variant="featured">
          <div className="flex flex-col gap-1 p-6">
            <span className="font-sans font-semibold">Featured card</span>
            <span className="text-sm text-muted-foreground">
              The one option a section recommends, like the Pro plan.
            </span>
          </div>
        </Card>
```

In `BadgesAndAlertsSection`, after `<Badge variant="secondary">Secondary</Badge>` add `<Badge variant="success">Success</Badge>`.

- [ ] **Step 4: Check.** From `apps/web`: `bunx eslint --max-warnings 0 src/shared/components/ui/card.tsx src/shared/components/ui/badge.tsx src/dev/DesignGallery.tsx` → 0 problems; `bun run test src/dev/DesignGallery.test.tsx src/shared/components/ui/ui.smoke.test.tsx` → PASS. From the root: `bun run typecheck:web` → no errors.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/shared/components/ui/card.tsx apps/web/src/shared/components/ui/badge.tsx apps/web/src/dev/DesignGallery.tsx
git commit -m "feat(ui): featured Card and success Badge variants (#263)" -- apps/web/src/shared/components/ui/card.tsx apps/web/src/shared/components/ui/badge.tsx apps/web/src/dev/DesignGallery.tsx
```

(The design snapshots for Cards and Badges are refreshed by the controller in Task 9.)

---

### Task 2: Foundations — tones, content, scroll, reveal, headings, paper

**Files:**
- Create: `home/tone.ts`, `home/landingHomeContent.ts`, `home/scrollToSection.ts`, `home/scrollToSection.test.ts`, `home/Reveal.tsx`, `home/Reveal.test.tsx`, `home/SectionHeading.tsx`
- Modify: `apps/web/src/index.css` (next to `.landing-grid-pattern`)

(`home/` = `apps/web/src/features/landing/components/home/`.)

- [ ] **Step 1: Write the failing tests.**

`home/scrollToSection.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToSection } from "./scrollToSection";

describe("scrollToSection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("smoothly scrolls the matching section to the top", () => {
    const section = document.createElement("section");
    section.id = "pricing";
    const scroll = vi.fn();
    section.scrollIntoView = scroll;
    document.body.append(section);

    scrollToSection("pricing");

    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does nothing when the section is not on the page", () => {
    expect(() => scrollToSection("missing")).not.toThrow();
  });
});
```

`home/Reveal.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./Reveal";

describe("Reveal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows its content at once when IntersectionObserver is missing", () => {
    render(<Reveal>Hello</Reveal>);
    expect(screen.getByText("Hello")).toHaveAttribute("data-shown", "true");
  });

  it("stays hidden until the content scrolls into view, then stays shown", () => {
    let fire: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe = vi.fn();
        disconnect = disconnect;
      }
    );

    render(<Reveal>Hello</Reveal>);
    const el = screen.getByText("Hello");
    expect(el).toHaveAttribute("data-shown", "false");

    act(() => fire([{ isIntersecting: true }]));

    expect(el).toHaveAttribute("data-shown", "true");
    expect(disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to see them fail.** From `apps/web`: `bun run test src/features/landing/components/home` → FAIL (modules not found).

- [ ] **Step 3: Implement.**

`home/scrollToSection.ts`:

```ts
/** Smoothly scrolls the page so the element with `id` sits at the top. No-op when it isn't rendered. */
export function scrollToSection(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
```

(Reduced motion: `html { scroll-behavior }` is not involved; browsers honour `prefers-reduced-motion` for smooth `scrollIntoView` themselves.)

`home/Reveal.tsx`:

```tsx
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fades and lifts its content in the first time it scrolls into view. Without IntersectionObserver
 * (tests, very old browsers) it renders shown; under reduced motion it never moves or fades.
 * Never wrap the hero: content above the fold must not wait for an observer (LCP).
 */
export function Reveal({ children, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const el = ref.current;
    if (shown || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      data-shown={shown}
      className={cn(
        "transition duration-700 ease-out motion-reduce:transition-none",
        shown
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className
      )}
    >
      {children}
    </div>
  );
}
```

`home/tone.ts`:

```ts
import { cva, type VariantProps } from "class-variance-authority";

/** A tinted icon square. Size and radius come from the call site (`toneIcon({ tone, className })`). */
export const toneIcon = cva("grid shrink-0 place-items-center", {
  variants: {
    tone: {
      chat: "bg-info-muted text-info",
      research: "bg-studio-mindmap/12 text-studio-mindmap",
      literature: "bg-studio-literature/12 text-studio-literature",
      audio: "bg-studio-audio/12 text-studio-audio",
      mindmap: "bg-studio-mindmap/12 text-studio-mindmap",
      report: "bg-studio-report/12 text-studio-report",
      flashcard: "bg-studio-flashcard/12 text-studio-flashcard",
      quiz: "bg-studio-quiz/12 text-studio-quiz",
      infographic: "bg-studio-infographic/12 text-studio-infographic",
      written: "bg-studio-written/12 text-studio-written",
      spreadsheet: "bg-studio-spreadsheet/12 text-studio-spreadsheet",
      share: "bg-primary/10 text-primary",
      pdf: "bg-destructive-muted text-destructive",
      video: "bg-destructive-muted text-destructive",
      web: "bg-success-muted text-success",
      book: "bg-info-muted text-info",
      audioFile: "bg-warning-muted text-warning-muted-foreground",
    },
  },
});

export type Tone = NonNullable<VariantProps<typeof toneIcon>["tone"]>;

/** Notebook cover colours for the sample notebooks (semantic tones, not persisted cover swatches). */
export const notebookCover = cva("", {
  variants: {
    cover: {
      info: "bg-info-muted text-info",
      destructive: "bg-destructive-muted text-destructive",
      success: "bg-success-muted text-success",
      warning: "bg-warning-muted text-warning-muted-foreground",
    },
  },
});

export type CoverTone = NonNullable<VariantProps<typeof notebookCover>["cover"]>;
```

`home/landingHomeContent.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  BookOpen,
  Briefcase,
  CircleHelp,
  FileText,
  GitFork,
  Globe,
  GraduationCap,
  HardDrive,
  HeartPulse,
  Image as ImageIcon,
  Layers,
  MessageCircle,
  MessageSquareText,
  Microscope,
  Presentation,
  ScanLine,
  Share2,
  Table2,
  Telescope,
  Youtube,
} from "lucide-react";
import type { CoverTone, Tone } from "./tone";

/** Nav anchors. `target` is a section id on the home page. */
export const NAV_ITEMS = [
  { label: "Features", target: "features" },
  { label: "Use cases", target: "use-cases" },
  { label: "Pricing", target: "pricing" },
  { label: "FAQ", target: "faq" },
] as const;

export interface SourceType {
  label: string;
  icon: LucideIcon;
}

export const SOURCE_TYPES: SourceType[] = [
  { label: "PDFs", icon: FileText },
  { label: "Slides & docs", icon: Presentation },
  { label: "YouTube", icon: Youtube },
  { label: "Web pages", icon: Globe },
  { label: "Audio", icon: AudioLines },
  { label: "Scans", icon: ScanLine },
  { label: "Research papers", icon: GraduationCap },
  { label: "Google Drive", icon: HardDrive },
];

export interface StudioTile {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
}

/** Twelve tiles; the marquee shows the first six on row one and the rest on row two. */
export const STUDIO_TILES: StudioTile[] = [
  { title: "Chat", description: "Ask questions using your notebook sources", icon: MessageCircle, tone: "chat" },
  { title: "Deep research", description: "Multi-step research with web and notebook sources", icon: Telescope, tone: "research" },
  { title: "Literature review", description: "Screen papers and draft synthesis reports", icon: BookOpen, tone: "literature" },
  { title: "Audio overview", description: "Audio recaps from your study material", icon: AudioLines, tone: "audio" },
  { title: "Mind map", description: "Visual maps of concepts from your sources", icon: GitFork, tone: "mindmap" },
  { title: "Reports", description: "Study guides and report drafts on demand", icon: FileText, tone: "report" },
  { title: "Flashcards", description: "Spaced-repetition decks from your material", icon: Layers, tone: "flashcard" },
  { title: "Quiz", description: "Multiple-choice practice that explains answers", icon: CircleHelp, tone: "quiz" },
  { title: "Infographic", description: "Visual infographics from your sources", icon: ImageIcon, tone: "infographic" },
  { title: "Written questions", description: "Written prompts with answer feedback", icon: MessageSquareText, tone: "written" },
  { title: "Spreadsheets", description: "Structured tables extracted from sources", icon: Table2, tone: "spreadsheet" },
  { title: "Shared notebooks", description: "Cowork or fork a notebook via link", icon: Share2, tone: "share" },
];

export interface NotebookOutput {
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

export interface Audience {
  id: string;
  tab: string;
  heading: string;
  body: string;
  steps: [string, string, string];
  link: { label: string; to: string };
  notebook: {
    title: string;
    meta: string;
    icon: LucideIcon;
    cover: CoverTone;
    outputs: NotebookOutput[];
  };
}

export const AUDIENCES: Audience[] = [
  {
    id: "students",
    tab: "Students",
    heading: "Nine days. Fourteen lectures. One notebook.",
    body: "Put the whole module in one place, ask about the parts you don't get, and let it build your revision from your own slides.",
    steps: [
      "Upload the module: slides, readings, recordings",
      "Ask about anything that doesn't click",
      "Revise with flashcards and practice quizzes",
    ],
    link: { label: "SolomindLM for students", to: "/students" },
    notebook: {
      title: "ECON 101 · Midterm",
      meta: "14 sources · edited today",
      icon: BookOpen,
      cover: "info",
      outputs: [
        { label: "62 flashcards", icon: Layers, tone: "flashcard" },
        { label: "Practice quiz", icon: CircleHelp, tone: "quiz" },
        { label: "Mind map", icon: GitFork, tone: "mindmap" },
        { label: "Audio recap", icon: AudioLines, tone: "audio" },
      ],
    },
  },
  {
    id: "medical",
    tab: "Medical students",
    heading: "Too many facts to fake it.",
    body: "Turn dense lectures into flashcards that resurface before you forget, and written questions that check your reasoning, not just your recall.",
    steps: [
      "Add a week of lectures and the textbook chapter",
      "Generate a deck and review what's due each day",
      "Answer written questions, marked against the slides",
    ],
    link: { label: "Flashcards for medical students", to: "/students/ai-flashcards" },
    notebook: {
      title: "Pharmacology · Week 6",
      meta: "5 sources · edited 2h ago",
      icon: HeartPulse,
      cover: "destructive",
      outputs: [
        { label: "24 flashcards · 12 due", icon: Layers, tone: "flashcard" },
        { label: "Written questions", icon: MessageSquareText, tone: "written" },
        { label: "8-min recap", icon: AudioLines, tone: "audio" },
      ],
    },
  },
  {
    id: "researchers",
    tab: "Researchers",
    heading: "From 200 papers to the 12 that matter.",
    body: "Search and import papers, screen them with reasons you can audit later, and draft a synthesis in your citation style.",
    steps: [
      "Search, or import from DOI, BibTeX or Zotero",
      "Screen with include and exclude reasons",
      "Draft the review with a PRISMA flow",
    ],
    link: { label: "AI literature review", to: "/research/ai-literature-review" },
    notebook: {
      title: "Thesis · Chapter 2",
      meta: "48 papers · edited yesterday",
      icon: Microscope,
      cover: "success",
      outputs: [
        { label: "Literature table", icon: Table2, tone: "spreadsheet" },
        { label: "Review draft · APA 7", icon: FileText, tone: "report" },
        { label: "Deep research", icon: Telescope, tone: "research" },
      ],
    },
  },
  {
    id: "professionals",
    tab: "Professionals",
    heading: "Get the brief. Keep the receipts.",
    body: "Drop in industry reports and long documents, get a cited briefing, and check any claim against the page it came from.",
    steps: [
      "Add the reports, decks and links",
      "Ask for a briefing in the format you need",
      "Share the notebook with your team",
    ],
    link: { label: "Reports from your sources", to: "/students/ai-reports" },
    notebook: {
      title: "Q3 market scan",
      meta: "9 sources · shared with 3 people",
      icon: Briefcase,
      cover: "warning",
      outputs: [
        { label: "Briefing doc", icon: FileText, tone: "report" },
        { label: "Competitor table", icon: Table2, tone: "spreadsheet" },
        { label: "Infographic", icon: ImageIcon, tone: "infographic" },
      ],
    },
  },
];

export type Billing = "annual" | "monthly";

export interface Plan {
  id: "free" | "pro";
  name: string;
  description: string;
  price: Record<Billing, string>;
  period: Record<Billing, string>;
  features: string[];
  cta: string;
  featured: boolean;
}

/** Limits mirror today's plans (billing config); update both together. */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Everything you need to try it on a real course.",
    price: { annual: "$0", monthly: "$0" },
    period: { annual: "forever", monthly: "forever" },
    features: [
      "5 notebooks, 20 sources each",
      "10 chat messages a day",
      "2 flashcard decks, quizzes and reports a day",
      "2 audio recaps and infographics a day",
      "2 written-question sets a day",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For a full course load, or a thesis.",
    price: { annual: "$7.50", monthly: "$15" },
    period: { annual: "/ month, billed yearly", monthly: "/ month" },
    features: [
      "200 notebooks, 200 sources each",
      "500 chat messages a day",
      "100 flashcard decks, quizzes and reports a day",
      "100 audio recaps and infographics a day",
      "100 written-question sets a day",
    ],
    cta: "Get Pro",
    featured: true,
  },
];
```

`home/SectionHeading.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Reveal } from "./Reveal";

/** The italic, brand-coloured phrase every landing heading ends on. */
export function Accent({ children }: { children: ReactNode }) {
  return <em className="font-normal text-primary">{children}</em>;
}

interface SectionHeadingProps {
  /** id for the h2, so the section can be `aria-labelledby` it. */
  id: string;
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "start";
}

export function SectionHeading({ id, eyebrow, title, sub, align = "center" }: SectionHeadingProps) {
  return (
    <Reveal className={cn("flex flex-col gap-4", align === "center" && "items-center text-center")}>
      <p className="font-sans text-xs font-semibold tracking-widest text-primary uppercase">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="max-w-3xl font-display text-4xl leading-tight font-bold tracking-tight text-balance md:text-display"
      >
        {title}
      </h2>
      {sub ? (
        <p className="max-w-2xl font-serif text-lg leading-relaxed text-foreground/70">{sub}</p>
      ) : null}
    </Reveal>
  );
}
```

`index.css` — directly after the `.dark .landing-grid-pattern { … }` block, add:

```css
/* Landing hero: faint graph paper (the chat panel's grid) that fades out from the upper left.
   Put it on an absolutely positioned, aria-hidden layer: the mask would hide real content. */
.landing-paper {
  background-image:
    linear-gradient(to right, color-mix(in oklch, var(--border) 30%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in oklch, var(--border) 30%, transparent) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 70% 80% at 30% 20%, black, transparent 75%);
}
```

- [ ] **Step 4: Run the tests.** `bun run test src/features/landing/components/home` → PASS (4 tests). `bunx eslint --max-warnings 0 src/features/landing/components/home` → 0 problems. Root: `bun run typecheck:web` → clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/landing/components/home apps/web/src/index.css
git commit -m "feat(landing): home page foundations (content, tones, reveal, headings) (#263)" -- apps/web/src/features/landing/components/home apps/web/src/index.css
```

---

### Task 3: Decorative demos and the hero notebook preview

**Files:**
- Create: `home/demo/DemoSurface.tsx`, `home/demo/CitationDemo.tsx`, `home/demo/StudyDemo.tsx`, `home/demo/ResearchDemo.tsx`, `home/demo/NewNotebookDemo.tsx`, `home/demo/PreviewWindow.tsx`, `home/NotebookPreview.tsx`, `home/NotebookPreview.test.tsx`

Everything here is a picture: no state, no handlers, no imports from `features/studio`. Compare against the mockup's hero, "How it works" and closing sections as you go.

- [ ] **Step 1: Write the failing test** `home/NotebookPreview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotebookPreview } from "./NotebookPreview";

describe("NotebookPreview", () => {
  it("is hidden from assistive tech and can't take focus", () => {
    const { container } = render(<NotebookPreview />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).toHaveAttribute("inert");
    expect(root.querySelectorAll("button, a, input")).toHaveLength(0);
  });

  it("shows the notebook, the cited passage and the written-question feedback", () => {
    render(<NotebookPreview />);
    expect(screen.getAllByText("Pharmacology · Week 6").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("may precipitate bronchospasm in patients with asthma").length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("4 / 5").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail.** `bun run test src/features/landing/components/home/NotebookPreview.test.tsx` → FAIL.

- [ ] **Step 3: Implement the demos.**

`home/demo/DemoSurface.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Surface for the landing page's decorative product pictures (not a design-system component: real
 * UI uses Card). `flat` sits in flow; `floating` is a callout lifted off the page.
 */
const demoSurface = cva("rounded-2xl bg-card ring-1 ring-hairline", {
  variants: {
    elevation: {
      flat: "shadow-xs",
      floating: "shadow-xl",
    },
  },
  defaultVariants: { elevation: "flat" },
});

export function DemoSurface({
  className,
  elevation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof demoSurface>) {
  return <div className={cn(demoSurface({ elevation }), className)} {...props} />;
}

/** Small caps label inside a demo card ("FLASHCARD", "YOUR ANSWER"). */
export function DemoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}
```

`home/demo/CitationDemo.tsx`:

```tsx
import { ArrowUpRight, FileText } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { toneIcon } from "../tone";
import { DemoSurface } from "./DemoSurface";

export function CitationChip({
  n,
  active = false,
  className,
}: {
  n: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 align-middle font-sans text-xs leading-none font-bold",
        active ? "bg-primary text-primary-foreground ring-4 ring-primary/15" : "bg-muted text-primary",
        className
      )}
    >
      {n}
    </span>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-sm bg-warning/45 px-0.5 text-foreground">{children}</mark>;
}

/** Hover card for citation [1] in the hero chat: file, slide, quoted passage. */
export function CitationTooltip({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("w-60 p-3 font-sans", className)}>
      <span className="absolute -top-1.5 left-2.5 size-3 rotate-45 border-t border-l border-border/50 bg-card" />
      <div className="flex items-center gap-2 text-xs">
        <span className={toneIcon({ tone: "pdf", className: "size-5 rounded-md" })}>
          <FileText className="size-3" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">Lecture 12 – Beta blockers.pdf</span>
          <span className="block text-muted-foreground">Slide 14</span>
        </span>
        <CitationChip n={1} active className="ml-auto" />
      </div>
      <blockquote className="mt-2 font-serif text-xs leading-relaxed text-foreground/80">
        “Non-selective agents antagonise β<sub>2</sub> receptors in bronchial smooth muscle and{" "}
        <Highlight>may precipitate bronchospasm in patients with asthma</Highlight>.”
      </blockquote>
      <p className="mt-2 flex items-center gap-1 border-t border-border/50 pt-2 text-xs font-semibold text-primary">
        Open in source <ArrowUpRight className="size-3" />
      </p>
    </DemoSurface>
  );
}

/** "Read with it" beat: a short cited answer with citation 2 active. */
export function AnswerDemo({ className }: { className?: string }) {
  return (
    <DemoSurface className={cn("p-5", className)}>
      <p className="ml-10 rounded-2xl rounded-br-sm bg-muted px-3.5 py-2.5 font-serif text-sm">
        Why are beta blockers avoided in asthma?
      </p>
      <p className="mt-3.5 font-serif text-sm leading-relaxed">
        Non-selective beta blockers also block β<sub>2</sub> receptors in the airways. Blocking them
        can trigger bronchospasm <CitationChip n={1} />. Cardioselective drugs like bisoprolol carry
        less risk <CitationChip n={2} active />.
      </p>
    </DemoSurface>
  );
}

/** "Read with it" beat: the slide citation 2 points at, the cited line highlighted and pinned. */
export function SourceSlideDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-3 font-sans text-xs font-semibold">
        <span className={toneIcon({ tone: "pdf", className: "size-5.5 rounded-md" })}>
          <FileText className="size-3" />
        </span>
        Lecture 12 – Beta blockers.pdf
        <span className="ml-auto font-medium text-muted-foreground">Slide 15</span>
      </div>
      <div className="m-3.5 rounded-xl bg-background p-4 ring-1 ring-hairline ring-inset">
        <h4 className="font-display text-sm font-bold">β-blockers: choosing an agent</h4>
        <ul className="mt-2.5 list-disc space-y-1.5 pl-4 font-serif text-xs leading-relaxed text-foreground/80">
          <li>Non-selective: propranolol, nadolol, timolol</li>
          <li>
            <CitationChip n={2} active className="mr-1" />
            <Highlight>
              Cardioselective agents such as bisoprolol act mainly on β<sub>1</sub>, so they carry
              less risk in asthma
            </Highlight>
          </li>
          <li>Start low and review if wheeze worsens</li>
        </ul>
      </div>
      <p className="flex items-center gap-1 px-3.5 pb-3.5 font-sans text-xs font-semibold text-primary">
        Open in source <ArrowUpRight className="size-3" />
      </p>
    </DemoSurface>
  );
}
```

`home/demo/StudyDemo.tsx`:

```tsx
import { Check, FileText, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DemoLabel, DemoSurface } from "./DemoSurface";

const RATINGS = ["Again", "Hard", "Good"] as const;

export function FlashcardDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4.5", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Flashcard</DemoLabel>
        <DemoLabel>7 / 24</DemoLabel>
      </div>
      <p className="mt-3 font-display text-base leading-snug font-bold">
        Which receptor relaxes bronchial smooth muscle?
      </p>
      <p className="mt-3 rounded-xl bg-muted p-3 font-serif text-sm leading-relaxed">
        β<sub>2</sub>-adrenergic receptors, which is why β<sub>2</sub> agonists like salbutamol
        relieve asthma.
      </p>
      <div className="mt-3 grid grid-cols-4 gap-1.5 font-sans text-xs font-semibold">
        {RATINGS.map((rating) => (
          <span key={rating} className="rounded-lg bg-card py-1.5 text-center shadow-xs ring-1 ring-hairline">
            {rating}
          </span>
        ))}
        <span className="rounded-lg bg-primary py-1.5 text-center text-primary-foreground">Easy</span>
      </div>
    </DemoSurface>
  );
}

const QUIZ_OPTIONS = [
  { label: "Propranolol", correct: false },
  { label: "Bisoprolol", correct: true },
  { label: "Nadolol", correct: false },
] as const;

export function QuizDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Quiz · 4 of 15</DemoLabel>
        <span className="font-sans text-xs font-bold text-primary">3 / 3</span>
      </div>
      <p className="mt-2.5 font-display text-sm leading-snug font-bold">
        Which beta blocker is the safer choice in asthma?
      </p>
      <ul className="mt-2.5 space-y-1.5 font-serif text-xs">
        {QUIZ_OPTIONS.map((option) => (
          <li
            key={option.label}
            className={cn(
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 ring-1",
              option.correct
                ? "bg-success-muted font-semibold text-success-muted-foreground ring-success/40"
                : "ring-hairline"
            )}
          >
            {option.label}
            {option.correct ? <Check className="size-3.5" /> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 flex items-start gap-1.5 font-sans text-xs leading-snug text-muted-foreground">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-studio-report" />
        <span>
          Cardioselective: it mostly spares β<sub>2</sub> receptors in the airways.
        </span>
      </p>
    </DemoSurface>
  );
}

const DUE_BARS = ["h-3", "h-5", "h-4", "h-6", "h-5"] as const;

export function DueTodayDemo({ className }: { className?: string }) {
  return (
    <DemoSurface className={cn("p-4", className)}>
      <DemoLabel>Due today</DemoLabel>
      <p className="mt-1 font-display text-2xl font-bold">12 cards</p>
      <div className="mt-2 flex h-8 items-end gap-1">
        {DUE_BARS.map((height, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
          <span key={index} className={cn("flex-1 rounded-sm bg-primary/60", height)} />
        ))}
        <span className="h-8 flex-1 rounded-sm bg-primary" />
      </div>
    </DemoSurface>
  );
}

/** Used twice: the hero callout and the "Practise it" beat. */
export function WrittenQuestionDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-4", className)}>
      <div className="flex items-center justify-between">
        <DemoLabel>Written question · 2 of 5</DemoLabel>
        <span className="rounded-full bg-success-muted px-2 py-0.5 font-sans text-xs font-bold text-success-muted-foreground">
          4 / 5
        </span>
      </div>
      <p className="mt-2.5 font-display text-sm leading-snug font-bold">
        Explain why a non-selective beta blocker can be dangerous for a patient with asthma.
      </p>
      <div className="mt-3 rounded-xl bg-muted/50 p-2.5 ring-1 ring-hairline ring-inset">
        <DemoLabel>Your answer</DemoLabel>
        <p className="mt-1 font-serif text-xs leading-relaxed">
          It blocks β<sub>2</sub> receptors in the lungs, so the airways can't relax and the patient
          may go into bronchospasm.
        </p>
      </div>
      <div className="mt-2 rounded-xl bg-success-muted p-2.5 text-success-muted-foreground">
        <p className="flex items-center gap-1.5 font-sans text-xs font-semibold tracking-wider uppercase">
          <Sparkles className="size-3" />
          Feedback
        </p>
        <p className="mt-1 font-serif text-xs leading-relaxed">
          Right mechanism. For full marks, name a safer cardioselective option, such as bisoprolol.
        </p>
        <p className="mt-1.5 flex items-center gap-1 font-sans text-xs font-semibold">
          <FileText className="size-3" />
          Lecture 12, slide 15
        </p>
      </div>
    </DemoSurface>
  );
}
```

`home/demo/ResearchDemo.tsx` (titles are illustrative; no author names, so nothing reads as a real citation):

```tsx
import { Check, FlaskConical, Layers, Shuffle, X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { DemoLabel, DemoSurface } from "./DemoSurface";

const PAPERS = [
  { title: "Cardioselective β-blockers in reactive airway disease", type: "Meta-analysis", icon: Layers, included: true },
  { title: "Bisoprolol tolerance in mild asthma", type: "RCT", icon: Shuffle, included: true },
  { title: "Beta blockade and airway tone in dogs", type: "Animal study", icon: FlaskConical, included: false },
] as const;

export function LiteratureTableDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <p className="font-display text-sm font-bold">Beta blockers in asthma: review</p>
        <p className="font-sans text-xs text-muted-foreground">24 papers</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-sans text-xs">
          <thead>
            <tr className="bg-muted text-left text-muted-foreground">
              <th className="px-3.5 py-2 font-semibold">Paper</th>
              <th className="px-3.5 py-2 font-semibold">Study type</th>
              <th className="px-3.5 py-2 font-semibold">Decision</th>
            </tr>
          </thead>
          <tbody>
            {PAPERS.map((paper) => (
              <tr key={paper.title} className="border-b border-border/50 align-top last:border-b-0">
                <td className="px-3.5 py-2.5 font-serif text-xs leading-snug">{paper.title}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap text-foreground/75">
                  <span className="inline-flex items-center gap-1">
                    <paper.icon className="size-3.5 text-info" />
                    {paper.type}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  {paper.included ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2 py-0.5 font-semibold whitespace-nowrap text-success-muted-foreground">
                      <Check className="size-3" />
                      Included
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive-muted px-2 py-0.5 font-semibold whitespace-nowrap text-destructive-muted-foreground">
                        <X className="size-3" />
                        Excluded
                      </span>
                      <span className="mt-1 block text-muted-foreground">Not human subjects</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSurface>
  );
}

const PRISMA_STEPS = [
  { label: "Found", value: 214, className: "bg-info-muted" },
  { label: "Screened", value: 96, className: "bg-card ring-1 ring-hairline" },
  { label: "Included", value: 12, className: "bg-success-muted text-success-muted-foreground" },
] as const;

export function PrismaDemo({ className }: { className?: string }) {
  return (
    <DemoSurface elevation="floating" className={cn("p-3.5", className)}>
      <DemoLabel>PRISMA flow</DemoLabel>
      <ol className="mt-2.5 flex flex-col gap-1">
        {PRISMA_STEPS.map((step, index) => (
          <li key={step.label} className="flex flex-col items-stretch gap-1">
            {index > 0 ? <span className="text-center font-sans text-xs text-muted-foreground">↓</span> : null}
            <span className={cn("flex items-center justify-between rounded-lg px-2.5 py-2 font-sans text-xs font-medium", step.className)}>
              {step.label}
              <span className="font-display text-base font-bold">{step.value}</span>
            </span>
          </li>
        ))}
      </ol>
    </DemoSurface>
  );
}
```

`home/demo/NewNotebookDemo.tsx`:

```tsx
import { BookOpen, FileText, Plus, Youtube } from "lucide-react";
import { DemoSurface } from "./DemoSurface";

/** Closing section: the brand-new notebook the visitor is about to make, over two ghost cards. */
export function NewNotebookDemo() {
  return (
    <div aria-hidden className="relative mx-auto h-96 w-full max-w-90 lg:mx-0">
      <div className="absolute top-0 left-16 hidden h-75 w-82 rotate-6 rounded-3xl bg-card opacity-55 shadow-md ring-1 ring-hairline sm:block" />
      <div className="absolute top-3.5 left-10 hidden h-75 w-82 rotate-3 rounded-3xl bg-card opacity-80 shadow-md ring-1 ring-hairline sm:block" />
      <DemoSurface elevation="floating" className="absolute top-8 left-0 w-full overflow-hidden rounded-3xl sm:w-90">
        <div className="flex h-37 flex-col justify-between bg-primary p-5 text-primary-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-foreground/15">
            <BookOpen className="size-5" />
          </span>
          <span className="font-sans text-xs font-semibold tracking-widest uppercase opacity-80">
            New notebook
          </span>
        </div>
        <div className="p-5">
          <p className="flex items-center gap-1 font-display text-xl font-bold">
            Your course
            <span className="h-6 w-0.5 animate-pulse bg-primary" />
          </p>
          <p className="mt-1 font-sans text-xs text-muted-foreground">0 sources · start with one</p>
          <div className="mt-4 grid grid-cols-2 gap-2 font-sans text-xs text-muted-foreground">
            <span className="flex items-center gap-2 rounded-xl bg-muted/45 p-2.5 ring-1 ring-hairline ring-inset">
              <FileText className="size-3.5" />
              Lecture notes
            </span>
            <span className="flex items-center gap-2 rounded-xl bg-muted/45 p-2.5 ring-1 ring-hairline ring-inset">
              <Youtube className="size-3.5" />
              Recording
            </span>
            <span className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary p-2.5 font-semibold text-primary-foreground">
              <Plus className="size-3.5" />
              Add your first source
            </span>
          </div>
        </div>
      </DemoSurface>
    </div>
  );
}
```

`home/demo/PreviewWindow.tsx` (built at app size: 860 × 640 for the full window):

```tsx
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  GitFork,
  Globe,
  Layers,
  MessageCircle,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  Plus,
  Share2,
  Sparkles,
  Youtube,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { type Tone, toneIcon } from "../tone";
import { CitationChip, CitationTooltip } from "./CitationDemo";

interface Row {
  title: string;
  meta: string;
  icon: LucideIcon;
  tone: Tone;
}

const SOURCES: Row[] = [
  { title: "Lecture 12 – Beta blockers.pdf", meta: "PDF · 38 slides", icon: FileText, tone: "pdf" },
  { title: "Katzung, ch. 10", meta: "PDF · pp. 151–168", icon: BookOpen, tone: "book" },
  { title: "Dr. Patel – Autonomic pharm", meta: "YouTube · 52 min", icon: Youtube, tone: "video" },
  { title: "NICE asthma guideline", meta: "Web page", icon: Globe, tone: "web" },
  { title: "Tutorial recording", meta: "Audio · 41 min", icon: Mic, tone: "audioFile" },
];

const TOOLS: Array<{ label: string; icon: LucideIcon; tone: Tone }> = [
  { label: "Audio overview", icon: AudioLines, tone: "audio" },
  { label: "Mind map", icon: GitFork, tone: "mindmap" },
  { label: "Report", icon: FileText, tone: "report" },
  { label: "Flashcards", icon: Layers, tone: "flashcard" },
  { label: "Quiz", icon: CircleHelp, tone: "quiz" },
  { label: "Written questions", icon: MessageSquareText, tone: "written" },
];

const SAVED: Array<Row & { selected?: boolean }> = [
  { title: "Beta blockers", meta: "24 flashcards · due today", icon: Layers, tone: "flashcard" },
  { title: "Week 6 written questions", meta: "5 questions · 2 answered", icon: MessageSquareText, tone: "written", selected: true },
  { title: "Week 6 audio recap", meta: "8 min", icon: AudioLines, tone: "audio" },
];

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 font-sans text-xs font-bold tracking-wider uppercase">
      {children}
    </p>
  );
}

function RowTile({ row, trailing, selected = false }: { row: Row; trailing?: ReactNode; selected?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl bg-card p-2 ring-1",
        selected ? "shadow-md ring-primary/45" : "shadow-xs ring-hairline"
      )}
    >
      <span className={toneIcon({ tone: row.tone, className: "size-6 rounded-md" })}>
        <row.icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 font-sans text-xs">
        <span className="block truncate font-semibold">{row.title}</span>
        <span className="block truncate text-muted-foreground">{row.meta}</span>
      </span>
      {trailing}
    </div>
  );
}

function SourcesColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <PanelLabel>
        Sources
        <span className="rounded-full bg-muted px-1.5 tracking-normal text-muted-foreground">5</span>
        <PanelLeftClose className="ml-auto size-3.5 text-muted-foreground" />
      </PanelLabel>
      <div className="mb-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 font-sans text-xs font-semibold text-primary-foreground">
        <Plus className="size-3.5" />
        Add source
      </div>
      {SOURCES.map((source) => (
        <RowTile
          key={source.title}
          row={source}
          trailing={
            <span className="grid size-3.5 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Check className="size-2.5" />
            </span>
          }
        />
      ))}
    </div>
  );
}

/** The chat column with the citation tooltip open under [1]. Also the phone hero on its own. */
export function ChatColumn({ className }: { className?: string }) {
  return (
    <div className={cn("chat-panel-graph-grid flex flex-col p-4", className)}>
      <PanelLabel>
        <MessageCircle className="size-3.5" />
        Chat
      </PanelLabel>
      <p className="ml-auto w-4/5 rounded-2xl rounded-br-sm bg-card px-3.5 py-2.5 font-serif text-sm shadow-xs ring-1 ring-hairline">
        Why are beta blockers avoided in patients with asthma?
      </p>
      <div className="mt-4 space-y-2 font-serif text-sm leading-relaxed">
        <p>
          Non-selective beta blockers such as propranolol also block β<sub>2</sub> receptors in the
          airways, which relax bronchial smooth muscle. Blocking them{" "}
          <strong>can trigger bronchospasm</strong>{" "}
          <span className="relative">
            <CitationChip n={1} active />
            <CitationTooltip className="absolute top-full left-0 z-10 mt-2.5 max-md:-left-24" />
          </span>
          .
        </p>
        <p>
          Cardioselective agents like bisoprolol act mainly on β<sub>1</sub> receptors in the heart,
          so they carry less risk, but guidelines still advise caution <CitationChip n={2} />{" "}
          <CitationChip n={3} />.
        </p>
      </div>
      <div className="mt-auto rounded-2xl bg-card p-3 shadow-lg ring-1 ring-hairline">
        <p className="font-serif text-sm text-muted-foreground">Ask about your sources…</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 font-sans text-xs font-semibold shadow-xs ring-1 ring-hairline">
            <MessageCircle className="size-3" />
            Chat
            <ChevronDown className="size-3" />
          </span>
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ArrowUp className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function StudioColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col p-3", className)}>
      <PanelLabel>
        <Sparkles className="size-3.5" />
        Studio
      </PanelLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {TOOLS.map((tool) => (
          <div key={tool.label} className="rounded-xl bg-card p-2 font-sans text-xs font-medium shadow-xs ring-1 ring-hairline">
            <span className={toneIcon({ tone: tool.tone, className: "mb-1.5 size-5 rounded-md" })}>
              <tool.icon className="size-3" />
            </span>
            {tool.label}
          </div>
        ))}
      </div>
      <PanelLabel>
        <span className="mt-4">Saved</span>
      </PanelLabel>
      <div className="flex flex-col gap-1.5">
        {SAVED.map((item) => (
          <RowTile key={item.title} row={item} selected={item.selected} />
        ))}
      </div>
    </div>
  );
}

function PreviewHeader() {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-4">
      <div className="flex items-center gap-2.5 font-display text-sm font-bold">
        <img src="/SolomindLM_logo.png" alt="" className="size-5 object-contain" />
        <span className="h-4 w-px bg-border" />
        Pharmacology · Week 6
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 font-sans text-xs font-semibold shadow-xs ring-1 ring-hairline">
          <Share2 className="size-3" />
          Share
        </span>
        <span className="size-6 rounded-full bg-accent" />
      </div>
    </div>
  );
}

/** The notebook window at app size. Place it in an 860 × 640 box and scale it at the call site. */
export function PreviewWindow({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-hairline", className)}>
      <PreviewHeader />
      <div className="grid min-h-0 flex-1 grid-cols-12">
        <SourcesColumn className="col-span-3" />
        <ChatColumn className="col-span-6 border-x border-border/50" />
        <StudioColumn className="col-span-3" />
      </div>
    </div>
  );
}
```

`home/NotebookPreview.tsx`:

```tsx
import { ChatColumn, PreviewWindow } from "./demo/PreviewWindow";
import { WrittenQuestionDemo } from "./demo/StudyDemo";

/**
 * The hero picture. md and up: the whole notebook (built at 860 × 640, shown at 76%) with the
 * written-question callout over its lower right. Phones: just the chat column, callout below.
 * Decorative: hidden from assistive tech and inert.
 */
export function NotebookPreview() {
  return (
    <div aria-hidden inert className="relative mx-auto w-full max-w-164 lg:mx-0">
      <div className="flex flex-col items-center md:hidden">
        <div className="w-full overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-hairline">
          <ChatColumn className="h-112" />
        </div>
        <WrittenQuestionDemo className="relative -mt-10 w-11/12" />
      </div>
      <div className="relative hidden h-122 md:block">
        <div className="absolute top-0 left-0 h-160 w-215 origin-top-left scale-76">
          <PreviewWindow className="h-full" />
        </div>
        <WrittenQuestionDemo className="absolute top-75 -right-10 w-78" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run.** `bun run test src/features/landing/components/home/NotebookPreview.test.tsx` → PASS. `bunx eslint --max-warnings 0 src/features/landing/components/home` → 0 problems (fix any class the lint rejects with the nearest scale value; report what you changed). Root `bun run typecheck:web` → clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/landing/components/home/demo apps/web/src/features/landing/components/home/NotebookPreview.tsx apps/web/src/features/landing/components/home/NotebookPreview.test.tsx
git commit -m "feat(landing): decorative product demos and the hero notebook preview (#263)" -- apps/web/src/features/landing/components/home/demo apps/web/src/features/landing/components/home/NotebookPreview.tsx apps/web/src/features/landing/components/home/NotebookPreview.test.tsx
```

---

### Task 4: Nav, hero and source strip (parallel with 5–7)

**Files:**
- Create: `home/LandingNav.tsx`, `home/LandingNav.test.tsx`, `home/HeroSection.tsx`, `home/HeroSection.test.tsx`, `home/SourceStrip.tsx`

- [ ] **Step 1: Write the failing tests.**

`home/LandingNav.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingNav } from "./LandingNav";
import { scrollToSection } from "./scrollToSection";

vi.mock("./scrollToSection", () => ({ scrollToSection: vi.fn() }));

function renderNav() {
  const onGetStarted = vi.fn();
  const onLogin = vi.fn();
  render(
    <MemoryRouter>
      <LandingNav onGetStarted={onGetStarted} onLogin={onLogin} />
    </MemoryRouter>
  );
  return { onGetStarted, onLogin };
}

describe("LandingNav", () => {
  beforeEach(() => vi.mocked(scrollToSection).mockClear());

  it("has exactly one Get started button, and it starts sign-up", async () => {
    const { onGetStarted } = renderNav();
    const buttons = screen.getAllByRole("button", { name: /get started/i });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onGetStarted).toHaveBeenCalledOnce();
  });

  it("opens the log-in modal", async () => {
    const { onLogin } = renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it("scrolls to sections from the desktop links", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Features" }));
    await userEvent.click(screen.getByRole("button", { name: "Pricing" }));
    expect(scrollToSection).toHaveBeenNthCalledWith(1, "features");
    expect(scrollToSection).toHaveBeenNthCalledWith(2, "pricing");
  });

  it("opens the phone menu, and its links scroll and close it", async () => {
    renderNav();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("dialog");
    await userEvent.click(within(menu).getByRole("button", { name: "Use cases" }));
    expect(scrollToSection).toHaveBeenCalledWith("use-cases");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
```


`home/HeroSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HeroSection } from "./HeroSection";
import { scrollToSection } from "./scrollToSection";

vi.mock("./scrollToSection", () => ({ scrollToSection: vi.fn() }));

describe("HeroSection", () => {
  it("says the headline once, as the page's h1", () => {
    render(<HeroSection onGetStarted={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "AI that makes you think, not thinks for you."
    );
  });

  it("Start free starts sign-up and How it works scrolls to the features", async () => {
    const onGetStarted = vi.fn();
    render(<HeroSection onGetStarted={onGetStarted} />);
    await userEvent.click(screen.getByRole("button", { name: "Start free" }));
    await userEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(onGetStarted).toHaveBeenCalledOnce();
    expect(scrollToSection).toHaveBeenCalledWith("features");
  });
});
```

- [ ] **Step 2: Run them to see them fail.** `bun run test src/features/landing/components/home/LandingNav.test.tsx src/features/landing/components/home/HeroSection.test.tsx` → FAIL.

- [ ] **Step 3: Implement.**

`home/LandingNav.tsx`:

```tsx
import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/utils/cn";
import { NAV_ITEMS } from "./landingHomeContent";
import { scrollToSection } from "./scrollToSection";

interface LandingNavProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export function LandingNav({ onGetStarted, onLogin }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const go = (target: string) => {
    setMenuOpen(false);
    scrollToSection(target);
  };

  return (
    <header
      data-scrolled={scrolled}
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b font-sans transition-colors duration-300",
        scrolled ? "border-border/50 bg-background/85 backdrop-blur-md" : "border-transparent"
      )}
    >
      <div className="mx-auto flex h-18 max-w-300 items-center justify-between gap-4 px-6">
        <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
          <img src="/SolomindLM_logo.png" alt="" className="size-8 object-contain" />
          SolomindLM
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Button key={item.target} variant="ghost" size="sm" onClick={() => go(item.target)}>
              {item.label}
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden md:inline-flex" onClick={onLogin}>
            Log in
          </Button>
          <Button onClick={onGetStarted}>Get started</Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="auth-form-light">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {NAV_ITEMS.map((item) => (
                  <Button
                    key={item.target}
                    variant="ghost"
                    className="justify-start"
                    onClick={() => go(item.target)}
                  >
                    {item.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogin();
                  }}
                >
                  Log in
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
```

(The Sheet portals out of the page root, so it needs its own `auth-form-light` to stay light; the auth and Studio dialogs do the same.)

`home/HeroSection.tsx`:

```tsx
import { Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { NotebookPreview } from "./NotebookPreview";
import { Accent } from "./SectionHeading";
import { scrollToSection } from "./scrollToSection";

const FINE_PRINT = ["Free plan, no card", "Works with any course"] as const;

export function HeroSection({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="relative overflow-hidden px-6 pt-32 pb-20 lg:pt-36 lg:pb-28">
      <div aria-hidden className="landing-paper pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-300 items-start gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5 lg:pt-8">
          <h1 className="font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl xl:text-6xl">
            AI that makes you think, <Accent>not thinks for you.</Accent>
          </h1>
          <p className="mt-6 max-w-md font-serif text-lg leading-relaxed text-foreground/75">
            SolomindLM won't write your essay. It reads your sources with you, answers with
            citations, and quizzes you until it sticks — so what you know at the exam is actually
            yours.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={onGetStarted}>
              Start free
            </Button>
            <Button size="lg" variant="outline" onClick={() => scrollToSection("features")}>
              How it works
            </Button>
          </div>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-sans text-xs text-muted-foreground">
            {FINE_PRINT.map((line) => (
              <li key={line} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-3.5 text-success" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-7">
          <NotebookPreview />
        </div>
      </div>
    </section>
  );
}
```

Note the line break: the mockup shows "not thinks for you." on its own line at desktop widths; if it doesn't wrap there, give the `Accent` a `block` via a wrapping `<span className="block">` around it (plain span, not the `em`).

`home/SourceStrip.tsx`:

```tsx
import { SOURCE_TYPES } from "./landingHomeContent";
import { Reveal } from "./Reveal";

export function SourceStrip() {
  return (
    <section aria-label="Sources you can add" className="px-6 py-8">
      <Reveal className="mx-auto flex max-w-280 flex-col gap-5 border-y border-border/50 py-6 lg:flex-row lg:items-center lg:gap-9">
        <p className="font-serif text-base text-muted-foreground italic lg:shrink-0">
          Bring what you already have
        </p>
        <ul className="grid flex-1 grid-cols-4 gap-x-3 gap-y-4 lg:flex lg:justify-between">
          {SOURCE_TYPES.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className="flex flex-col items-center gap-1.5 text-center font-sans text-xs font-medium text-foreground/75 lg:flex-row lg:gap-2 lg:text-sm"
            >
              <Icon aria-hidden className="size-4.5 text-muted-foreground" />
              {label}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 4: Run.** Both tests PASS; `bunx eslint --max-warnings 0` on the five files → 0 problems; root `bun run typecheck:web` → clean.

- [ ] **Step 5: Commit** (pathspec only — other tasks share the worktree):

```bash
git add apps/web/src/features/landing/components/home/LandingNav.tsx apps/web/src/features/landing/components/home/LandingNav.test.tsx apps/web/src/features/landing/components/home/HeroSection.tsx apps/web/src/features/landing/components/home/HeroSection.test.tsx apps/web/src/features/landing/components/home/SourceStrip.tsx
git commit -m "feat(landing): nav, B3 hero and source strip (#263)" -- apps/web/src/features/landing/components/home/LandingNav.tsx apps/web/src/features/landing/components/home/LandingNav.test.tsx apps/web/src/features/landing/components/home/HeroSection.tsx apps/web/src/features/landing/components/home/HeroSection.test.tsx apps/web/src/features/landing/components/home/SourceStrip.tsx
```

---

### Task 5: How it works (parallel with 4, 6, 7)

**Files:**
- Create: `home/Beat.tsx`, `home/HowItWorks.tsx`, `home/HowItWorks.test.tsx`

- [ ] **Step 1: Write the failing test** `home/HowItWorks.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "./HowItWorks";

describe("HowItWorks", () => {
  it("is the #features section with the three beats in order", () => {
    const { container } = render(<HowItWorks />);
    expect(container.querySelector("section#features")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Read it. Practise it. Go deeper."
    );
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Every answer shows its working.",
      "Then it makes you prove you know it.",
      "When the slides aren't enough.",
    ]);
  });

  it("lists quizzes on their own line in Practise it", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Quizzes that explain every answer")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Implement.**

`home/Beat.tsx`:

```tsx
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { Reveal } from "./Reveal";

interface BeatProps {
  number: number;
  label: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  /** Visual on the left at lg and up. */
  flip?: boolean;
}

export function Beat({ number, label, title, body, points, visual, flip = false }: BeatProps) {
  return (
    <div className="grid items-center gap-12 py-12 md:py-16 lg:grid-cols-2 lg:gap-18">
      <Reveal className={cn(flip && "lg:order-2")}>
        <p className="flex items-center gap-2.5 font-sans text-sm font-semibold text-primary">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-xs text-primary-foreground">
            {number}
          </span>
          {label}
        </p>
        <h3 className="mt-4 font-display text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          {title}
        </h3>
        <p className="mt-4 font-serif text-lg leading-relaxed text-foreground/70">{body}</p>
        <ul className="mt-6 grid gap-2.5">
          {points.map((point) => (
            <li key={point} className="flex items-center gap-2.5 font-sans text-sm font-medium">
              <Check aria-hidden className="size-4 text-success" />
              {point}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className={cn(flip && "lg:order-1")}>{visual}</Reveal>
    </div>
  );
}
```

`home/HowItWorks.tsx` (desktop visuals are absolute compositions in a fixed box; below md they stack):

```tsx
import { Beat } from "./Beat";
import { AnswerDemo, SourceSlideDemo } from "./demo/CitationDemo";
import { LiteratureTableDemo, PrismaDemo } from "./demo/ResearchDemo";
import { DueTodayDemo, FlashcardDemo, QuizDemo, WrittenQuestionDemo } from "./demo/StudyDemo";
import { Accent, SectionHeading } from "./SectionHeading";

function ReadVisual() {
  return (
    <div aria-hidden className="relative flex flex-col gap-4 md:mx-auto md:block md:h-112 md:max-w-131">
      <AnswerDemo className="md:absolute md:top-0 md:left-0 md:w-80" />
      <SourceSlideDemo className="md:absolute md:top-49 md:right-0 md:w-75" />
    </div>
  );
}

function PractiseVisual() {
  return (
    <div aria-hidden className="relative flex flex-col gap-4 md:mx-auto md:block md:h-135 md:max-w-131">
      <FlashcardDemo className="md:absolute md:top-0 md:left-0 md:w-70 md:-rotate-2" />
      <QuizDemo className="md:absolute md:top-6 md:left-74 md:w-60 md:rotate-2" />
      <DueTodayDemo className="hidden md:absolute md:top-82 md:-left-4 md:block md:w-42 md:-rotate-4" />
      <WrittenQuestionDemo className="md:absolute md:top-72 md:left-32 md:w-90" />
    </div>
  );
}

function DeeperVisual() {
  return (
    <div aria-hidden className="relative flex flex-col gap-4 md:mx-auto md:block md:h-105 md:max-w-131">
      <LiteratureTableDemo className="md:absolute md:top-8 md:left-0 md:w-118" />
      <PrismaDemo className="md:absolute md:top-66 md:-right-6 md:w-48" />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="features" aria-labelledby="how-title" className="scroll-mt-20 px-6 pt-24 pb-8 md:pt-32">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="how-title"
          eyebrow="How it works"
          title={
            <>
              Read it. Practise it. <Accent>Go deeper.</Accent>
            </>
          }
          sub="One notebook per course or project. Every step stays tied to the sources you put in it."
        />
        <Beat
          number={1}
          label="Read with it"
          title="Every answer shows its working."
          body="Ask anything about your material. SolomindLM answers only from the sources in your notebook and cites each claim. Hover a number to see the passage; click it to open the page."
          points={[
            "Citations on every claim",
            "Chat, deep research or literature review",
            "Answers in the language you study in",
          ]}
          visual={<ReadVisual />}
        />
        <Beat
          flip
          number={2}
          label="Practise it"
          title="Then it makes you prove you know it."
          body="Turn a week of lectures into flashcards that come back just before you'd forget them, quizzes that explain every answer, and written questions marked against your own slides."
          points={[
            "Spaced-repetition flashcards",
            "Quizzes that explain every answer",
            "Written answers with feedback",
            "Mind maps and audio recaps",
          ]}
          visual={<PractiseVisual />}
        />
        <Beat
          number={3}
          label="Go deeper"
          title="When the slides aren't enough."
          body="Find and import papers, run deep research across the web and your notebook, or screen a stack of studies into a literature review with a PRISMA flow, in the citation style you need."
          points={[
            "Paper search, plus DOI, BibTeX and Zotero import",
            "Screening with a reason for every decision",
            "APA, MLA, Chicago, IEEE and more",
          ]}
          visual={<DeeperVisual />}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run** the test, eslint (0 problems), typecheck.

- [ ] **Step 5: Commit** with pathspec:

```bash
git add apps/web/src/features/landing/components/home/Beat.tsx apps/web/src/features/landing/components/home/HowItWorks.tsx apps/web/src/features/landing/components/home/HowItWorks.test.tsx
git commit -m "feat(landing): how it works, three beats with product moments (#263)" -- apps/web/src/features/landing/components/home/Beat.tsx apps/web/src/features/landing/components/home/HowItWorks.tsx apps/web/src/features/landing/components/home/HowItWorks.test.tsx
```

---

### Task 6: Studio marquee and audience tabs (parallel with 4, 5, 7)

**Files:**
- Create: `home/StudioMarquee.tsx`, `home/StudioMarquee.test.tsx`, `home/AudienceTabs.tsx`, `home/AudienceTabs.test.tsx`

- [ ] **Step 1: Write the failing tests.**

`home/StudioMarquee.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STUDIO_TILES } from "./landingHomeContent";
import { StudioMarquee } from "./StudioMarquee";

describe("StudioMarquee", () => {
  it("names all twelve Studio tools", () => {
    render(<StudioMarquee />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Twelve ways to work with one notebook."
    );
    for (const tile of STUDIO_TILES) {
      expect(screen.getAllByText(tile.title).length).toBeGreaterThan(0);
    }
  });
});
```

`home/AudienceTabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AudienceTabs } from "./AudienceTabs";

function renderTabs() {
  render(
    <MemoryRouter>
      <AudienceTabs />
    </MemoryRouter>
  );
}

describe("AudienceTabs", () => {
  it("opens on Students", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: "Students" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Nine days. Fourteen lectures. One notebook.")).toBeVisible();
    expect(screen.getByRole("link", { name: /SolomindLM for students/ })).toHaveAttribute(
      "href",
      "/students"
    );
  });

  it("switches to Researchers", async () => {
    renderTabs();
    await userEvent.click(screen.getByRole("tab", { name: "Researchers" }));
    expect(screen.getByText("From 200 papers to the 12 that matter.")).toBeVisible();
    expect(screen.getByRole("link", { name: /AI literature review/ })).toHaveAttribute(
      "href",
      "/research/ai-literature-review"
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

`home/StudioMarquee.tsx`:

```tsx
import { useReducedMotion } from "motion/react";
import Marquee from "react-fast-marquee";
import { type StudioTile, STUDIO_TILES } from "./landingHomeContent";
import { Accent, SectionHeading } from "./SectionHeading";
import { toneIcon } from "./tone";

const ROWS = [STUDIO_TILES.slice(0, 6), STUDIO_TILES.slice(6)];

function TileCard({ tile }: { tile: StudioTile }) {
  return (
    <div className="mx-2 w-56 rounded-2xl bg-background p-5 shadow-xs ring-1 ring-hairline md:w-66">
      <span className={toneIcon({ tone: tile.tone, className: "size-10 rounded-xl" })}>
        <tile.icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-4 font-display text-base font-bold">{tile.title}</h3>
      <p className="mt-1 font-serif text-sm leading-normal text-muted-foreground">{tile.description}</p>
    </div>
  );
}

/** The Studio band: two rows scrolling in opposite directions (#231), paused on hover and under reduced motion. */
export function StudioMarquee() {
  const reduceMotion = useReducedMotion();
  return (
    <section aria-labelledby="studio-title" className="overflow-hidden border-y border-border/50 bg-card py-24 md:py-28">
      <div className="px-6">
        <SectionHeading
          id="studio-title"
          eyebrow="Studio"
          title={
            <>
              Twelve ways to work with <Accent>one notebook.</Accent>
            </>
          }
          sub="Everything Studio makes is built from your sources and saved right next to them."
        />
      </div>
      <div className="mt-14 flex flex-col gap-4 mask-x-from-90%">
        {ROWS.map((row, index) => (
          <Marquee
            key={row[0].title}
            speed={32}
            direction={index === 0 ? "left" : "right"}
            pauseOnHover
            play={!reduceMotion}
          >
            {row.map((tile) => (
              <TileCard key={tile.title} tile={tile} />
            ))}
          </Marquee>
        ))}
      </div>
    </section>
  );
}
```

`home/AudienceTabs.tsx`:

```tsx
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { DemoSurface } from "./demo/DemoSurface";
import { AUDIENCES, type Audience } from "./landingHomeContent";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";
import { notebookCover, toneIcon } from "./tone";

function SampleNotebook({ notebook }: { notebook: Audience["notebook"] }) {
  return (
    <DemoSurface aria-hidden elevation="floating" className="mx-auto w-full max-w-90 overflow-hidden">
      <div className={notebookCover({ cover: notebook.cover, className: "flex h-24 items-end p-4" })}>
        <notebook.icon className="size-6" />
      </div>
      <div className="p-4.5">
        <p className="font-display text-lg font-bold">{notebook.title}</p>
        <p className="mt-0.5 font-sans text-xs text-muted-foreground">{notebook.meta}</p>
        <ul className="mt-3.5 flex flex-wrap gap-1.5 font-sans text-xs font-medium">
          {notebook.outputs.map((output) => (
            <li key={output.label} className="flex items-center gap-1.5 rounded-lg bg-background px-2 py-1.5 ring-1 ring-hairline">
              <span className={toneIcon({ tone: output.tone, className: "size-4.5 rounded" })}>
                <output.icon className="size-3" />
              </span>
              {output.label}
            </li>
          ))}
        </ul>
      </div>
    </DemoSurface>
  );
}

function AudiencePanel({ audience }: { audience: Audience }) {
  return (
    <Card variant="flush">
      <div className="grid gap-10 p-6 md:p-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h3 className="font-display text-3xl leading-tight font-bold tracking-tight">{audience.heading}</h3>
          <p className="mt-3.5 font-serif text-base leading-relaxed text-foreground/70">{audience.body}</p>
          <ol className="mt-5 grid gap-3 font-sans text-sm font-medium">
            {audience.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs text-primary">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <Link
            to={audience.link.to}
            className="mt-6 inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary hover:underline"
          >
            {audience.link.label}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <SampleNotebook notebook={audience.notebook} />
      </div>
    </Card>
  );
}

export function AudienceTabs() {
  return (
    <section id="use-cases" aria-labelledby="audience-title" className="scroll-mt-20 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="audience-title"
          eyebrow="Who it's for"
          title={
            <>
              For people who have to <Accent>actually know it.</Accent>
            </>
          }
        />
        <Reveal>
          <Tabs defaultValue={AUDIENCES[0].id} className="mt-8 items-center">
            <div className="max-w-full overflow-x-auto">
              <TabsList aria-label="Audience">
                {AUDIENCES.map((audience) => (
                  <TabsTrigger key={audience.id} value={audience.id}>
                    {audience.tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {AUDIENCES.map((audience) => (
              <TabsContent key={audience.id} value={audience.id} className="mt-8 w-full">
                <AudiencePanel audience={audience} />
              </TabsContent>
            ))}
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run** both tests, eslint (0 problems), typecheck. If `react-fast-marquee` misbehaves in jsdom, report it rather than mocking it away.

- [ ] **Step 5: Commit** with pathspec:

```bash
git add apps/web/src/features/landing/components/home/StudioMarquee.tsx apps/web/src/features/landing/components/home/StudioMarquee.test.tsx apps/web/src/features/landing/components/home/AudienceTabs.tsx apps/web/src/features/landing/components/home/AudienceTabs.test.tsx
git commit -m "feat(landing): Studio marquee band and audience tabs (#263)" -- apps/web/src/features/landing/components/home/StudioMarquee.tsx apps/web/src/features/landing/components/home/StudioMarquee.test.tsx apps/web/src/features/landing/components/home/AudienceTabs.tsx apps/web/src/features/landing/components/home/AudienceTabs.test.tsx
```

---

### Task 7: Pricing, FAQ and the closing section (parallel with 4–6)

**Files:**
- Create: `home/PricingSection.tsx`, `home/PricingSection.test.tsx`, `home/FaqSection.tsx`, `home/FaqSection.test.tsx`, `home/FirstNotebookCta.tsx`, `home/FirstNotebookCta.test.tsx`

- [ ] **Step 1: Write the failing tests.**

`home/PricingSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PricingSection } from "./PricingSection";

describe("PricingSection", () => {
  it("shows annual Pro pricing as the best value by default", () => {
    render(<PricingSection onGetStarted={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Annual" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("$7.50")).toBeInTheDocument();
    expect(screen.getByText("Best value")).toBeInTheDocument();
    expect(screen.getByText("Save 50%")).toBeInTheDocument();
  });

  it("switches Pro to monthly pricing and drops the best-value badge", async () => {
    render(<PricingSection onGetStarted={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: "Monthly" }));
    expect(screen.getByText("$15")).toBeInTheDocument();
    expect(screen.queryByText("$7.50")).not.toBeInTheDocument();
    expect(screen.queryByText("Best value")).not.toBeInTheDocument();
  });

  it("both plan buttons start sign-up", async () => {
    const onGetStarted = vi.fn();
    render(<PricingSection onGetStarted={onGetStarted} />);
    await userEvent.click(screen.getByRole("button", { name: "Start free" }));
    await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    expect(onGetStarted).toHaveBeenCalledTimes(2);
  });
});
```

`home/FaqSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LANDING_FAQS } from "../../faqRegistry";
import { FaqSection } from "./FaqSection";

function renderFaq() {
  render(
    <MemoryRouter>
      <FaqSection />
    </MemoryRouter>
  );
}

describe("FaqSection", () => {
  it("lists every homepage question, the first one open", () => {
    renderFaq();
    for (const faq of LANDING_FAQS) {
      expect(screen.getByRole("button", { name: faq.question })).toBeInTheDocument();
    }
    expect(screen.getByText(LANDING_FAQS[0].answer)).toBeVisible();
    expect(screen.queryByText(LANDING_FAQS[1].answer)).not.toBeInTheDocument();
  });

  it("opens and closes a question", async () => {
    renderFaq();
    const second = screen.getByRole("button", { name: LANDING_FAQS[1].question });
    await userEvent.click(second);
    expect(screen.getByText(LANDING_FAQS[1].answer)).toBeVisible();
    expect(second).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(second);
    expect(screen.queryByText(LANDING_FAQS[1].answer)).not.toBeInTheDocument();
  });

  it("links to support and to the full FAQ", () => {
    renderFaq();
    expect(screen.getByRole("link", { name: "support@solomindlm.com" })).toHaveAttribute(
      "href",
      "mailto:support@solomindlm.com"
    );
    expect(screen.getByRole("link", { name: /See all questions/ })).toHaveAttribute("href", "/faq");
  });
});
```

`home/FirstNotebookCta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FirstNotebookCta } from "./FirstNotebookCta";

describe("FirstNotebookCta", () => {
  it("has one action, and it starts sign-up", async () => {
    const onGetStarted = vi.fn();
    render(<FirstNotebookCta onGetStarted={onGetStarted} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Create my first notebook/ }));
    expect(onGetStarted).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.**

`home/PricingSection.tsx`:

```tsx
import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { type Billing, PLANS, type Plan } from "./landingHomeContent";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

function PlanCard({ plan, billing, onGetStarted }: { plan: Plan; billing: Billing; onGetStarted: () => void }) {
  return (
    <Card variant={plan.featured ? "featured" : "flush"}>
      <div className="flex h-full flex-col p-7 md:p-8">
        <div className="flex items-center justify-between">
          <h3 className="font-sans text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {plan.name}
          </h3>
          {plan.featured && billing === "annual" ? <Badge>Best value</Badge> : null}
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-5xl font-bold tracking-tight">{plan.price[billing]}</span>
          <span className="font-sans text-sm text-muted-foreground">{plan.period[billing]}</span>
        </p>
        <p className="mt-2 font-serif text-base text-muted-foreground">{plan.description}</p>
        <ul className="mt-6 mb-8 grid gap-3 border-t border-border/50 pt-6 font-sans text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5">
              <Check aria-hidden className="size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          variant={plan.featured ? "default" : "outline"}
          className="mt-auto w-full"
          onClick={onGetStarted}
        >
          {plan.cta}
        </Button>
      </div>
    </Card>
  );
}

export function PricingSection({ onGetStarted }: { onGetStarted: () => void }) {
  const [billing, setBilling] = useState<Billing>("annual");
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 px-6 py-24 md:py-28">
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title={
            <>
              Start free. <Accent>Upgrade when it's worth it.</Accent>
            </>
          }
        />
        <Reveal className="mt-8 flex items-center justify-center gap-3">
          <Tabs value={billing} onValueChange={(value) => setBilling(value as Billing)}>
            <TabsList aria-label="Billing period">
              <TabsTrigger value="annual">Annual</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
          <Badge variant="success">Save 50%</Badge>
        </Reveal>
        <Reveal className="mx-auto mt-10 grid max-w-215 gap-6 md:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} billing={billing} onGetStarted={onGetStarted} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
```

`home/FaqSection.tsx`:

```tsx
import { ArrowRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import type { FAQItem } from "../../constants";
import { LANDING_FAQS } from "../../faqRegistry";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

function FaqRow({ faq, defaultOpen }: { faq: FAQItem; defaultOpen: boolean }) {
  return (
    <Card variant="flush">
      <Collapsible defaultOpen={defaultOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="disclosure" size="chip" className="group/faq w-full justify-between">
            {faq.question}
            <Plus
              aria-hidden
              className="text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]/faq:rotate-45"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="px-4 pt-1 pb-5 font-serif text-base leading-relaxed text-foreground/75">{faq.answer}</p>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/** Renders every LANDING_FAQS entry: the FAQ structured data uses the same list. */
export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-280 gap-10 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-4">
          <SectionHeading
            id="faq-title"
            align="start"
            eyebrow="FAQ"
            title={
              <>
                Questions, <Accent>answered.</Accent>
              </>
            }
          />
          <Reveal>
            <p className="mt-4 font-serif text-base leading-relaxed text-foreground/70">
              Can't find yours? Email{" "}
              <a href="mailto:support@solomindlm.com" className="font-medium text-primary hover:underline">
                support@solomindlm.com
              </a>
              , a person reads every message.
            </p>
            <Link
              to="/faq"
              className="mt-5 inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-primary hover:underline"
            >
              See all questions
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-8">
          <ul className="flex flex-col gap-2.5">
            {LANDING_FAQS.map((faq, index) => (
              <li key={faq.question}>
                <FaqRow faq={faq} defaultOpen={index === 0} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
```

`home/FirstNotebookCta.tsx`:

```tsx
import { ArrowRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { NewNotebookDemo } from "./demo/NewNotebookDemo";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

export function FirstNotebookCta({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section aria-labelledby="cta-title" className="px-6 pt-8 pb-28 md:pb-32">
      <div className="mx-auto grid max-w-280 items-center gap-14 lg:grid-cols-12 lg:gap-20">
        <div className="lg:col-span-7">
          <SectionHeading
            id="cta-title"
            align="start"
            eyebrow="Your turn"
            title={
              <>
                Your next notebook is <Accent>one upload away.</Accent>
              </>
            }
          />
          <Reveal>
            <p className="mt-5 max-w-lg font-serif text-lg leading-relaxed text-foreground/70">
              Start with the lecture you're dreading. Ask it anything, then let it question you back.
              Free, no card, and you can stop whenever.
            </p>
            <Button size="lg" className="mt-8" onClick={onGetStarted}>
              Create my first notebook
              <ArrowRight aria-hidden />
            </Button>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-5">
          <NewNotebookDemo />
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run** the three tests, eslint (0 problems), typecheck.

- [ ] **Step 5: Commit** with pathspec:

```bash
git add apps/web/src/features/landing/components/home/PricingSection.tsx apps/web/src/features/landing/components/home/PricingSection.test.tsx apps/web/src/features/landing/components/home/FaqSection.tsx apps/web/src/features/landing/components/home/FaqSection.test.tsx apps/web/src/features/landing/components/home/FirstNotebookCta.tsx apps/web/src/features/landing/components/home/FirstNotebookCta.test.tsx
git commit -m "feat(landing): pricing, FAQ and the first-notebook close (#263)" -- apps/web/src/features/landing/components/home/PricingSection.tsx apps/web/src/features/landing/components/home/PricingSection.test.tsx apps/web/src/features/landing/components/home/FaqSection.tsx apps/web/src/features/landing/components/home/FaqSection.test.tsx apps/web/src/features/landing/components/home/FirstNotebookCta.tsx apps/web/src/features/landing/components/home/FirstNotebookCta.test.tsx
```

---

### Task 8: Assemble the page, footer, cleanup, MIGRATED

**Files:**
- Modify: `features/landing/LandingPage.tsx`, `features/landing/components/Footer.tsx`, `shared/seo/publicSeoPrerenderHtml.ts:28`, `apps/web/eslint.config.mjs` (`MIGRATED`), `apps/web/design-lint-baseline.json` (generated), `apps/web/src/index.css` (remove `.hero-search-glass`), possibly `features/landing/constants.ts`
- Delete: the eight old components listed in the file map

- [ ] **Step 1: Rewrite `LandingPage.tsx`:**

```tsx
import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import { AudienceTabs } from "./components/home/AudienceTabs";
import { FaqSection } from "./components/home/FaqSection";
import { FirstNotebookCta } from "./components/home/FirstNotebookCta";
import { HeroSection } from "./components/home/HeroSection";
import { HowItWorks } from "./components/home/HowItWorks";
import { LandingNav } from "./components/home/LandingNav";
import { PricingSection } from "./components/home/PricingSection";
import { SourceStrip } from "./components/home/SourceStrip";
import { StudioMarquee } from "./components/home/StudioMarquee";

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="auth-form-light min-h-screen bg-background" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  return (
    <>
      <SEOMeta pagePath="/" />
      {/* Pinned light, like sign-in: the marketing pages don't follow the app theme. */}
      <div className="auth-form-light min-h-screen bg-background font-serif text-foreground antialiased">
        <LandingNav onGetStarted={onGetStarted} onLogin={() => setAuthModalOpen(true)} />
        <main>
          <HeroSection onGetStarted={onGetStarted} />
          <SourceStrip />
          <HowItWorks />
          <StudioMarquee />
          <AudienceTabs />
          <PricingSection onGetStarted={onGetStarted} />
          <FaqSection />
          <FirstNotebookCta onGetStarted={onGetStarted} />
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
};
```

- [ ] **Step 2: Restyle `Footer.tsx`.** Keep the three icon components (`GitHubIcon`, `XIcon`, `LinkedInIcon`) exactly as they are. Replace the tagline constant, `COMPANY_LINKS`, `FooterLinkColumn`, `FooterLink` and `Footer` with:

```tsx
const FOOTER_TAGLINE =
  "An AI study and research partner that works from the material you give it.";

const PRODUCT_LINKS = [
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/#pricing" },
  { label: "FAQ", to: "/faq" },
] as const;

const LEGAL_LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
] as const;

const SOCIAL_LINKS = [
  { label: "GitHub", href: "https://github.com/samintisar/SolomindLM", Icon: GitHubIcon },
  { label: "X", href: "https://twitter.com/solomindlm", Icon: XIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/solomindlm/", Icon: LinkedInIcon },
] as const;

function FooterLinkColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="mb-4 font-display text-sm font-bold text-foreground">{title}</h3>
      <ul className="space-y-2.5">{children}</ul>
    </nav>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="font-sans text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const studentPages = getIntentPagesByCluster("students");
  const researchPages = getIntentPagesByCluster("research");
  const comparisonPages = getComparisonPages();
  const guidePages = getGuidePages();

  return (
    <footer className="border-t border-border/50 px-6 pt-16 pb-10">
      <div className="mx-auto max-w-280">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 lg:grid-cols-12">
          <div className="col-span-2 md:col-span-4 lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-2.5 font-display text-lg font-bold text-foreground">
              <img src="/SolomindLM_logo.png" alt="" className="size-8 shrink-0 object-contain" />
              SolomindLM
            </Link>
            <p className="mt-4 max-w-xs font-serif text-sm leading-relaxed text-muted-foreground">
              {FOOTER_TAGLINE}
            </p>
            <div className="mt-5 flex items-center gap-4">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="size-5" />
                </a>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2">
            <FooterLinkColumn title="Product">
              {PRODUCT_LINKS.map((link) => (
                <FooterLink key={link.to} to={link.to}>
                  {link.label}
                </FooterLink>
              ))}
              {comparisonPages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>

          <div className="lg:col-span-2">
            <FooterLinkColumn title="For students">
              <FooterLink to="/students">All student tools</FooterLink>
              {studentPages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>

          <div className="lg:col-span-2">
            <FooterLinkColumn title="For research">
              <FooterLink to="/research">All research tools</FooterLink>
              {researchPages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>

          <div className="lg:col-span-2">
            <FooterLinkColumn title="Company">
              {guidePages.map((page) => (
                <FooterLink key={page.path} to={page.path}>
                  {page.navLabel}
                </FooterLink>
              ))}
              {LEGAL_LINKS.map((link) => (
                <FooterLink key={link.to} to={link.to}>
                  {link.label}
                </FooterLink>
              ))}
            </FooterLinkColumn>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-border/50 pt-8 font-sans text-sm text-muted-foreground sm:flex-row sm:justify-between">
          <p>Copyright &copy; {currentYear} SolomindLM. All rights reserved.</p>
          <p>Made for people who'd rather understand it.</p>
        </div>
      </div>
    </footer>
  );
};
```

- [ ] **Step 3: Delete the old home components.**

```bash
git rm apps/web/src/features/landing/components/ContentShowcase.tsx apps/web/src/features/landing/components/FAQSection.tsx apps/web/src/features/landing/components/FeaturesGrid.tsx apps/web/src/features/landing/components/HeroSection.tsx apps/web/src/features/landing/components/LandingHeroMockup.tsx apps/web/src/features/landing/components/NavigationHeader.tsx apps/web/src/features/landing/components/PricingSection.tsx apps/web/src/features/landing/components/UseCasesSection.tsx
```

Then `git grep -n "LandingHeroMockup\|NavigationHeader\|FeaturesGrid\|ContentShowcase\|UseCasesSection" -- apps/web/src` → no hits (fix any).

- [ ] **Step 4: Prerender tagline.** In `apps/web/src/shared/seo/publicSeoPrerenderHtml.ts`, change `<p>AI that enhances learning, not replaces thinking.</p>` to `<p>AI that makes you think, not thinks for you.</p>`. Run that file's tests if any exist (`git ls-files apps/web/src/shared/seo | grep test`) and update an expectation that quotes the old line.

- [ ] **Step 5: CSS cleanup.** In `index.css` remove `.hero-search-glass` and `.dark .hero-search-glass`. Run `git grep -n "animate-cursor-blink\|cursor-blink" -- apps/web/src`; if the only hits are the definitions in `index.css`, remove the `@keyframes cursor-blink` block and `.animate-cursor-blink` too. Keep `.landing-grid-pattern`.

- [ ] **Step 6: MIGRATED and the ratchet.** In `apps/web/eslint.config.mjs`, after the Studio entry in `MIGRATED`, add:

```js
  // Landing home page (#263). The content templates follow in PR 2.
  "src/features/landing/LandingPage.tsx",
  "src/features/landing/components/**/*.tsx",
```

From `apps/web`: `bunx eslint --max-warnings 0 src/features/landing/LandingPage.tsx "src/features/landing/components/**/*.tsx"` → 0 problems. From the root: `bun run lint:design:update`, then `git diff apps/web/design-lint-baseline.json` — `features/landing` counts must only go **down** (the remaining ones are the templates). `bun run lint:design` → passes.

- [ ] **Step 7: Knip.** From the root run `bunx knip`. Remove whatever it reports as newly unused in `features/landing/constants.ts` (expected: `getLandingFeatureColor`, `LANDING_CONTENT`, `FEATURES_MARQUEE_ROW_1_ORDER`, `FEATURES_MARQUEE_ROW_2_ORDER`, `orderLandingFeatures`, `HOME_RESOURCE_LINKS` and helpers only they used) — keep anything the templates, `faqRegistry`, `intentLandingPages`, `seoContentPages`, `clusterHubPages` or `publicSeoPrerenderHtml` import. Re-run until Knip is clean. If `react-fast-marquee` or a Studio export becomes unused, report it instead of removing it.

- [ ] **Step 8: Gates.** Root: `bun run typecheck:web`, `bun run lint`, `bun run lint:design`, `bunx knip`. `apps/web`: `bun run test` (whole web suite) → all PASS.

- [ ] **Step 9: Commit** with pathspec:

```bash
git add -A apps/web/src/features/landing apps/web/src/shared/seo/publicSeoPrerenderHtml.ts apps/web/src/index.css apps/web/eslint.config.mjs apps/web/design-lint-baseline.json
git commit -m "feat(landing): new home page on the design system; landing components join MIGRATED (#263)" -- apps/web/src/features/landing apps/web/src/shared/seo apps/web/src/index.css apps/web/eslint.config.mjs apps/web/design-lint-baseline.json
```

---

### Task 9: Visual check, snapshots, e2e, PR (controller)

- [ ] **Step 1: Dev server.** Start the worktree's Vite on its own port (not :5173, which another checkout uses) and capture `/` signed-out with headless Playwright (fresh context; never sign the user out of the browser pane) at 1440 × 900 and 390 × 844, full page, plus a reduced-motion pass. Compare section by section with `docs/superpowers/specs/2026-10-07-landing-home-mockup.html`. Check: hero lines break as in the mockup; the citation tooltip sits under [1] (phone too); beat compositions don't cover each other's text; marquee scrolls and fades at the edges; tabs, billing toggle, FAQ work; phone menu sheet is light.
- [ ] **Step 2: Design snapshots.** `bun run test:design:update` (Docker; export `VITE_CONVEX_URL` from the parent checkout's `apps/web/.env.local` without printing it) for the Cards and Badges gallery sections; commit the refreshed PNGs.
- [ ] **Step 3: e2e.** `bunx playwright test e2e/smoke` → PASS.
- [ ] **Step 4: Lighthouse.** Production build + `vite preview`, Lighthouse on `/` before (main) and after: performance and SEO must not drop.
- [ ] **Step 5: Final review** (opus reviewer on the whole branch), fix findings via the implementers, then push and open the PR with 1440/390 screenshots. Ask the user before merging.
