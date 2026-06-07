import type { FAQItem } from "./constants";

export type IntentLandingCluster = "students" | "research";

export type IntentLandingPageConfig = {
  path: string;
  cluster: IntentLandingCluster;
  intentKey: string;
  title: string;
  description: string;
  keywords: string;
  h1: string;
  subheadline: string;
  conversionPromise: string;
  proofBullets: string[];
  sourceToOutput: { source: string; output: string };
  faqs: FAQItem[];
  ctaLabel: string;
  navLabel: string;
  changefreq?: "weekly" | "monthly";
  priority?: number;
};

export const FEATURE_INTENT_PATHS: Partial<Record<string, string>> = {
  audio: "/students/ai-audio-overview",
  mindmap: "/students/ai-mind-maps",
  reports: "/students/ai-reports",
  flashcards: "/students/ai-flashcards",
  quiz: "/students/ai-quizzes",
  infographic: "/students/ai-infographics",
  writtenQuestions: "/students/ai-written-questions",
  spreadsheets: "/students/ai-spreadsheets",
  literatureReview: "/research/ai-literature-review",
  chat: "/research/chat-with-papers",
  deepResearch: "/research/deep-research",
  sourceUpload: "/students/upload-sources",
  sourceDiscovery: "/students/discover-sources",
  academicDiscovery: "/research/academic-paper-discovery",
  paperImport: "/research/import-papers",
  citationStyles: "/research/citation-styles",
  notebookSharing: "/students/share-notebooks",
};

