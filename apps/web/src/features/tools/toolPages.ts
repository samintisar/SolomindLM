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

export const PRISMA_FLOW_DIAGRAM_PAGE: ToolPageConfig = {
  path: "/tools/prisma-flow-diagram",
  navLabel: "PRISMA flow diagram",
  title: "Free PRISMA 2020 Flow Diagram Generator — No Signup, SVG & PNG | SolomindLM",
  description:
    "Make a PRISMA 2020 flow diagram for your systematic review in the browser. Type your counts, check the arithmetic, and download SVG or PNG. Free, no account.",
  keywords:
    "prisma flow diagram generator, prisma 2020 flow diagram, prisma diagram maker, prisma flowchart, systematic review flow diagram, prisma template",
  h1: "Free PRISMA 2020 Flow Diagram Generator",
  intro:
    "Type the counts from your search and screening, and the diagram draws itself in the PRISMA 2020 layout. Download it as SVG or PNG for your manuscript. Free, no account, nothing uploaded.",
  steps: [
    {
      name: "Enter what your searches found",
      text: "Add the records from databases and registers, and the duplicates and other records you removed before screening.",
    },
    {
      name: "Add screening and eligibility",
      text: "Fill in records screened and excluded, reports sought, not retrieved and assessed, and name each reason for excluding reports.",
    },
    {
      name: "Check the warnings",
      text: "If a box doesn't add up, a note under the field shows the arithmetic. The diagram always draws exactly what you typed.",
    },
    {
      name: "Download or share",
      text: "Download an SVG for print or a PNG for slides, or copy a link that reopens your diagram.",
    },
  ],
  sections: [
    {
      heading: "What goes in each box",
      paragraphs: [
        "Identification counts the records your searches returned and the records removed before screening: duplicates, records an automation tool marked ineligible, and records removed for other reasons.",
        "Screening follows records through title and abstract screening, then reports through full-text retrieval and eligibility assessment. Every report you exclude at eligibility needs a reason. Included gives the number of studies in the review and the reports of those studies.",
      ],
    },
    {
      heading: "Databases and registers, or other methods too",
      paragraphs: [
        "Switch on other methods if you also found studies through websites, organisations or citation searching. The diagram adds a second column for them, and both columns feed the same Included box.",
      ],
    },
    {
      heading: "PRISMA 2020 versus PRISMA 2009",
      paragraphs: [
        "PRISMA 2020 separates records (titles and abstracts) from reports (full-text documents), adds study registers, adds the optional other-methods column, and asks for the records removed before screening by type. If your journal still asks for the 2009 diagram, check its author instructions.",
      ],
    },
    {
      heading: "Using the diagram in your manuscript",
      paragraphs: [
        "SVG stays sharp at any size and opens in Word, PowerPoint, Inkscape and Illustrator. PNG is exported at twice the on-screen size. Cite the template as Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71.",
        "The diagram is a reporting aid: drawing it doesn't make a review follow the PRISMA statement. Report the full checklist alongside it.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is this PRISMA flow diagram generator free?",
      answer: "Yes. Make and download as many diagrams as you like. No account, no watermark.",
    },
    {
      question: "Are my numbers uploaded?",
      answer:
        "No. The diagram is drawn in your browser. Your counts are kept in the part of the link after #, which browsers never send to a server.",
    },
    {
      question: "Which PRISMA template does it use?",
      answer:
        "The PRISMA 2020 flow diagram for new systematic reviews, with databases and registers only or with other methods as well. The templates for updated reviews are not supported yet.",
    },
    {
      question: "Can I edit the diagram after downloading it?",
      answer:
        "Yes. The SVG keeps every box and line as an editable shape in Inkscape, Illustrator or PowerPoint. To change a count, it is usually quicker to reopen your link and download again.",
    },
    {
      question: "How do I cite the PRISMA 2020 template?",
      answer:
        "Page MJ, McKenzie JE, Bossuyt PM, et al. The PRISMA 2020 statement: an updated guideline for reporting systematic reviews. BMJ 2021;372:n71. The template is licensed CC BY 4.0.",
    },
    {
      question: "Why does a box show a warning?",
      answer:
        "Its count doesn't match the arithmetic of the boxes above it, for example records screened should equal records identified minus records removed. The warning is a check, not a block: fix the number or leave it if your review counted differently.",
    },
  ],
  related: [
    { path: "/research/ai-literature-review", label: "AI literature review with screening" },
    { path: "/research/academic-paper-discovery", label: "Find papers for your review" },
    { path: "/compare", label: "Compare research tools" },
  ],
};

export const FREE_TOOL_PAGES: ToolPageConfig[] = [PDF_TO_FLASHCARDS_PAGE, PRISMA_FLOW_DIAGRAM_PAGE];

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
