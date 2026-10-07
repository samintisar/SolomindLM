import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  FileInput,
  FileText,
  Globe,
  Presentation,
  ScrollText,
  Search,
  Telescope,
  Youtube,
} from "lucide-react";
import type { ReactNode } from "react";
import type { OutputCardShape } from "./components/content/OutputCard";
import { AnswerDemo } from "./components/home/demo/CitationDemo";
import { LiteratureTableDemo } from "./components/home/demo/ResearchDemo";
import { FlashcardDemo, QuizDemo } from "./components/home/demo/StudyDemo";
import type { Tone } from "./components/home/tone";

interface SceneSource {
  name: string;
  meta: string;
  icon: LucideIcon;
  tone: Tone;
}

type SceneOutput =
  | { kind: "demo"; render: (className: string) => ReactNode }
  | { kind: "card"; title: string; meta: string; rows: string[]; shape?: OutputCardShape };

interface IntentScene {
  sources: SceneSource[];
  output: SceneOutput;
}

/*
 * The "Your source → What you get" picture on each tool page. Sources match the page's
 * `sourceToOutput.source` caption; the output reuses a home demo card only when the demo's topic matches
 * the page's `sourceToOutput.output` caption, otherwise it is an `OutputCard`.
 */
const INTENT_SCENES: Record<string, IntentScene> = {
  sourceUpload: {
    sources: [
      { name: "Lecture 3 · Cell signalling.pdf", meta: "18 pages", icon: FileText, tone: "pdf" },
      { name: "Week 3 recap", meta: "YouTube · 14 min", icon: Youtube, tone: "video" },
    ],
    output: {
      kind: "card",
      title: "Week 3 · Cell biology",
      meta: "2 sources ready",
      rows: ["Chat with your sources", "Make flashcards", "Generate a quiz"],
    },
  },
  sourceDiscovery: {
    sources: [
      { name: "Search: climate policy", meta: "News · last 30 days", icon: Search, tone: "web" },
    ],
    output: {
      kind: "card",
      title: "Imported articles",
      meta: "20 found",
      rows: [
        "Carbon pricing in the EU",
        "City heat-resilience targets",
        "Emissions trading prices",
      ],
    },
  },
  notebookSharing: {
    sources: [
      { name: "BIO 201 · Midterm", meta: "6 sources · 3 outputs", icon: BookOpen, tone: "share" },
    ],
    output: {
      kind: "card",
      title: "Share link",
      meta: "Anyone with the link",
      rows: ["View · read and study", "Fork · make their own copy"],
    },
  },
  flashcards: {
    sources: [
      { name: "Ch. 10 · Beta blockers.pdf", meta: "32 pages", icon: FileText, tone: "pdf" },
      { name: "Lecture 12 slides", meta: "48 slides", icon: Presentation, tone: "book" },
    ],
    output: { kind: "demo", render: (className) => <FlashcardDemo className={className} /> },
  },
  quiz: {
    sources: [
      { name: "Unit 4 notes", meta: "12 pages", icon: FileText, tone: "book" },
      { name: "Textbook § 10.3", meta: "Pharmacology", icon: BookOpen, tone: "book" },
    ],
    output: { kind: "demo", render: (className) => <QuizDemo className={className} /> },
  },
  audio: {
    sources: [
      { name: "Sleep and memory", meta: "Article", icon: Globe, tone: "web" },
      { name: "Spaced practice", meta: "Article", icon: Globe, tone: "web" },
      { name: "Class notes", meta: "6 pages", icon: FileText, tone: "book" },
    ],
    output: {
      kind: "card",
      title: "Audio overview",
      meta: "8 min · two voices",
      shape: "waveform",
      rows: ["Why sleep helps memory stick"],
    },
  },
  mindmap: {
    sources: [
      { name: "Ch. 6 · Cell signalling.pdf", meta: "40 pages", icon: FileText, tone: "pdf" },
    ],
    output: {
      kind: "card",
      title: "Cell signalling",
      meta: "Mind map · 18 ideas",
      rows: ["Receptors", "Second messengers", "Kinase cascades", "Switching the signal off"],
    },
  },
  reports: {
    sources: [
      { name: "Reading 1 · Supply shocks.pdf", meta: "14 pages", icon: FileText, tone: "pdf" },
      { name: "Reading 2 · Monetary policy.pdf", meta: "22 pages", icon: FileText, tone: "pdf" },
    ],
    output: {
      kind: "card",
      title: "Study guide · Unit 3",
      meta: "Report · 6 sections",
      rows: [
        "1. Key terms",
        "2. How supply shocks spread",
        "3. What central banks can do",
        "4. Likely exam questions",
      ],
    },
  },
  infographic: {
    sources: [
      { name: "Lecture 5 · Photosynthesis.pdf", meta: "20 pages", icon: FileText, tone: "pdf" },
      { name: "Lecture 6 · Calvin cycle.pdf", meta: "16 pages", icon: FileText, tone: "pdf" },
    ],
    output: {
      kind: "card",
      title: "Photosynthesis in four steps",
      meta: "Infographic · 1 page",
      rows: ["Light is absorbed", "Water is split", "ATP and NADPH are made", "Carbon is fixed"],
    },
  },
  // A history card, not WrittenQuestionDemo: that demo is pharmacology and this page's sources are history.
  writtenQuestions: {
    sources: [
      { name: "Treaty of Versailles", meta: "Primary source", icon: ScrollText, tone: "book" },
      { name: "Wilson's Fourteen Points", meta: "Primary source", icon: ScrollText, tone: "book" },
    ],
    output: {
      kind: "card",
      title: "Essay prompt · 2 of 5",
      meta: "Written questions",
      rows: [
        "Explain why the Treaty of Versailles fuelled German resentment.",
        "Feedback · 4 / 5: strong on reparations; add the war guilt clause.",
      ],
    },
  },
  spreadsheets: {
    sources: [
      { name: "Retailer.pdf", meta: "Case A", icon: FileText, tone: "pdf" },
      { name: "Airline.pdf", meta: "Case B", icon: FileText, tone: "pdf" },
      { name: "Telecom.pdf", meta: "Case C", icon: FileText, tone: "pdf" },
    ],
    output: {
      kind: "card",
      title: "Case comparison",
      meta: "Spreadsheet · 3 rows",
      shape: "columns",
      rows: [
        "Case · Revenue · Margin",
        "Retailer · $4.2B · 6%",
        "Airline · $9.8B · 3%",
        "Telecom · $6.1B · 18%",
      ],
    },
  },
  academicDiscovery: {
    sources: [
      {
        name: "Search: transformers in biology",
        meta: "OpenAlex · Semantic Scholar",
        icon: Search,
        tone: "research",
      },
    ],
    output: {
      kind: "card",
      title: "Papers found",
      meta: "Sorted by citations",
      rows: [
        "Transformer models for protein structure · 2023",
        "Attention-based gene expression prediction · 2024",
        "Language models for single-cell data · 2025",
      ],
    },
  },
  paperImport: {
    sources: [
      {
        name: "thesis-project.bib",
        meta: "Zotero export · 24 entries",
        icon: FileInput,
        tone: "pdf",
      },
    ],
    output: {
      kind: "card",
      title: "Imported papers",
      meta: "24 papers · metadata attached",
      rows: ["DOI, authors and year filled in", "Abstracts attached", "Ready to read and cite"],
    },
  },
  citationStyles: {
    sources: [
      {
        name: "12 imported articles",
        meta: "Notebook papers",
        icon: BookOpen,
        tone: "literature",
      },
    ],
    output: {
      kind: "card",
      title: "References · APA 7",
      meta: "Bibliography",
      rows: [
        "Nguyen, L. (2024). Sleep and memory consolidation. Journal of Cognitive Science, 12(3), 45–61.",
        "Okafor, C., & Lind, M. (2023). Spaced practice in undergraduate biology. Learning Research, 8(1), 3–19.",
      ],
    },
  },
  literatureReview: {
    sources: [
      {
        name: "24 papers",
        meta: "Beta blockers in asthma",
        icon: BookOpen,
        tone: "literature",
      },
    ],
    output: { kind: "demo", render: (className) => <LiteratureTableDemo className={className} /> },
  },
  chat: {
    sources: [
      { name: "Ch. 10 · Beta blockers.pdf", meta: "32 pages", icon: FileText, tone: "pdf" },
      { name: "Lecture 12 slides", meta: "48 slides", icon: Presentation, tone: "book" },
      { name: "Asthma guideline.pdf", meta: "60 pages", icon: FileText, tone: "pdf" },
    ],
    output: { kind: "demo", render: (className) => <AnswerDemo className={className} /> },
  },
  deepResearch: {
    sources: [
      {
        name: "Question: are beta blockers safe in asthma?",
        meta: "10 notebook papers",
        icon: Telescope,
        tone: "research",
      },
    ],
    output: {
      kind: "card",
      title: "Research report",
      meta: "Web + notebook sources",
      rows: [
        "1. Background",
        "2. What the trials show",
        "3. Where sources disagree",
        "Sources · 10 notebook · 14 web",
      ],
    },
  },
};

export function getIntentScene(intentKey: string): IntentScene | undefined {
  return INTENT_SCENES[intentKey];
}
