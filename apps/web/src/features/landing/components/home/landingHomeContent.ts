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
import { FREE_PLAN_FEATURES, PRO_PLAN_FEATURES } from "@/features/billing/planFeatures";
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
  {
    title: "Chat",
    description: "Ask questions using your notebook sources",
    icon: MessageCircle,
    tone: "chat",
  },
  {
    title: "Deep research",
    description: "Multi-step research with web and notebook sources",
    icon: Telescope,
    tone: "research",
  },
  {
    title: "Literature review",
    description: "Screen papers and draft synthesis reports",
    icon: BookOpen,
    tone: "literature",
  },
  {
    title: "Audio overview",
    description: "Audio recaps from your study material",
    icon: AudioLines,
    tone: "audio",
  },
  {
    title: "Mind map",
    description: "Visual maps of concepts from your sources",
    icon: GitFork,
    tone: "mindmap",
  },
  {
    title: "Reports",
    description: "Study guides and report drafts on demand",
    icon: FileText,
    tone: "report",
  },
  {
    title: "Flashcards",
    description: "Spaced-repetition decks from your material",
    icon: Layers,
    tone: "flashcard",
  },
  {
    title: "Quiz",
    description: "Multiple-choice practice that explains answers",
    icon: CircleHelp,
    tone: "quiz",
  },
  {
    title: "Infographic",
    description: "Visual infographics from your sources",
    icon: ImageIcon,
    tone: "infographic",
  },
  {
    title: "Written questions",
    description: "Written prompts with answer feedback",
    icon: MessageSquareText,
    tone: "written",
  },
  {
    title: "Spreadsheets",
    description: "Structured tables extracted from sources",
    icon: Table2,
    tone: "spreadsheet",
  },
  {
    title: "Shared notebooks",
    description: "Cowork or fork a notebook via link",
    icon: Share2,
    tone: "share",
  },
];

interface NotebookOutput {
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

/** Feature lists are built from the backend's limit tables (see billing/planFeatures.ts). */
export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    description: "Everything you need to try it on a real course.",
    price: { annual: "$0", monthly: "$0" },
    period: { annual: "forever", monthly: "forever" },
    features: FREE_PLAN_FEATURES,
    cta: "Start free",
    featured: false,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For a full course load, or a thesis.",
    price: { annual: "$7.50", monthly: "$15" },
    period: { annual: "/ month, billed yearly", monthly: "/ month" },
    features: PRO_PLAN_FEATURES,
    cta: "Get Pro",
    featured: true,
  },
];
