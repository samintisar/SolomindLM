import type { BreadcrumbItem } from "@/shared/seo/structuredData";

/** Copy and config for a free no-signup tool page: used by the page, the SEO registry and prerender. */
export type ToolPageConfig = {
  path: string;
  /** Short link label (footer). */
  navLabel: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  intro: string;
  steps: { name: string; text: string }[];
  sections: { heading: string; paragraphs: string[] }[];
  faqs: { question: string; answer: string }[];
  related: { path: string; label: string }[];
};

export const PDF_TO_FLASHCARDS_PAGE: ToolPageConfig = {
  path: "/tools/pdf-to-flashcards",
  navLabel: "PDF to flashcards",
  title: "Free PDF to Flashcards Maker — No Signup, Anki & Quizlet Export | SolomindLM",
  description:
    "Turn a PDF or your notes into flashcards for free, no account needed. Export to Anki, Quizlet or CSV, or save the deck to study with spaced repetition.",
  keywords:
    "pdf to flashcards, flashcard maker, free flashcard maker, ai flashcard generator, notes to flashcards, pdf to anki, pdf to quizlet",
  h1: "Free PDF to Flashcards Maker",
  intro:
    "Drop in a PDF or paste your notes and get a study-ready deck in under a minute. No account, no watermark: export to Anki, Quizlet or CSV.",
  steps: [
    {
      name: "Add your material",
      text: "Upload a PDF with selectable text (up to 40 pages) or paste lecture notes, a chapter or an article.",
    },
    {
      name: "Choose how many cards",
      text: "Pick 10, 20 or 30 cards. The generator mixes question, fill-in-the-blank, true/false, definition and scenario cards.",
    },
    {
      name: "Generate and review",
      text: "Flip through the deck and check every card against your material before you study.",
    },
    {
      name: "Export or keep studying",
      text: "Download an Anki file, copy the deck into Quizlet, save a CSV, or create a free account to study it with spaced repetition.",
    },
  ],
  sections: [
    {
      heading: "Why flashcards made from your own material work",
      paragraphs: [
        "Retrieval practice, answering a question before you see the answer, is one of the most reliable ways to remember what you read. Cards built from your own PDF test the facts, terms and reasoning your course actually covers.",
        "Spaced repetition then brings each card back just before you would forget it. Anki and SolomindLM both schedule reviews this way, so a short daily session keeps the whole deck fresh.",
      ],
    },
    {
      heading: "How to import your deck into Anki",
      paragraphs: [
        "Click Download for Anki to save a .txt file. In Anki, choose File → Import, pick the file, and confirm that the fields map to Front and Back. The file already tells Anki it is tab-separated plain text.",
      ],
    },
    {
      heading: "How to import your deck into Quizlet",
      paragraphs: [
        "Click Copy for Quizlet. In Quizlet, create a study set, choose Import, and paste. Set “Between term and definition” to Tab and “Between cards” to New line.",
      ],
    },
    {
      heading: "What the free tool can and can’t read",
      paragraphs: [
        "The free tool reads the text layer of a PDF in your browser; your file is not uploaded. Scanned pages are images with no text layer, so they come back empty. A free SolomindLM account runs OCR on scanned PDFs and also takes slides, YouTube videos and web pages.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is this flashcard maker really free?",
      answer:
        "Yes. You can make up to three decks a day without an account and export every one of them. A free account adds more decks, OCR for scanned PDFs and spaced-repetition study.",
    },
    {
      question: "Do I need to sign up?",
      answer:
        "No. Generate and export without an account. Sign up only if you want to keep the deck in a notebook and review it on a schedule.",
    },
    {
      question: "Is my PDF uploaded?",
      answer:
        "No. The text is extracted in your browser, and only that text is sent to generate the cards. Nothing is stored unless you choose to save the deck to an account.",
    },
    {
      question: "Can I export to Anki or Quizlet?",
      answer:
        "Yes. Download an Anki-ready text file, copy a Quizlet import, or save a CSV that opens in Excel, Google Sheets, RemNote and most flashcard apps.",
    },
    {
      question: "Why did my PDF produce no text?",
      answer:
        "It is probably a scanned document: the pages are pictures, so there is no text to read. Paste the text instead, or sign up free and add the PDF to a notebook, which runs OCR.",
    },
    {
      question: "How accurate are the cards?",
      answer:
        "Cards are generated from your material and checked for empty sides, duplicates and answers that leak onto the front, but AI can still be wrong. Review the deck before you rely on it.",
    },
  ],
  related: [
    { path: "/students/ai-flashcards", label: "AI flashcards in your notebook" },
    { path: "/students/ai-quizzes", label: "AI quiz generator" },
    { path: "/students", label: "All student tools" },
  ],
};

export const FREE_TOOL_PAGES: ToolPageConfig[] = [PDF_TO_FLASHCARDS_PAGE];

export function getToolPageByPath(path: string): ToolPageConfig | undefined {
  return FREE_TOOL_PAGES.find((page) => page.path === path);
}

/** No /tools index page exists, so the trail is Home → tool. */
export function getToolBreadcrumbItems(page: ToolPageConfig): BreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: page.h1, path: page.path },
  ];
}