export const INTENT_LANDING_PAGES: IntentLandingPageConfig[] = [
  {
    path: "/students/upload-sources",
    cluster: "students",
    intentKey: "sourceUpload",
    title: "Upload Study Sources | SolomindLM",
    description:
      "Add PDFs, Word docs, slides, images, audio, video transcripts, Google Drive files, or pasted text to your notebook. Build one place for all your course materials.",
    keywords:
      "upload PDF, study sources, YouTube transcript, Google Drive, paste text, course materials",
    h1: "Upload all your study sources in one place",
    subheadline:
      "Bring lectures, readings, and media into a notebook so you can search, chat, and generate study materials from your own content.",
    conversionPromise:
      "Start a free account and add your first sources in minutes—no credit card required.",
    proofBullets: [
      "Supports PDF, Word, PowerPoint, images, and audio files",
      "Import transcripts from YouTube, TikTok, Instagram, and X",
      "Connect Google Drive or paste text directly",
      "Organize sources inside notebooks and folders",
    ],
    sourceToOutput: {
      source: "A folder of lecture PDFs and a YouTube recap",
      output: "Searchable sources ready for flashcards, quizzes, and chat",
    },
    faqs: [
      {
        question: "What file types can I upload?",
        answer:
          "You can upload PDFs, Word documents, PowerPoint slides, images, and audio files. You can also paste plain text or import content from supported video and social platforms as transcripts.",
      },
      {
        question: "Can I import from Google Drive?",
        answer:
          "Yes. You can connect Google Drive to pull files into your notebook without downloading them to your device first.",
      },
      {
        question: "Is there a limit on how many sources I can add?",
        answer:
          "Free accounts include notebooks with a per-notebook source limit. Pro plans raise notebook limits. See the pricing page for current caps.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Upload Sources",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/students/discover-sources",
    cluster: "students",
    intentKey: "sourceDiscovery",
    title: "Discover Web Sources for Study | SolomindLM",
    description:
      "Find web and news articles to add to your notebook. Search general web or finance-focused channels and import up to 20 results per search.",
    keywords: "discover sources, web search, news articles, study research, finance news",
    h1: "Discover web and news sources for your notebook",
    subheadline:
      "Search the web or news channels, preview results, and add relevant pages to your notebook for reading and generation.",
    conversionPromise:
      "Create a free account to run discovery searches and save sources alongside your uploads.",
    proofBullets: [
      "Search general web or news-focused channels",
      "Finance channel option for market and business topics",
      "Preview results before adding to your notebook",
      "Up to 20 results per discovery search",
    ],
    sourceToOutput: {
      source: "A topic query on climate policy in the news channel",
      output: "Up to 20 imported articles ready to summarize or quiz",
    },
    faqs: [
      {
        question: "How many results can I import at once?",
        answer:
          "Each discovery search returns up to 20 results. You choose which items to add to your notebook.",
      },
      {
        question: "What is the finance channel?",
        answer:
          "The finance channel focuses discovery on business and market news sources, useful for economics and finance coursework.",
      },
      {
        question: "Do discovered pages become full sources in my notebook?",
        answer:
          "Yes. Selected results are added as sources you can read, search, and use for chat and studio generation like uploaded files.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Discover Sources",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/students/share-notebooks",
    cluster: "students",
    intentKey: "notebookSharing",
    title: "Share Notebooks with Classmates | SolomindLM",
    description:
      "Share notebooks with coworkers via view links or let others fork a copy. Revoke access when you no longer want to share.",
    keywords: "share notebook, study group, fork notebook, collaborate, revoke link",
    h1: "Share notebooks with classmates or study groups",
    subheadline:
      "Send a link for view-only access or let others fork their own copy. You stay in control and can revoke sharing anytime.",
    conversionPromise: "Sign up free to create a notebook and generate your first share link.",
    proofBullets: [
      "Cowork links for view-only access to your notebook",
      "Fork links so others get their own editable copy",
      "Revoke sharing when the project ends",
      "Shared viewers see sources and content you have already added",
    ],
    sourceToOutput: {
      source: "Your shared course notebook with readings and notes",
      output: "A link classmates can open or fork into their account",
    },
    faqs: [
      {
        question: "What is the difference between cowork and fork links?",
        answer:
          "Cowork links let others view your notebook. Fork links create a separate copy in their account that they can edit without changing yours.",
      },
      {
        question: "Can I stop sharing later?",
        answer:
          "Yes. You can revoke a share link at any time. Revoked links no longer grant access.",
      },
      {
        question: "Do shared users need their own account?",
        answer:
          "Viewers typically need an account to open shared notebooks. Forking always requires signing in so the copy is saved to their workspace.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Share Notebooks",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/students/ai-flashcards",
    cluster: "students",
    intentKey: "flashcards",
    title: "AI Flashcards from Your Sources | SolomindLM",
    description:
      "Generate flashcard decks grounded in your uploaded sources. Review the draft deck and edit cards before you study.",
    keywords: "AI flashcards, study cards, spaced repetition, PDF flashcards, exam prep",
    h1: "AI flashcards built from your sources",
    subheadline:
      "Turn readings and lectures into a draft deck you can review, edit, and study inside your notebook.",
    conversionPromise:
      "Create a free account, upload a source, and generate your first flashcard deck.",
    proofBullets: [
      "Cards are drafted from content in your notebook",
      "Review and edit the deck before studying",
      "Flip cards in the built-in study view",
      "Regenerate or refine when your materials change",
    ],
    sourceToOutput: {
      source: "A chapter PDF and lecture slides",
      output: "A draft flashcard deck with front and back pairs",
    },
    faqs: [
      {
        question: "Can I edit cards after generation?",
        answer:
          "Yes. The deck opens as a draft so you can change wording, remove cards, or add your own before studying.",
      },
      {
        question: "Are flashcards tied to my uploaded sources?",
        answer:
          "Generation uses the sources you select in the notebook, so cards reflect your materials rather than generic topics.",
      },
      {
        question: "Do I need to review the deck before studying?",
        answer:
          "We recommend reviewing the draft. Automated cards can miss nuance or include wording you want to adjust for your course.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Flashcards",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/students/ai-quizzes",
    cluster: "students",
    intentKey: "quiz",
    title: "AI Multiple-Choice Quizzes | SolomindLM",
    description:
      "Create multiple-choice quizzes from your sources. Set question count, difficulty, and focus areas. Separate from the Written Questions tool for short and essay answers.",
    keywords: "AI quiz, multiple choice, practice test, exam prep, study quiz",
    h1: "Multiple-choice quizzes from your study materials",
    subheadline:
      "Generate practice quizzes with configurable count, difficulty, and topic focus—all multiple-choice, distinct from written-response practice.",
    conversionPromise: "Start free and build a practice quiz from your next reading assignment.",
    proofBullets: [
      "Multiple-choice questions only",
      "Choose question count, difficulty, and focus topics",
      "Grounded in sources you select in the notebook",
      "Different tool from Written Questions for essays and short answers",
    ],
    sourceToOutput: {
      source: "Unit notes and a textbook section",
      output: "A multiple-choice quiz with answer key for self-check",
    },
    faqs: [
      {
        question: "Does the quiz tool support short-answer or essay questions?",
        answer:
          "No. This tool creates multiple-choice quizzes only. For short and essay practice with feedback, use Written Questions in Studio.",
      },
      {
        question: "Can I control how hard the quiz is?",
        answer:
          "Yes. You can set difficulty and how many questions to generate, plus optional focus areas within your sources.",
      },
      {
        question: "Should I verify answers before relying on them?",
        answer:
          "Yes. Review generated quizzes against your materials, especially for high-stakes exams. Automated questions can occasionally be imprecise.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Quizzes",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/students/ai-audio-overview",
    cluster: "students",
    intentKey: "audio",
    title: "AI Audio Overviews for Studying | SolomindLM",
    description:
      "Listen to AI-narrated overviews of your sources. Choose format—deep dive, brief, critique, or debate—plus length and focus.",
    keywords: "audio study, podcast summary, listen to notes, AI narration, deep dive",
    h1: "Audio overviews you can listen to on the go",
    subheadline:
      "Generate narrated summaries from your notebook sources with format, length, and focus options.",
    conversionPromise:
      "Create a free account and generate an audio overview from your next lecture set.",
    proofBullets: [
      "Formats include deep dive, brief, critique, and debate",
      "Adjust length and topic focus",
      "Built from sources in your notebook",
      "Play in the browser when you are ready",
    ],
    sourceToOutput: {
      source: "Two articles and a set of class notes",
      output: "A narrated audio overview you can play while commuting",
    },
    faqs: [
      {
        question: "What audio formats are available?",
        answer:
          "You can choose deep dive, brief, critique, or debate-style overviews, depending on how you want to review the material.",
      },
      {
        question: "Can I set how long the overview runs?",
        answer: "Yes. Length and focus settings help shape how much detail the narration covers.",
      },
      {
        question: "Is the audio generated from my sources?",
        answer:
          "Overviews are produced from the sources you select in the notebook, so the narration follows your uploaded content.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Audio Overview",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/students/ai-mind-maps",
    cluster: "students",
    intentKey: "mindmap",
    title: "AI Mind Maps from Sources | SolomindLM",
    description:
      "Build visual mind maps from your uploaded sources. See how concepts connect across readings and lectures.",
    keywords: "mind map, concept map, visual study, AI mind map, study diagram",
    h1: "Visual mind maps from your sources",
    subheadline:
      "Map concepts and relationships from your notebook materials in an interactive diagram you can explore and adjust.",
    conversionPromise: "Sign up free and map your first chapter or lecture in a mind map.",
    proofBullets: [
      "Visual layout generated from selected sources",
      "Explore branches and relationships interactively",
      "Useful for seeing how topics connect across readings",
      "Edit and refine the map in your notebook",
    ],
    sourceToOutput: {
      source: "A dense textbook chapter",
      output: "A branching mind map of key concepts and links",
    },
    faqs: [
      {
        question: "What sources can mind maps use?",
        answer:
          "Mind maps draw from documents, transcripts, and text sources you have added to the notebook.",
      },
      {
        question: "Can I edit the map after it is generated?",
        answer: "Yes. You can adjust nodes and structure in the mind map editor after generation.",
      },
      {
        question: "Is this a replacement for taking notes by hand?",
        answer:
          "It is a supplement. Maps help you see structure quickly; you should still verify details against your originals.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Mind Maps",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/students/ai-reports",
    cluster: "students",
    intentKey: "reports",
    title: "AI Reports and Study Guides | SolomindLM",
    description:
      "Generate reports from your sources: study guide, summary, briefing, concept explainer, or custom. Grounded in the materials you select.",
    keywords: "study guide, AI summary, briefing, concept explainer, report generator",
    h1: "Reports and study guides from your materials",
    subheadline:
      "Pick a report type—study guide, summary, briefing, concept explainer, or custom—and generate a draft from your sources.",
    conversionPromise:
      "Create a free account and draft your first study guide from course readings.",
    proofBullets: [
      "Report types: study guide, summary, briefing, concept explainer, custom",
      "Uses only the sources you choose in the notebook",
      "Editable draft you can refine before sharing",
      "Helpful for review sheets and exam prep outlines",
    ],
    sourceToOutput: {
      source: "Syllabus readings for one exam unit",
      output: "A structured study guide draft with sections and key points",
    },
    faqs: [
      {
        question: "What report types can I create?",
        answer:
          "Options include study guide, summary, briefing, concept explainer, and custom prompts for other structured outputs.",
      },
      {
        question: "Will the report cite only my sources?",
        answer:
          "Generation is grounded in your selected notebook sources. You should still verify facts and wording before submitting work.",
      },
      {
        question: "Can I customize the prompt?",
        answer:
          "Yes. The custom report type lets you describe the structure or angle you want within your source set.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Reports",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/students/ai-infographics",
    cluster: "students",
    intentKey: "infographic",
    title: "AI Infographics from Study Sources | SolomindLM",
    description:
      "Create infographic images from your sources. Choose style, orientation, and detail level for visual study aids.",
    keywords: "infographic, visual summary, study poster, AI image, learning visual",
    h1: "Infographics that visualize your study content",
    subheadline:
      "Turn key ideas from your sources into an image with controls for style, orientation, and detail.",
    conversionPromise: "Start free and generate a visual summary of your next topic.",
    proofBullets: [
      "Image output based on notebook sources",
      "Style, orientation, and detail settings",
      "Useful for posters, slides, and quick visual review",
      "Review the image against your materials before presenting",
    ],
    sourceToOutput: {
      source: "A process explained across two lecture PDFs",
      output: "A single infographic image highlighting main steps",
    },
    faqs: [
      {
        question: "What can I customize about the infographic?",
        answer:
          "You can adjust style, orientation (such as portrait or landscape), and how much detail to include.",
      },
      {
        question: "Is the infographic text always accurate?",
        answer:
          "Images are generated from your sources but can simplify or mislabel details. Verify against your originals before using in graded work.",
      },
      {
        question: "What file format do I get?",
        answer:
          "Infographics are delivered as images you can view and download from your notebook.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Infographics",
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/students/ai-written-questions",
    cluster: "students",
    intentKey: "writtenQuestions",
    title: "Written Questions with AI Feedback | SolomindLM",
    description:
      "Practice short-answer and essay questions from your sources. Submit responses for feedback—separate from multiple-choice Quizzes.",
    keywords: "essay practice, short answer, written response, study feedback, exam practice",
    h1: "Written questions with feedback on your answers",
    subheadline:
      "Generate short-answer and essay prompts from your sources, write responses, and submit for AI feedback—not multiple-choice.",
    conversionPromise:
      "Create a free account to practice written responses on your course material.",
    proofBullets: [
      "Short-answer and essay-style prompts",
      "Submit your response for feedback",
      "Grounded in sources you select",
      "Separate from the multiple-choice Quiz tool",
    ],
    sourceToOutput: {
      source: "Primary sources for a history unit",
      output: "Essay prompts plus feedback on your submitted answer",
    },
    faqs: [
      {
        question: "How is this different from Quizzes?",
        answer:
          "Written Questions focuses on short and essay responses with feedback. Quizzes only produce multiple-choice practice.",
      },
      {
        question: "Does feedback replace a teacher or grader?",
        answer:
          "No. Feedback is a study aid. Use it to spot gaps and improve drafts, not as a final grade.",
      },
      {
        question: "Can I choose question length?",
        answer:
          "You can generate short-answer or longer essay-style prompts depending on how you configure the tool.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Written Questions",
    changefreq: "weekly",
    priority: 0.8,
  },
  {
    path: "/students/ai-spreadsheets",
    cluster: "students",
    intentKey: "spreadsheets",
    title: "AI Spreadsheets from Sources | SolomindLM",
    description:
      "Extract structured data from your sources into spreadsheets. Modes include data extraction, comparison, timeline, financial, and custom layouts.",
    keywords: "spreadsheet, data extraction, comparison table, timeline, study data",
    h1: "Spreadsheets that organize data from your sources",
    subheadline:
      "Pull structured tables from readings—comparison, timeline, financial, or custom formats—for analysis and review.",
    conversionPromise: "Sign up free and extract your first table from a reading set.",
    proofBullets: [
      "Modes: data extraction, comparison, timeline, financial, custom",
      "Rows and columns grounded in selected sources",
      "Easier than copying figures by hand from PDFs",
      "Review extracted values against originals",
    ],
    sourceToOutput: {
      source: "Case studies with figures across three PDFs",
      output: "A comparison spreadsheet with key metrics per case",
    },
    faqs: [
      {
        question: "What spreadsheet modes are available?",
        answer:
          "You can use data extraction, comparison, timeline, financial, or custom layouts depending on what you need from your sources.",
      },
      {
        question: "Should I trust extracted numbers without checking?",
        answer:
          "No. Always verify extracted data against your source documents, especially for assignments and exams.",
      },
      {
        question: "Can I export the spreadsheet?",
        answer:
          "You can work with the generated table in the notebook and export depending on the formats supported in the product.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Spreadsheets",
    changefreq: "weekly",
    priority: 0.7,
  },
  {
    path: "/research/academic-paper-discovery",
    cluster: "research",
    intentKey: "academicDiscovery",
    title: "Academic Paper Discovery | SolomindLM",
    description:
      "Search academic literature with filters for year, citations, open access, and field. Import paper records with deduplication by DOI and OpenAlex.",
    keywords: "paper discovery, academic search, OpenAlex, DOI, literature search",
    h1: "Discover academic papers for your research notebook",
    subheadline:
      "Search the academic channel, filter by year, citations, open access, and field, then import deduplicated paper records.",
    conversionPromise:
      "Create a free account to search academic literature and save papers to a notebook.",
    proofBullets: [
      "Academic-focused discovery channel",
      "Filters: year, citation count, open access, field",
      "Imports structured paper records into your notebook",
      "Deduplicates by DOI and OpenAlex identifiers",
    ],
    sourceToOutput: {
      source: "A query on transformer architectures in biology papers",
      output: "Imported paper records ready to read and cite",
    },
    faqs: [
      {
        question: "How does deduplication work?",
        answer:
          "When you import papers, records with the same DOI or OpenAlex ID are treated as duplicates so your notebook stays clean.",
      },
      {
        question: "Can I filter to open-access papers only?",
        answer: "Yes. Open access is one of the filters you can apply before importing results.",
      },
      {
        question: "Does discovery replace a full systematic review?",
        answer:
          "No. It helps you find and collect papers quickly. Formal systematic reviews need explicit protocols and exhaustive search strategies.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Paper Discovery",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/research/import-papers",
    cluster: "research",
    intentKey: "paperImport",
    title: "Import Research Papers | SolomindLM",
    description:
      "Import papers by DOI, BibTeX, RIS, Zotero, Mendeley, or manual entry. Build your reading list inside a research notebook.",
    keywords: "import papers, DOI, BibTeX, RIS, Zotero, Mendeley, reference manager",
    h1: "Import papers from DOI, BibTeX, and reference managers",
    subheadline:
      "Bring literature in via DOI, BibTeX, RIS, Zotero, Mendeley, or manual metadata—then read and work with them in one notebook.",
    conversionPromise: "Start free and import your first paper by DOI or from a reference file.",
    proofBullets: [
      "Import by DOI, BibTeX, RIS, Zotero, or Mendeley",
      "Manual entry when metadata is incomplete",
      "Papers become sources in your research notebook",
      "Combine imports with discovery and chat tools",
    ],
    sourceToOutput: {
      source: "A Zotero library export for one project",
      output: "Paper sources attached to your notebook with metadata",
    },
    faqs: [
      {
        question: "Which import formats are supported?",
        answer:
          "You can import using DOI lookup, BibTeX, RIS, Zotero, Mendeley integrations, or by entering details manually.",
      },
      {
        question: "Do I need the PDF for every import?",
        answer:
          "Metadata imports can add paper records; PDFs can be attached when available so you can read and chat with full text.",
      },
      {
        question: "Can I mix imports with discovered papers?",
        answer: "Yes. Imported and discovered papers live in the same notebook alongside uploads.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Import Papers",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/research/citation-styles",
    cluster: "research",
    intentKey: "citationStyles",
    title: "Citation Styles for Research | SolomindLM",
    description:
      "Format citations in 12 styles including APA, MLA, Chicago, AMA, ACS, IEEE, Vancouver, and Harvard. Use in literature reviews, reports, and the Cite Paper modal.",
    keywords: "citation styles, APA, MLA, Chicago, IEEE, Vancouver, Harvard, cite paper",
    h1: "Twelve citation styles for your research output",
    subheadline:
      "Apply APA, MLA, Chicago, AMA, ACS, IEEE, Vancouver, Harvard, and more in literature reviews, reports, and when citing papers—then verify before submitting.",
    conversionPromise:
      "Create a free account to format citations in the style your field requires.",
    proofBullets: [
      "Twelve styles: APA, MLA, Chicago, AMA, ACS, IEEE, Vancouver, Harvard, and others",
      "Available in literature reviews and reports",
      "Cite Paper modal for quick references",
      "Always verify formatted citations against official guides",
    ],
    sourceToOutput: {
      source: "A set of imported journal articles",
      output: "Bibliography entries in your chosen citation style",
    },
    faqs: [
      {
        question: "Which citation styles are supported?",
        answer:
          "The product supports twelve styles, including APA, MLA, Chicago, AMA, ACS, IEEE, Vancouver, and Harvard. See in-app options for the full list.",
      },
      {
        question: "Where can I use citation formatting?",
        answer:
          "Styles apply in literature review and report outputs, and in the Cite Paper modal when referencing notebook sources.",
      },
      {
        question: "Are automated citations always correct?",
        answer:
          "No. Automated formatting can miss edge cases. Check each citation against your style manual before submitting formal work.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Citation Styles",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/research/ai-literature-review",
    cluster: "research",
    intentKey: "literatureReview",
    title: "AI Literature Review Assistant | SolomindLM",
    description:
      "Literature review mode with screening, ranking, and synthesis across your paper set. A research aid—not a replacement for systematic review protocols.",
    keywords: "literature review, systematic review aid, paper synthesis, research screening",
    h1: "AI literature review across your paper set",
    subheadline:
      "Screen, rank, and synthesize sources in literature review mode to draft sections faster—while you keep responsibility for rigor and methods.",
    conversionPromise: "Sign up free to run literature review mode on your imported papers.",
    proofBullets: [
      "Literature review mode for notebook sources",
      "Screening and ranking to prioritize papers",
      "Synthesis drafts across your collection",
      "Not a substitute for formal systematic review methods",
    ],
    sourceToOutput: {
      source: "Twenty papers on a narrow research question",
      output: "A structured synthesis draft with themes and gaps noted",
    },
    faqs: [
      {
        question: "Is this a systematic review tool?",
        answer:
          "No. It assists with screening, ranking, and synthesis, but does not replace preregistered systematic review protocols or exhaustive search requirements.",
      },
      {
        question: "What sources does literature review use?",
        answer:
          "It works on papers and documents you have added to the notebook, including imports and discoveries.",
      },
      {
        question: "Should I cite the synthesis directly?",
        answer:
          "Treat output as a draft. Edit, verify claims against originals, and follow your institution's integrity rules.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Literature Review",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/research/chat-with-papers",
    cluster: "research",
    intentKey: "chat",
    title: "Chat with Your Papers | SolomindLM",
    description:
      "Ask questions across notebook sources and get answers that reference your materials. Grounded chat for research reading—not a guarantee of completeness.",
    keywords: "chat with PDF, research chat, grounded answers, paper Q&A, notebook chat",
    h1: "Chat with papers across your notebook",
    subheadline:
      "Ask questions over your sources and see responses tied to your uploaded and imported materials.",
    conversionPromise: "Create a free account to chat with your first paper or reading set.",
    proofBullets: [
      "Chat across multiple sources in one notebook",
      "Responses aim to reference your materials",
      "Useful while reading and annotating",
      "Verify important claims against the original PDFs",
    ],
    sourceToOutput: {
      source: "Five PDFs for a seminar paper",
      output: "Answers with pointers back to relevant passages",
    },
    faqs: [
      {
        question: "Does chat only use my notebook sources?",
        answer:
          "Chat is grounded in the sources you include in the conversation context for that notebook, not the open web by default.",
      },
      {
        question: "Can chat miss information in long PDFs?",
        answer:
          "Yes. Very long or dense documents may not surface every detail. Open the source when accuracy matters.",
      },
      {
        question: "Should I trust chat for citations without checking?",
        answer:
          "No. Confirm quotes, page references, and interpretations in the original documents before citing.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Chat with PDF",
    changefreq: "weekly",
    priority: 0.9,
  },
  {
    path: "/research/deep-research",
    cluster: "research",
    intentKey: "deepResearch",
    title: "Deep Research Reports | SolomindLM",
    description:
      "Run multi-step research that combines web search with your notebook sources and produces a report draft for you to refine.",
    keywords: "deep research, research report, web search, multi-step research, draft report",
    h1: "Deep research that combines web and your sources",
    subheadline:
      "Multi-step workflows search the web and your notebook, then assemble a report draft you can edit and verify.",
    conversionPromise:
      "Start free and run deep research on a question using your notebook plus the web.",
    proofBullets: [
      "Multi-step research across web and notebook sources",
      "Produces a structured report draft",
      "Combines external findings with your imported papers",
      "Review and edit before treating as final output",
    ],
    sourceToOutput: {
      source: "A research question plus ten notebook papers",
      output: "A multi-section report draft with web and source context",
    },
    faqs: [
      {
        question: "What does deep research do differently from chat?",
        answer:
          "Deep research runs a longer, multi-step process that searches the web and synthesizes findings into a report draft, not just short answers.",
      },
      {
        question: "Does it use my notebook sources?",
        answer:
          "Yes. It can combine web results with papers and documents already in your notebook.",
      },
      {
        question: "Is the report ready to publish as-is?",
        answer:
          "No. Treat it as a draft. Check facts, citations, and bias before sharing or submitting.",
      },
    ],
    ctaLabel: "Create free account",
    navLabel: "Deep Research",
    changefreq: "weekly",
    priority: 0.9,
  },
];

export function getIntentPagesByCluster(cluster: IntentLandingCluster): IntentLandingPageConfig[] {
  return INTENT_LANDING_PAGES.filter((page) => page.cluster === cluster);
}

export function getIntentLandingPageByPath(path: string): IntentLandingPageConfig | undefined {
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return INTENT_LANDING_PAGES.find((page) => page.path === normalized);
}

export function getIntentLandingPaths(): string[] {
  return INTENT_LANDING_PAGES.map((page) => page.path);
}

export function isIntentLandingPath(path: string): boolean {
  return getIntentLandingPageByPath(path) !== undefined;
}

export const CLUSTER_HUB_PATHS: Record<IntentLandingCluster, string> = {
  students: "/students",
  research: "/research",
};

export const CLUSTER_HUB_LABELS: Record<IntentLandingCluster, string> = {
  students: "Students",
  research: "Research",
};

export type IntentBreadcrumbItem = {
  name: string;
  path: string;
};

export function getIntentBreadcrumbItems(page: IntentLandingPageConfig): IntentBreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: CLUSTER_HUB_LABELS[page.cluster], path: CLUSTER_HUB_PATHS[page.cluster] },
    { name: page.navLabel, path: page.path },
  ];
}

function getClusterFeatureIntentKeys(cluster: IntentLandingCluster): string[] {
  return Object.keys(FEATURE_INTENT_PATHS).filter((key) => {
    const path = FEATURE_INTENT_PATHS[key];
    if (!path) return false;
    const intentPage = INTENT_LANDING_PAGES.find((entry) => entry.path === path);
    return intentPage?.cluster === cluster;
  });
}

export function getRelatedIntentPages(
  page: IntentLandingPageConfig,
  maxCount = 3
): IntentLandingPageConfig[] {
  const clusterKeys = getClusterFeatureIntentKeys(page.cluster);
  const currentIndex = clusterKeys.indexOf(page.intentKey);
  if (currentIndex === -1) return [];

  const related: IntentLandingPageConfig[] = [];
  for (let offset = 1; related.length < maxCount && offset < clusterKeys.length; offset++) {
    for (const delta of [-offset, offset] as const) {
      const index = currentIndex + delta;
      if (index < 0 || index >= clusterKeys.length) continue;

      const path = FEATURE_INTENT_PATHS[clusterKeys[index]!];
      if (!path || path === page.path) continue;

      const relatedPage = getIntentLandingPageByPath(path);
      if (relatedPage && !related.some((entry) => entry.path === relatedPage.path)) {
        related.push(relatedPage);
        if (related.length >= maxCount) break;
      }
    }
  }

  return related;
}
