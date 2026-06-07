import type { FAQItem } from "./constants";
import {
  getIntentPagesByCluster,
  type IntentLandingCluster,
  type IntentLandingPageConfig,
} from "./intentLandingPages";

export type ClusterHubSection = {
  title: string;
  description: string;
  intentKeys: string[];
};

export type ClusterHubPageConfig = {
  path: string;
  cluster: IntentLandingCluster;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  subheadline: string;
  summaryBullets: string[];
  sections: ClusterHubSection[];
  faqs: FAQItem[];
  ctaLabel: string;
  conversionPromise: string;
  changefreq?: "weekly" | "monthly";
  priority?: number;
};

export const CLUSTER_HUB_PAGES: ClusterHubPageConfig[] = [
  {
    path: "/students",
    cluster: "students",
    title: "Study Tools for Students | SolomindLM",
    description:
      "Upload lectures and readings, then generate flashcards, quizzes, mind maps, audio overviews, reports, and more—all grounded in your own course materials.",
    keywords:
      "student study tools, AI flashcards, study guide, upload PDF, quiz generator, mind map, audio study",
    h1: "Study tools built around your course materials",
    subheadline:
      "SolomindLM helps you bring lectures, PDFs, and media into one notebook, then turn them into flashcards, quizzes, reports, and other study outputs you can review and edit.",
    summaryBullets: [
      "Upload PDFs, slides, audio, video transcripts, Google Drive files, or pasted text",
      "Discover web and news articles to add alongside your uploads",
      "Generate flashcards, quizzes, mind maps, audio overviews, reports, infographics, written questions, and spreadsheets from selected sources",
      "Share notebooks with classmates via view or fork links",
    ],
    sections: [
      {
        title: "Bring your materials in",
        description:
          "Start by adding course content to a notebook—upload files, discover articles, or share a notebook with your study group.",
        intentKeys: ["sourceUpload", "sourceDiscovery", "notebookSharing"],
      },
      {
        title: "Generate study materials",
        description:
          "Use Studio tools to draft study outputs from the sources you select. Review and edit every draft before you rely on it for exams.",
        intentKeys: [
          "flashcards",
          "quiz",
          "audio",
          "mindmap",
          "reports",
          "infographic",
          "writtenQuestions",
          "spreadsheets",
        ],
      },
    ],
    faqs: [
      {
        question: "What study tools does SolomindLM offer?",
        answer:
          "You can upload and discover sources, then generate flashcards, multiple-choice quizzes, written questions with feedback, mind maps, audio overviews, reports and study guides, infographics, and spreadsheets—all from materials in your notebook.",
      },
      {
        question: "Do I need to upload sources before generating study materials?",
        answer:
          "Yes. Studio tools work on sources you add to a notebook—uploads, discovered articles, or pasted text. You choose which sources to include for each generation.",
      },
      {
        question: "How is the Quiz tool different from Written Questions?",
        answer:
          "Quizzes produce multiple-choice practice only. Written Questions generates short-answer and essay prompts and gives feedback on responses you submit.",
      },
      {
        question: "Is there a free plan for students?",
        answer:
          "Yes. Free accounts include notebooks with per-notebook source limits and daily caps on AI generation. Pro plans raise notebook limits. See pricing on the homepage for current numbers.",
      },
    ],
    ctaLabel: "Create free account",
    conversionPromise:
      "Create a free account, upload your first sources, and generate study materials in minutes.",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/research",
    cluster: "research",
    title: "Research Tools | SolomindLM",
    description:
      "Discover and import academic papers, chat with your reading list, run literature review mode, format citations in 12 styles, and draft deep research reports.",
    keywords:
      "research tools, literature review, chat with PDF, paper discovery, citation styles, deep research, academic papers",
    h1: "Research tools for your paper collection",
    subheadline:
      "Collect papers in a research notebook, ask questions across your sources, screen and synthesize literature, and format citations—while you stay responsible for rigor and verification.",
    summaryBullets: [
      "Search academic literature with filters for year, citations, open access, and field",
      "Import papers by DOI, BibTeX, RIS, Zotero, Mendeley, or manual entry",
      "Chat with papers, run literature review mode, and produce deep research report drafts",
      "Format citations in twelve styles including APA, MLA, Chicago, IEEE, and Vancouver",
    ],
    sections: [
      {
        title: "Build your reading list",
        description:
          "Find papers through academic discovery or import them from reference managers and DOI lookups.",
        intentKeys: ["academicDiscovery", "paperImport"],
      },
      {
        title: "Analyze and write",
        description:
          "Work with your collection through chat, literature review, deep research, and citation formatting.",
        intentKeys: ["literatureReview", "chat", "deepResearch", "citationStyles"],
      },
    ],
    faqs: [
      {
        question: "What research tools does SolomindLM offer?",
        answer:
          "You can discover and import academic papers, chat with your sources, run literature review mode with screening and synthesis, produce deep research report drafts that combine web and notebook sources, and format citations in twelve styles.",
      },
      {
        question: "Is literature review mode a systematic review tool?",
        answer:
          "No. It assists with screening, ranking, and synthesis across papers in your notebook, but it does not replace preregistered systematic review protocols or exhaustive search requirements.",
      },
      {
        question: "Which citation styles are supported?",
        answer:
          "Twelve styles including APA, MLA, Chicago, AMA, ACS, IEEE, Vancouver, and Harvard. Use them in literature reviews, reports, and the Cite Paper modal—then verify against your style manual.",
      },
      {
        question: "Should I trust AI answers without checking the PDFs?",
        answer:
          "No. Chat, literature review, and deep research outputs are drafts. Confirm quotes, claims, and citations in the original documents before submitting formal work.",
      },
    ],
    ctaLabel: "Create free account",
    conversionPromise:
      "Start free—import your first papers and explore chat, literature review, and citation tools.",
    changefreq: "weekly",
    priority: 0.9,
  },
];

export function getClusterHubPageByPath(path: string): ClusterHubPageConfig | undefined {
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return CLUSTER_HUB_PAGES.find((page) => page.path === normalized);
}

export function getClusterHubPaths(): string[] {
  return CLUSTER_HUB_PAGES.map((page) => page.path);
}

export function isClusterHubPath(path: string): boolean {
  return getClusterHubPageByPath(path) !== undefined;
}

export function resolveHubSectionPages(
  hub: ClusterHubPageConfig,
  section: ClusterHubSection
): IntentLandingPageConfig[] {
  const clusterPages = getIntentPagesByCluster(hub.cluster);
  const byKey = new Map(clusterPages.map((page) => [page.intentKey, page]));
  return section.intentKeys
    .map((key) => byKey.get(key))
    .filter((page): page is IntentLandingPageConfig => page !== undefined);
}
