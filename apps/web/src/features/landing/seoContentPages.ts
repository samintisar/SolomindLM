import type { FAQItem } from "./constants";

export const SEO_CONTENT_LAST_UPDATED = "2026-06-07";

export type SeoContentPageType = "compare" | "guide";

export type SeoContentSection = {
  h2: string;
  paragraphs: string[];
  bullets?: string[];
};

export type SeoContentComparisonRow = {
  topic: string;
  solomindlm: string;
  competitor: string;
};

export type SeoContentQuickAnswer = {
  chooseSolomindlm: string;
  chooseCompetitor?: string;
};

export type SeoContentRelatedLink = {
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
  intro: string;
  quickAnswer?: SeoContentQuickAnswer;
  comparisonTable?: SeoContentComparisonRow[];
  sections: SeoContentSection[];
  faqs: FAQItem[];
  ctaLabel: string;
  conversionPromise: string;
  signupIntentKey: string;
  breadcrumbParent: { name: string; path: string };
  navLabel: string;
  relatedLinks: SeoContentRelatedLink[];
  articleType: "Article" | "TechArticle";
  changefreq?: "weekly" | "monthly";
  priority?: number;
};

export const SEO_CONTENT_PAGES: SeoContentPageConfig[] = [
  {
    path: "/compare/solomindlm-vs-notebooklm",
    pageType: "compare",
    title: "SolomindLM vs NotebookLM: Which AI Research and Study Tool Fits Your Workflow?",
    description:
      "Compare SolomindLM and NotebookLM for studying from PDFs, source-grounded chat, flashcards, quizzes, literature review, and deep research workflows.",
    keywords:
      "SolomindLM vs NotebookLM, NotebookLM alternative, best AI study tool for PDFs, AI research tool flashcards literature review",
    h1: "SolomindLM vs NotebookLM",
    intro:
      "SolomindLM and NotebookLM both deliver strong source-grounded chat with citations and synthesis from your own materials—not general web AI alone. NotebookLM leans into Google's ecosystem and study features such as Audio Overviews, Video Overviews, and the Learning Guide. SolomindLM differentiates with notebook folders, web and academic discovery, literature review with twelve citation styles, chat search across external sources, multiple model choices, and study tools such as written questions with feedback and spaced-repetition flashcards.",
    quickAnswer: {
      chooseCompetitor:
        "Choose NotebookLM if you want Google's ecosystem integration plus Audio Overviews, Video Overviews, flashcards, quizzes, reports, and the Learning Guide AI tutor on top of source-grounded chat with citations.",
      chooseSolomindlm:
        "Choose SolomindLM if you want source-grounded chat with citations plus folders for notebooks, web and academic source discovery, literature review with twelve citation styles, chat search with one-click save to your notebook, a model switcher, voice input in chat, audio transcription, written questions with feedback, spaced-repetition flashcards, editable reports, and academic import workflows.",
    },
    comparisonTable: [
      {
        topic: "Source-grounded chat",
        solomindlm:
          "Source-grounded chat with citations across notebook sources; RAG-backed answers and Studio outputs synthesized from your uploads.",
        competitor:
          "Source-grounded chat with citations against uploaded sources; synthesis and study outputs from the same materials.",
      },
      {
        topic: "Student outputs",
        solomindlm:
          "Flashcards with spaced repetition, quizzes, mind maps, audio overviews, editable reports, infographics, spreadsheets.",
        competitor:
          "Audio Overviews, Video Overviews, flashcards, quizzes, mind maps, reports, infographics, Learning Guide.",
      },
      {
        topic: "Written questions",
        solomindlm:
          "Short-answer and essay prompts from your sources with AI feedback on responses you submit—not multiple-choice only.",
        competitor:
          "Quizzes and the Learning Guide AI tutor; no written-response practice with feedback on product pages.",
      },
      {
        topic: "Research workflows",
        solomindlm:
          "Academic paper discovery, import papers, AI literature review, deep research, and formatted citations in multiple styles.",
        competitor:
          "Source discovery, Deep Research, and literature review synthesis on its plans and product pages.",
      },
      {
        topic: "Literature review citations",
        solomindlm:
          "Twelve citation styles—including APA, MLA, Chicago, IEEE, Vancouver, and Harvard—for literature reviews, reports, and the Cite Paper modal.",
        competitor:
          "No multi-style academic citation formatting for literature review outputs described on product pages.",
      },
      {
        topic: "Notebook organization",
        solomindlm: "Organize notebooks in folders and move them between folders.",
        competitor: "No equivalent folder organization described on official product pages.",
      },
      {
        topic: "Source discovery",
        solomindlm:
          "Built-in web and academic discovery with results you can add directly to notebooks.",
        competitor:
          "Emphasizes uploads and plan-tier source discovery rather than the same web plus academic discovery workflow.",
      },
      {
        topic: "Chat search & models",
        solomindlm:
          "Optional web and academic search in chat; save external hits to the notebook; multiple model choices; voice transcription in chat.",
        competitor:
          "Google's model stack only; no model switcher, in-chat web/academic search, or voice input called out on product pages.",
      },
      {
        topic: "Audio & source panel",
        solomindlm:
          "Upload audio for transcription; delete and refresh sources from the source panel.",
        competitor:
          "No audio ingestion or source-panel delete and refresh workflow described on product pages.",
      },
      {
        topic: "Academic import",
        solomindlm: "DOI, BibTeX, Zotero, and Mendeley import into research notebooks.",
        competitor:
          "Official pages emphasize uploads and source discovery rather than academic reference-manager imports.",
      },
      {
        topic: "Pricing model",
        solomindlm:
          "Free ($0): 5 notebooks, 200 sources per notebook, daily generation caps. Pro ($7.50/mo billed yearly or $15/mo monthly): 100 notebooks, 200 sources per notebook, higher daily limits.",
        competitor:
          "Free, Plus, Pro, and Ultra tiers; source limits of 50, 100, 300, and 600 per notebook respectively.",
      },
      {
        topic: "Best fit",
        solomindlm:
          "Students and researchers who want grounded synthesis with citations plus folders, discovery, and academic workflows.",
        competitor:
          "Users anchored in Google Workspace who want Google's study features on top of grounded chat.",
      },
    ],
    sections: [
      {
        h2: "What do SolomindLM and NotebookLM have in common?",
        paragraphs: [
          "Both tools are built around source-grounded AI with citations: you add documents, ask questions, and get answers and outputs that refer back to those materials rather than inventing facts from general training data alone.",
          "Each supports study-oriented outputs such as flashcards, quizzes, mind maps, audio-style recaps, reports, and infographics. Both are useful when you need to review course readings or research papers inside a dedicated workspace instead of copying text into a blank chat window.",
        ],
      },
      {
        h2: "When is SolomindLM the better choice?",
        paragraphs: [
          "SolomindLM fits when your workflow needs more than upload-and-chat inside one Google stack. It combines notebook folders, built-in discovery, flexible chat search, and study and research tools that NotebookLM does not emphasize on its product pages.",
        ],
        bullets: [
          "You want notebooks organized in folders and moved between them",
          "You need web or academic discovery with one-click add to a notebook",
          "You want web or academic search in chat and to save external sources from chat into the notebook",
          "You prefer choosing among multiple models instead of a single Google model stack",
          "You need voice transcription in chat or audio file ingestion with transcription",
          "You want written questions with feedback on your answers—a standout SolomindLM feature",
          "You want flashcards with a spaced-repetition study mode",
          "You need to edit generated reports in place",
          "You want delete and refresh controls in the source panel",
          "You need DOI, BibTeX, Zotero, or Mendeley imports for a reading list",
          "You need literature review outputs with references formatted in APA, MLA, Chicago, IEEE, Vancouver, Harvard, or other academic styles",
        ],
      },
      {
        h2: "What sets SolomindLM apart?",
        paragraphs: [
          "Both products generate flashcards, quizzes, mind maps, reports, infographics, and spreadsheets from sources. The meaningful differences are workflow depth and control—not a longer list of output types.",
        ],
        bullets: [
          "Notebook folders: group notebooks and move them between folders",
          "Written questions with feedback on short and essay answers",
          "Flashcards with spaced-repetition review",
          "Editable reports after generation",
          "Web and academic source discovery built into the app",
          "Web and academic search in chat, with external sources easy to add to the notebook",
          "Model switcher across multiple models",
          "Voice transcription in chat and audio source ingestion",
          "Delete and refresh options in the source panel",
          "Academic import via DOI, BibTeX, Zotero, and Mendeley",
          "Twelve citation styles for literature reviews and reports (APA, MLA, Chicago, IEEE, Vancouver, Harvard, and more)",
        ],
      },
      {
        h2: "When is NotebookLM the better choice?",
        paragraphs: [
          "NotebookLM is a strong fit when you already live in Google Workspace, want polished source-grounded chat with citations, and plan to use Google's study features such as Audio Overviews, Video Overviews, and the Learning Guide—a personal AI tutor that uses probing questions and adapts explanations to your learning style—on supported plans.",
          "If your workflow is mostly upload → chat → generate study aids inside Google's ecosystem, NotebookLM's integration advantages may outweigh a separate notebook product.",
        ],
      },
      {
        h2: "Which tool is better for students?",
        paragraphs: [
          "For students, the better tool depends on scope. Both offer strong grounded chat with citations from uploads. NotebookLM adds Video Overviews and the Learning Guide AI tutor on supported plans. SolomindLM differentiates with written questions with feedback, spaced-repetition flashcards, notebook folders, in-app discovery, chat search that saves sources to your notebook, voice input, and editable reports.",
          "Neither replaces reviewing your original PDFs before exams. Pick the tool whose outputs match how you actually study.",
        ],
      },
      {
        h2: "Which tool is better for literature review?",
        paragraphs: [
          "SolomindLM is designed for research notebooks with academic discovery, paper import, chat across papers, and dedicated literature review mode—with twelve citation styles (APA, MLA, Chicago, IEEE, Vancouver, Harvard, and more) for formatted references in reviews and reports. NotebookLM offers source discovery, Deep Research, and literature review synthesis, but does not offer the same multi-style citation formatting for literature review deliverables.",
          "For a reading-list-first literature review where you need import, synthesis, and field-appropriate citations, SolomindLM is the closer match. For exploratory synthesis from mixed uploads inside Google, NotebookLM remains competitive.",
        ],
      },
      {
        h2: "Which tool is better for studying from PDFs?",
        paragraphs: [
          "Both handle PDF-grounded study well. Upload chapters or lecture slides, ask clarifying questions, then generate flashcards or quizzes. Each can also produce mind maps, audio recaps, reports, and infographics from the same sources.",
          "NotebookLM adds Video Overviews and the Learning Guide AI tutor on supported plans. SolomindLM adds written questions with feedback, spaced-repetition flashcards, voice and audio ingestion, discovery and chat search workflows, and editable reports—pick based on control and workflow fit, not on who lists more output types.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is SolomindLM a NotebookLM alternative?",
        answer:
          "Yes, for many workflows. Both support source-grounded chat with citations. SolomindLM is the stronger fit when you also need folders, web and academic discovery, chat search with save-to-notebook, multiple models, written questions with feedback, spaced-repetition flashcards, editable reports, and academic imports. NotebookLM remains the better fit if you prioritize Google's ecosystem, Video Overviews, and the Learning Guide AI tutor.",
      },
      {
        question: "Which tool is better for students?",
        answer:
          "Both handle grounded chat with citations well. NotebookLM adds Video Overviews and the Learning Guide AI tutor on supported plans. SolomindLM fits students who want written questions with feedback, spaced-repetition flashcards, discovery and chat search workflows, voice input, notebook folders, and editable reports. Compare workflows against how you actually study—not just output checklists.",
      },
      {
        question: "Which tool is better for literature review?",
        answer:
          "SolomindLM is built for research notebooks with paper discovery, DOI and reference-manager import, AI literature review, and twelve citation styles for formatted references in reviews and reports. NotebookLM supports discovery, Deep Research, and literature review synthesis but does not offer the same multi-style citation formatting or academic import workflow.",
      },
      {
        question: "Does NotebookLM have written questions with feedback?",
        answer:
          "NotebookLM offers quizzes and the Learning Guide AI tutor, but its product pages do not describe short-answer or essay practice with feedback on your written responses. SolomindLM's Written Questions tool generates prompts from your sources and gives feedback on what you submit—useful when exams require written answers, not only multiple choice.",
      },
    ],
    ctaLabel: "Try SolomindLM free",
    conversionPromise: "Try SolomindLM free with your own PDFs, papers, and lecture materials.",
    signupIntentKey: "sourceUpload",
    breadcrumbParent: { name: "Compare", path: "/compare/solomindlm-vs-notebooklm" },
    navLabel: "SolomindLM vs NotebookLM",
    relatedLinks: [
      {
        path: "/students/ai-written-questions",
        label: "Written questions with feedback",
        description:
          "Practice short-answer and essay responses from your sources—SolomindLM grades your answers, not just multiple choice.",
      },
      {
        path: "/guides/how-to-study-from-pdfs-with-ai",
        label: "How to study from PDFs with AI",
        description:
          "Step-by-step workflow for turning readings into flashcards, quizzes, and study guides.",
      },
      {
        path: "/students/ai-flashcards",
        label: "AI flashcards",
        description: "Generate flashcard decks grounded in your uploaded sources.",
      },
      {
        path: "/research/ai-literature-review",
        label: "AI literature review",
        description: "Synthesize themes and gaps across papers in a research notebook.",
      },
    ],
    articleType: "TechArticle",
    changefreq: "monthly",
    priority: 0.85,
  },
  {
    path: "/guides/how-to-study-from-pdfs-with-ai",
    pageType: "guide",
    title: "How to Study From PDFs With AI",
    description:
      "Learn how to turn PDFs, lecture notes, and class readings into flashcards, quizzes, mind maps, audio overviews, and study guides with SolomindLM.",
    keywords:
      "how to study from PDFs with AI, AI flashcards from PDF, turn lecture slides into quizzes, chat with PDF study guide",
    h1: "How to Study From PDFs With AI",
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
    signupIntentKey: "flashcards",
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
    title: "How to Do an AI Literature Review With Your Papers",
    description:
      "Learn how to discover papers, import sources, chat with your reading list, and synthesize themes and gaps with SolomindLM's AI literature review workflow.",
    keywords:
      "how to do literature review with AI, AI literature review from papers, chat with papers synthesize themes, import DOI BibTeX Zotero literature review",
    h1: "How to Do an AI Literature Review With Your Papers",
    intro:
      "A useful AI literature review workflow starts with a real paper set, not a generic prompt. SolomindLM supports research notebooks with academic paper discovery, paper import, chat with papers, citation styles, literature review, and deep research workflows—so synthesis stays grounded in the sources you add.",
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
    ],
    faqs: [
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
    signupIntentKey: "literatureReview",
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

export function isSeoContentPath(path: string): boolean {
  return getSeoContentPageByPath(path) !== undefined;
}

export function getSeoContentBreadcrumbItems(
  page: SeoContentPageConfig
): SeoContentBreadcrumbItem[] {
  const compareHubPath = "/compare/solomindlm-vs-notebooklm";
  const guideHubPath = "/guides/how-to-study-from-pdfs-with-ai";

  if (page.pageType === "compare") {
    return [
      { name: "Home", path: "/" },
      { name: "Compare", path: compareHubPath },
      { name: page.navLabel, path: page.path },
    ];
  }

  return [
    { name: "Home", path: "/" },
    { name: "Guides", path: guideHubPath },
    { name: page.navLabel, path: page.path },
  ];
}
