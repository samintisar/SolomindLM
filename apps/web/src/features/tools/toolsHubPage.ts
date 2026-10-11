import type { FAQItem } from "@/features/landing/constants";
import type { BreadcrumbItem } from "@/shared/seo/structuredData";
import { FREE_TOOL_PAGES, type ToolPageConfig } from "./toolPages";

export const TOOLS_HUB_PATH = "/tools";

/** The /tools hub's one date: the visible "Updated" line, JSON-LD `dateModified` and sitemap `lastmod`. */
export const TOOLS_HUB_LAST_UPDATED = "2026-10-11";

type ToolsHubPageConfig = {
  path: string;
  /** Breadcrumb, footer and section label. */
  navLabel: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  /** Phrase inside `h1` shown in the accent colour. */
  h1Accent: string;
  intro: string;
  faqs: FAQItem[];
  ctaLabel: string;
  conversionPromise: string;
};

/** Copy for the /tools hub. Its tool list comes from FREE_TOOL_PAGES, so a new tool needs no change here. */
export const TOOLS_HUB_PAGE: ToolsHubPageConfig = {
  path: TOOLS_HUB_PATH,
  navLabel: "Free tools",
  title: "Free AI Study and Research Tools — No Signup | SolomindLM",
  description:
    "Free tools for students and researchers that work in your browser with no account and no watermark. Pick a tool, download the result and get back to work.",
  keywords:
    "free study tools, free ai tools for students, free research tools, no signup study tools, free flashcard maker",
  h1: "Free study and research tools",
  h1Accent: "study and research tools",
  intro:
    "Each tool does one job in your browser, with no account and no watermark. Use it once, download the result, and sign up only if you want to keep working from your sources in a notebook.",
  faqs: [
    {
      question: "Are these tools really free?",
      answer:
        "Yes. Every tool on this page works without an account and adds no watermark to what you download. Tools that use AI have a daily limit for visitors without an account; a free account raises it.",
    },
    {
      question: "Do I need to sign up?",
      answer:
        "No. Use a tool and download the result without an account. Sign up free only if you want to keep your material in a notebook, chat with it and generate more from it.",
    },
    {
      question: "How are the free tools different from a SolomindLM account?",
      answer:
        "A free tool takes one input and gives one result. A SolomindLM notebook keeps your PDFs, slides, videos and papers together, answers questions from them with citations, and turns them into flashcards, quizzes, mind maps, reports and audio overviews.",
    },
  ],
  ctaLabel: "Create free account",
  conversionPromise:
    "Keep your sources in a notebook and turn them into study and research material, free to start.",
};

type ToolsHubLink = { path: string; label: string; description: string };

/** Every registered free tool, in registry order: the hub's cards, its prerender list and its ItemList. */
export function getToolsHubLinks(tools: ToolPageConfig[] = FREE_TOOL_PAGES): ToolsHubLink[] {
  return tools.map((tool) => ({
    path: tool.path,
    label: tool.h1,
    description: tool.description,
  }));
}

export function getToolsHubBreadcrumbItems(): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: TOOLS_HUB_PAGE.navLabel, path: TOOLS_HUB_PATH },
  ];
}

/** Home → Free tools → tool. */
export function getToolBreadcrumbItems(page: ToolPageConfig): BreadcrumbItem[] {
  return [...getToolsHubBreadcrumbItems(), { name: page.h1, path: page.path }];
}
