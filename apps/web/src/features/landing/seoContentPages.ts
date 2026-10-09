import { COMPETITOR_COMPARE_PAGES } from "./competitorComparePages";
import type { FAQItem } from "./constants";

export const SEO_CONTENT_LAST_UPDATED = "2026-09-15";

export const COMPARE_HUB_PATH = "/compare";

type SeoContentPageType = "compare" | "compareHub" | "guide";

type SeoContentSection = {
  h2: string;
  paragraphs: string[];
  bullets?: string[];
};

type SeoContentComparisonRow = {
  topic: string;
  solomindlm: string;
  competitor: string;
};

type SeoContentQuickAnswer = {
  chooseSolomindlm: string;
  chooseCompetitor?: string;
};

type SeoContentSource = {
  label: string;
  url: string;
};

type SeoContentRelatedLink = {
  path: string;
  label: string;
  description: string;
};

export type SeoContentPageConfig = {
  path: string;
  pageType: SeoContentPageType;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  /** Phrase inside `h1` shown in the accent colour. */
  h1Accent?: string;
  intro: string;
  /** Competitor named in the quick answer and comparison table header (compare pages). */
  competitorName?: string;
  quickAnswer?: SeoContentQuickAnswer;
  comparisonTable?: SeoContentComparisonRow[];
  sections: SeoContentSection[];
  /** Public pages the competitor claims were checked against, shown under the comparison. */
  sources?: SeoContentSource[];
  /** ISO date the page's facts were last checked; defaults to SEO_CONTENT_LAST_UPDATED. */
  lastUpdated?: string;
  faqs: FAQItem[];
  ctaLabel: string;
  conversionPromise: string;
  breadcrumbParent: { name: string; path: string };
  navLabel: string;
  relatedLinks: SeoContentRelatedLink[];
  articleType: "Article" | "TechArticle";
  changefreq?: "weekly" | "monthly";
  priority?: number;
};

const COMPARE_PAGES = COMPETITOR_COMPARE_PAGES;

