export interface FAQItem {
  question: string;
  answer: string;
}

/** Shared with the homepage prerender body (publicSeoPrerenderHtml.ts) — keep both in sync. */
export const HOME_RESOURCE_LINKS = [
  { path: "/students", label: "Study tools for students" },
  { path: "/research", label: "Research tools" },
  { path: "/compare/solomindlm-vs-notebooklm", label: "SolomindLM vs NotebookLM" },
  { path: "/compare", label: "Compare AI study and research tools" },
  { path: "/guides/how-to-study-from-pdfs-with-ai", label: "Study from PDFs with AI" },
] as const;