const GUIDE_PAGES: SeoContentPageConfig[] = [
  {
    path: "/guides/how-to-study-from-pdfs-with-ai",
    pageType: "guide",
    title: "How to Study From PDFs With AI",
    description:
      "Learn how to turn PDFs, lecture notes, and class readings into flashcards, quizzes, mind maps, audio overviews, and study guides with SolomindLM.",
    keywords:
      "how to study from PDFs with AI, AI flashcards from PDF, turn lecture slides into quizzes, chat with PDF study guide",
    h1: "How to Study From PDFs With AI",
    h1Accent: "With AI",
    intro:
      "The best AI study workflow starts with your own material: textbook chapters, lecture slides, reading packets, and notes. SolomindLM is built for this workflow by letting you upload sources into a notebook, chat with them, and turn them into flashcards, quizzes, written questions with feedback, mind maps, reports, and audio overviews—all grounded in the documents you provide.",
    sections: [
      {
        h2: "Step 1 — Add your source material",
        paragraphs: [
          "Create a notebook and upload textbook PDFs, lecture slides, notes, or other study documents. You can also add discovered web sources alongside class material when you need extra context.",
        ],
        bullets: [
          "Upload PDFs, Word files, PowerPoint slides, images, or audio",
          "Paste text or import transcripts from supported video platforms",
          "Discover web articles to supplement your readings",
        ],
      },
      {
        h2: "Step 2 — Ask grounded questions first",
        paragraphs: [
          "Before generating study aids, ask the notebook to explain difficult sections, define terms, compare ideas, or summarize a chapter from your uploaded sources. This checks whether your source set is complete and helps you understand the material before you memorize outputs.",
        ],
      },
      {
        h2: "Step 3 — Generate the right output for the task",
        paragraphs: [
          "Select the sources you want, then open the Studio tool that matches how you study. Each output is drafted from your materials—you review and edit before relying on it.",
        ],
        bullets: [
          "Flashcards for definitions and recall-heavy subjects",
          "Quizzes for multiple-choice self-testing before exams",
          "Written questions for short-answer and essay practice with feedback on your responses",
          "Mind maps for dense conceptual topics",
          "Reports or study guides for chapter review",
          "Audio overviews for recap-style revision",
        ],
      },
      {
        h2: "Step 4 — Edit before memorizing",
        paragraphs: [
          "Generated study content should be reviewed against the original material before you use it for exams or assignments. Treat AI outputs as drafts built from your sources, not as a substitute for verifying the source text.",
        ],
      },
      {
        h2: "Best workflow by use case",
        paragraphs: [
          "Match the output type to how the class is assessed. The same notebook can support different flows each week.",
        ],
        bullets: [
          "Memorization-heavy class: PDF → flashcards → quiz",
          "Essay or short-answer exams: PDF → written questions → review feedback against sources",
          "Theory-heavy class: PDF + slides → mind map → study guide",
          "Fast revision: readings → audio overview → short quiz",
        ],
      },
      {
        h2: "Why this works better than manual copying",
        paragraphs: [
          "SolomindLM starts from your actual study sources rather than asking you to build everything card by card. That makes it closer to a source-grounded study workflow than a blank flashcard app—you upload once, then branch into the formats you need for each exam.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can AI make flashcards from PDFs?",
        answer:
          "Yes. Upload or paste your PDF into a SolomindLM notebook, select the sources, and generate a flashcard deck. Review and edit each card against the original text before studying.",
      },
      {
        question: "Can I turn lecture slides into quizzes?",
        answer:
          "Yes. Add slide decks to your notebook, select them in Studio, and generate a multiple-choice quiz. Use chat first to clarify confusing slides, then generate the quiz from the same sources.",
      },
      {
        question: "Should I trust AI-generated study materials?",
        answer:
          "Treat them as drafts. SolomindLM grounds outputs in your uploads, but you should verify wording, definitions, and edge cases against the original PDFs before exams or graded work.",
      },
      {
        question: "Do I need to upload sources first?",
        answer:
          "Yes. Studio tools work on sources in your notebook. Add PDFs, slides, or other materials first, then generate flashcards, quizzes, mind maps, and other outputs from the selection you choose.",
      },
      {
        question: "Can I practice essay answers, not just multiple choice?",
        answer:
          "Yes. Use Written Questions in Studio for short-answer and essay prompts grounded in your PDFs, with feedback on responses you submit. Use Quizzes when you specifically want multiple-choice practice.",
      },
    ],
    ctaLabel: "Create free account",
    conversionPromise:
      "Upload your first PDFs and generate study materials in minutes—no credit card required.",
    breadcrumbParent: { name: "Guides", path: "/guides/how-to-study-from-pdfs-with-ai" },
    navLabel: "Study from PDFs with AI",
    relatedLinks: [
      {
        path: "/students/ai-written-questions",
        label: "Written questions with feedback",
        description:
          "Generate short-answer and essay prompts from your PDFs and get feedback on what you write.",
      },
      {
        path: "/students/ai-flashcards",
        label: "AI flashcards",
        description: "Generate and edit flashcard decks from notebook sources.",
      },
      {
        path: "/students/ai-quizzes",
        label: "AI quizzes",
        description: "Build multiple-choice practice from lectures and readings.",
      },
      {
        path: "/compare/solomindlm-vs-notebooklm",
        label: "SolomindLM vs NotebookLM",
        description: "See how written questions with feedback compares to NotebookLM study tools.",
      },
    ],
    articleType: "TechArticle",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/guides/how-to-do-an-ai-literature-review",
    pageType: "guide",
    title: "How to Do an AI Literature Review | SolomindLM",
    description:
      "Learn a source-grounded workflow to build a paper set, screen studies, synthesize themes, and format citations with SolomindLM.",
    keywords:
      "ai for literature review, how to do literature review with AI, ai for research literature review, AI literature review from papers, import DOI BibTeX Zotero",
    h1: "How to use AI for literature review with your papers",
    h1Accent: "with your papers",
    intro:
      "Using AI for literature review works best when you start with a real paper set, not a blank prompt. This guide walks through a practical workflow—discover and import papers, chat across your reading list, run literature review mode, and format citations—while you stay responsible for rigor, inclusion criteria, and final claims. For the product overview, see our AI literature review tool page.",
    sections: [
      {
        h2: "Step 1 — Build the paper set",
        paragraphs: [
          "Start by discovering or importing papers into one research notebook. Scope the topic early so chat and literature review run on a coherent reading list rather than a random pile of PDFs.",
        ],
        bullets: [
          "Discover papers through academic search in SolomindLM",
          "Import via DOI, BibTeX, Zotero, or Mendeley",
          "Upload PDFs directly when you already have files",
        ],
      },
      {
        h2: "Step 2 — Read through chat before synthesis",
        paragraphs: [
          "Use notebook chat to orient yourself before running a full literature review. Ask about themes, disagreements, methods, recurring limitations, and missing angles across the papers you selected.",
        ],
        bullets: [
          "What are the main themes across these papers?",
          "Where do authors disagree on methods or conclusions?",
          "What limitations appear repeatedly?",
          "Which subtopics are under-covered?",
        ],
      },
      {
        h2: "Step 3 — Run literature review mode",
        paragraphs: [
          "When the source set is scoped and cleaned, use AI literature review to synthesize themes and gaps across papers already in the notebook. This step works best after you have removed irrelevant uploads and confirmed the reading list matches your research question.",
        ],
      },
      {
        h2: "Step 4 — Format citations and outputs",
        paragraphs: [
          "Format references in the citation style you need, then turn the notebook into a report or deep research output when you need a longer deliverable. Verify every citation against the original papers and your style guide before submission.",
        ],
      },
      {
        h2: "What AI literature review is good for",
        paragraphs: [
          "AI-assisted literature review helps you move faster on structured note-taking and orientation—not on replacing scholarly judgment.",
        ],
        bullets: [
          "Thematic synthesis across many papers",
          "Faster orientation in a new field",
          "Drafting structured review notes",
          "Finding gaps or under-covered subtopics",
        ],
      },
      {
        h2: "What it is not",
        paragraphs: [
          "SolomindLM is not a substitute for a preregistered or fully systematic review protocol. It does not replace manual judgment on paper quality, inclusion criteria, or claims evaluation. Use it to accelerate reading and drafting while you retain responsibility for methodology and conclusions.",
        ],
      },
      {
        h2: "How to avoid overreliance on AI in literature review",
        paragraphs: [
          "Treat every AI synthesis as a draft. Spot-check quotes and claims against original PDFs, keep a manual log of inclusion decisions, and use chat to question the reading list—not only to confirm what you already believe. AI literature review tools speed orientation and note-taking; they do not remove your responsibility for methods and conclusions.",
        ],
      },
    ],
    faqs: [
      {
        question: "How do I use AI for literature review responsibly?",
        answer:
          "Start with a scoped paper set, verify AI summaries against originals, document which papers you included or excluded, and edit synthesis drafts before submission. Use AI to orient and draft—not to replace reading or methodological judgment.",
      },
      {
        question: "Can AI summarize multiple papers?",
        answer:
          "Yes. Add papers to a notebook, then use chat or literature review mode to summarize themes, methods, and gaps across the set. Always verify summaries against the original PDFs.",
      },
      {
        question: "Is SolomindLM a systematic review tool?",
        answer:
          "No. It supports AI-assisted literature review and synthesis, but not preregistered systematic review protocols, screening workflows, or meta-analysis. Use it to orient and draft—not as a replacement for formal systematic methods.",
      },
      {
        question: "Can I import papers from Zotero or DOI?",
        answer:
          "Yes. SolomindLM supports imports from DOI, BibTeX, Zotero, and Mendeley into research notebooks alongside direct PDF uploads.",
      },
      {
        question: "Can I chat with my reading list?",
        answer:
          "Yes. Notebook chat answers questions grounded in the papers you added—useful for comparing methods, finding disagreements, and checking whether your source set is complete before synthesis.",
      },
    ],
    ctaLabel: "Start a research notebook",
    conversionPromise:
      "Import your reading list and run your first literature review synthesis in minutes.",
    breadcrumbParent: { name: "Guides", path: "/guides/how-to-do-an-ai-literature-review" },
    navLabel: "AI literature review guide",
    relatedLinks: [
      {
        path: "/research/ai-literature-review",
        label: "AI literature review",
        description: "Product overview for synthesizing themes across papers.",
      },
      {
        path: "/research/import-papers",
        label: "Import papers",
        description: "Bring in DOI, BibTeX, Zotero, and Mendeley libraries.",
      },
      {
        path: "/research",
        label: "Research tools",
        description: "Full research workflow hub.",
      },
    ],
    articleType: "TechArticle",
    changefreq: "monthly",
    priority: 0.8,
  },
];

const COMPARE_HUB_PAGE: SeoContentPageConfig = {
  path: COMPARE_HUB_PATH,
  pageType: "compareHub",
  title: "Compare SolomindLM With AI Research and Study Tools",
  description:
    "Side-by-side comparisons of SolomindLM with NotebookLM (Gemini Notebook), Elicit, Consensus, SciSpace, ChatPDF, Humata, STORM, Quizlet, and Perplexity.",
  keywords:
    "NotebookLM alternatives, Elicit alternatives, best AI tools for literature review, AI study tool comparison, ChatPDF alternative, Quizlet alternative",
  h1: "How SolomindLM compares with other AI research and study tools",
  h1Accent: "other AI research and study tools",
  intro:
    "Each comparison below puts SolomindLM next to one other tool, with a feature table, the cases where the other tool is the better pick, and links to the public pages we checked. Use them to match a tool to the job: studying from your own course material, reviewing academic literature, chatting with a few PDFs, or answering questions from the web.",
  sections: [
    {
      h2: "Which tool fits which job?",
      paragraphs: [
        "These tools overlap less than their marketing suggests. Start from the job you need done, then read the comparison for the tools that fit it.",
      ],
      bullets: [
        "Study from your own PDFs, slides, and notes: SolomindLM, Gemini Notebook (formerly NotebookLM), Quizlet",
        "Search and screen academic papers: SolomindLM, Elicit, Consensus, SciSpace",
        "Ask questions of a handful of documents: ChatPDF, Humata, SolomindLM",
        "Get cited answers from the open web: Perplexity",
        "Draft a Wikipedia-style overview of a topic from web sources: STORM",
      ],
    },
    {
      h2: "What SolomindLM is built for",
      paragraphs: [
        "SolomindLM keeps your sources in a notebook and answers from them with citations. From the same notebook you can search academic databases, import papers by DOI or BibTeX, run a literature review with visible screening counts, and turn the material into flashcards, quizzes, written questions with feedback, mind maps, reports, and audio overviews.",
        "It is not a reference manager, a full systematic-review platform, or a general web search engine. The comparisons say where another tool does those jobs better.",
      ],
    },
  ],
  faqs: [
    {
      question: "Which AI tools answer only from my own sources?",
      answer:
        "Notebook tools such as SolomindLM and Gemini Notebook (formerly NotebookLM), and document-chat tools such as ChatPDF and Humata, answer from files you upload and cite them. Perplexity and STORM answer mainly from the web, and Elicit, Consensus, and SciSpace answer mainly from their academic paper indexes.",
    },
    {
      question: "Which AI tool is best for a literature review?",
      answer:
        "For a formal systematic review with large-scale screening, Elicit is the most complete. For quick evidence answers, Consensus is fast. SolomindLM fits a student or researcher who wants search, screening counts, an evidence table, and a written review with formatted citations in the same notebook as their own PDFs, at a lower price.",
    },
    {
      question: "How are these comparisons kept accurate?",
      answer:
        "Each page lists the competitor's public pages we checked and the date we checked them. We only state what those pages say; where a feature or price could not be confirmed, the page says so or leaves it out. Plans change often, so check the other tool's site before you buy.",
    },
    {
      question: "Is SolomindLM free to try?",
      answer:
        "Yes. The free plan includes notebooks, sources per notebook, and daily generation limits, with no credit card required. Pro raises those limits.",
    },
  ],
  ctaLabel: "Try SolomindLM free",
  conversionPromise: "Try SolomindLM free with your own PDFs, papers, and lecture notes.",
  breadcrumbParent: { name: "Home", path: "/" },
  navLabel: "Compare",
  relatedLinks: COMPARE_PAGES.map((page) => ({
    path: page.path,
    label: page.navLabel,
    description: page.description,
  })),
  articleType: "Article",
  changefreq: "monthly",
  priority: 0.8,
};

export const SEO_CONTENT_PAGES: SeoContentPageConfig[] = [
  COMPARE_HUB_PAGE,
  ...COMPARE_PAGES,
  ...GUIDE_PAGES,
];

export type SeoContentBreadcrumbItem = {
  name: string;
  path: string;
};

export function getSeoContentPageByPath(path: string): SeoContentPageConfig | undefined {
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return SEO_CONTENT_PAGES.find((page) => page.path === normalized);
}

export function getSeoContentPaths(): string[] {
  return SEO_CONTENT_PAGES.map((page) => page.path);
}

export function getComparisonPages(): SeoContentPageConfig[] {
  return SEO_CONTENT_PAGES.filter((page) => page.pageType === "compare");
}

export function getGuidePages(): SeoContentPageConfig[] {
  return SEO_CONTENT_PAGES.filter((page) => page.pageType === "guide");
}

export function getSeoContentBreadcrumbItems(
  page: SeoContentPageConfig
): SeoContentBreadcrumbItem[] {
  const guideHubPath = "/guides/how-to-study-from-pdfs-with-ai";
  const compareCrumb = { name: "Compare", path: COMPARE_HUB_PATH };

  if (page.pageType === "compareHub") {
    return [{ name: "Home", path: "/" }, compareCrumb];
  }

  if (page.pageType === "compare") {
    return [{ name: "Home", path: "/" }, compareCrumb, { name: page.navLabel, path: page.path }];
  }

  return [
    { name: "Home", path: "/" },
    { name: "Guides", path: guideHubPath },
    { name: page.navLabel, path: page.path },
  ];
}

export function getSeoContentLastUpdated(page: SeoContentPageConfig): string {
  return page.lastUpdated ?? SEO_CONTENT_LAST_UPDATED;
}
