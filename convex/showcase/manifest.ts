/**
 * The showcase notebooks (public-notebooks spec, PR 3): plain data that `seed.ts` builds through
 * the app's own ingestion, Studio, literature-review and deep-research paths. Publishing a
 * notebook lets every signed-in user read its sources, so each source records its licence and
 * must be public domain or openly licensed (see the plan's Sources appendix). Studio options are
 * the ones a user can pick in the Studio dialogs; `validateManifest` checks them.
 */
import { GETTING_STARTED_GUIDE } from "./gettingStartedGuide";

/** Folder the seeded notebooks live in, in the owner's account. */
export const SHOWCASE_FOLDER_NAME = "Showcase";

export const STUDIO_KINDS = [
  "report",
  "flashcards",
  "quiz",
  "writtenQuestions",
  "mindmap",
  "audio",
  "infographic",
  "spreadsheet",
] as const;

export type StudioKind = (typeof STUDIO_KINDS)[number];

type Difficulty = "easy" | "medium" | "hard";

export type ShowcaseSource =
  | { kind: "url"; title: string; url: string; licence: string }
  | { kind: "youtube"; title: string; url: string; licence: string }
  /** A PDF the seed fetches and stores, like an uploaded file. */
  | { kind: "file"; fileName: string; url: string; licence: string }
  | { kind: "text"; title: string; text: string; licence: string };

export type ShowcaseStudioItem =
  | {
      kind: "report";
      reportType:
        | "briefing"
        | "study_guide"
        | "blog_post"
        | "summary"
        | "technical_report"
        | "concept_explainer"
        | "methodology_overview"
        | "custom";
      prompt?: string;
    }
  | { kind: "flashcards"; cardCount: number; difficulty: Difficulty; topic?: string }
  | { kind: "quiz"; questionCount: number; difficulty: Difficulty; focus?: string }
  | {
      kind: "writtenQuestions";
      questionCount: number;
      difficulty: Difficulty;
      questionType: "short" | "essay";
      focus?: string;
    }
  | { kind: "mindmap"; prompt?: string }
  | {
      kind: "audio";
      audioType: "deep_dive" | "brief" | "critique" | "debate";
      length: "short" | "default" | "long";
      focus?: string;
    }
  | {
      kind: "infographic";
      prompt?: string;
      orientation?: "landscape" | "portrait" | "square";
      detailLevel?: "concise" | "standard" | "detailed";
    }
  | {
      kind: "spreadsheet";
      spreadsheetType:
        | "data_extraction"
        | "comparison_table"
        | "timeline"
        | "financial_summary"
        | "custom";
      prompt?: string;
    };

type AcademicFilters = {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
};

/** Papers added the way Discover adds them: an academic search, then DOI metadata. */
export interface PaperDiscovery {
  query: string;
  filters: AcademicFilters;
  /** How many papers to add. */
  take: number;
  /**
   * The papers the first (dev) run found, pinned so prod gets the same set: when present the seed
   * resolves these DOIs (the "Import from DOI" path) instead of searching. Exactly `take` of them.
   */
  pinnedDois?: string[];
}

export interface ShowcaseLiteratureReview {
  /** Typed into the composer in Literature Review mode; the planner derives criteria from it. */
  question: string;
  researchDatabase: "all" | "pubmed" | "arxiv";
  academicFilters?: AcademicFilters;
}

export interface ShowcaseDeepResearch {
  query: string;
  channels: Array<"notebook" | "web" | "academic" | "news">;
}

export interface ShowcaseNotebook {
  slug: string;
  title: string;
  icon: string;
  coverColor: string;
  chatMode?: "learningGuide";
  sources: ShowcaseSource[];
  paperDiscovery?: PaperDiscovery;
  studio: ShowcaseStudioItem[];
  literatureReview?: ShowcaseLiteratureReview;
  deepResearch?: ShowcaseDeepResearch;
}

/** How a manifest source is matched to a stored document (`fileUrl` or `fileName`). */
export function sourceKey(source: ShowcaseSource): string {
  switch (source.kind) {
    case "url":
    case "youtube":
      return source.url;
    case "file":
      return source.fileName;
    case "text":
      return source.title;
  }
}

const WIKIPEDIA = "CC BY-SA 4.0 (Wikipedia)";
/** YouTube's "Creative Commons Attribution licence (reuse allowed)" is CC BY 3.0. */
const YOUTUBE_CC_BY = "CC BY 3.0 (YouTube Creative Commons Attribution licence)";
const US_GOV = "Public domain (U.S. federal government work)";

export const SHOWCASE_NOTEBOOKS: ShowcaseNotebook[] = [
  {
    slug: "econ-101-midterm-prep",
    title: "ECON 101 · Midterm Prep",
    icon: "BarChart",
    coverColor: "bg-vintage-blue-300",
    chatMode: "learningGuide",
    sources: [
      {
        kind: "url",
        title: "Supply and demand",
        url: "https://en.wikipedia.org/wiki/Supply_and_demand",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Price elasticity of demand",
        url: "https://en.wikipedia.org/wiki/Price_elasticity_of_demand",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Perfect competition",
        url: "https://en.wikipedia.org/wiki/Perfect_competition",
        licence: WIKIPEDIA,
      },
      {
        kind: "youtube",
        title: "Demand and supply: Market Equilibrium (OER Africa)",
        url: "https://www.youtube.com/watch?v=alH1sJ8VbAY",
        licence: YOUTUBE_CC_BY,
      },
      {
        kind: "youtube",
        title:
          "Intermediate Microeconomics: Elasticity of Demand (University of Utah, Department of Economics)",
        url: "https://www.youtube.com/watch?v=zTqTW5n8wxg",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      {
        kind: "flashcards",
        cardCount: 55,
        difficulty: "medium",
        topic: "Supply and demand, elasticity, surplus and perfect competition for my midterm",
      },
      {
        kind: "quiz",
        questionCount: 20,
        difficulty: "medium",
        focus:
          "Midterm practice: shifts in supply and demand, price elasticity, consumer and producer surplus",
      },
      { kind: "mindmap" },
      {
        kind: "audio",
        audioType: "brief",
        length: "short",
        focus: "A quick recap of the main midterm topics for a student revising the night before",
      },
    ],
  },
  {
    slug: "pharmacology-essentials",
    title: "Pharmacology Essentials",
    icon: "Brain",
    coverColor: "bg-vintage-red-300",
    sources: [
      {
        kind: "url",
        title: "Pharmacokinetics",
        url: "https://en.wikipedia.org/wiki/Pharmacokinetics",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Beta blocker",
        url: "https://en.wikipedia.org/wiki/Beta_blocker",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "What Happens to Medicine in Your Body? (NIGMS)",
        url: "https://nigms.nih.gov/biobeat/2023/09/what-happens-to-medicine-in-your-body",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Drug Interactions: What You Should Know (FDA)",
        url: "https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know",
        licence: US_GOV,
      },
      {
        kind: "youtube",
        title: "Pharmacokinetics Visualized (VetMedAcademy with the MSD Veterinary Manual)",
        url: "https://www.youtube.com/watch?v=0-fERRXiOzo",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      {
        kind: "flashcards",
        cardCount: 55,
        difficulty: "hard",
        topic:
          "Pharmacokinetics, drug classes, mechanisms of action, adverse effects and interactions",
      },
      {
        kind: "writtenQuestions",
        questionCount: 10,
        difficulty: "medium",
        questionType: "short",
        focus: "Explain mechanisms and their clinical implications in two or three sentences",
      },
      {
        kind: "audio",
        audioType: "brief",
        length: "short",
        focus: "A short review of ADME and beta blockers for a nursing student",
      },
    ],
  },
  {
    slug: "spaced-repetition-literature-review",
    title: "Literature Review: Does Spaced Repetition Work?",
    icon: "Search",
    coverColor: "bg-vintage-green-400",
    sources: [],
    paperDiscovery: {
      // "Spacing effect" is the research literature's own term; on dev the narrower "spaced repetition
      // long-term retention" with 10+ citations found only 3 open-access papers with full text.
      query: "spacing effect long-term retention",
      filters: {
        publicationYearFrom: 2010,
        minCitations: 5,
        openAccessOnly: true,
        hasFullText: true,
      },
      take: 5,
    },
    studio: [],
    literatureReview: {
      question:
        "Does spaced repetition (spreading study or retrieval practice over time) improve long-term retention compared with massed study? Include experiments, classroom studies and meta-analyses with human learners and a retention test at least one day after the last study session. Exclude opinion pieces, app or algorithm descriptions without learner outcomes, and studies where spacing can't be separated from extra study time.",
      researchDatabase: "all",
    },
    deepResearch: {
      query:
        "How should spaced repetition reviews be scheduled (expanding versus fixed intervals, and the best gap for a given test date), and how well do lab findings on the spacing effect hold up in real classrooms?",
      channels: ["notebook", "academic"],
    },
  },
  {
    slug: "llm-hallucinations-paper-digest",
    title: "LLM Hallucinations: Paper Digest",
    icon: "Monitor",
    coverColor: "bg-vintage-blue-500",
    sources: [
      {
        kind: "url",
        title: "Survey of Hallucination in Natural Language Generation",
        url: "https://arxiv.org/abs/2202.03629",
        licence: "CC BY 4.0 (arXiv)",
      },
      {
        kind: "url",
        title:
          "SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models",
        url: "https://arxiv.org/abs/2303.08896",
        licence: "CC BY 4.0 (arXiv)",
      },
      {
        kind: "url",
        title:
          "Semantic Uncertainty: Linguistic Invariances for Uncertainty Estimation in Natural Language Generation",
        url: "https://arxiv.org/abs/2302.09664",
        licence: "CC BY 4.0 (arXiv)",
      },
      {
        kind: "url",
        title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection",
        url: "https://arxiv.org/abs/2310.11511",
        licence: "CC BY 4.0 (arXiv)",
      },
      {
        kind: "url",
        title: "Fine-grained Hallucination Detection and Editing for Language Models",
        url: "https://arxiv.org/abs/2401.06855",
        licence: "CC BY 4.0 (arXiv)",
      },
      {
        kind: "youtube",
        title: "Visualizing LLM Hallucinations (Anand S, FOSSASIA Summit 2025)",
        url: "https://www.youtube.com/watch?v=FEz3rMwArQs",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      {
        kind: "spreadsheet",
        spreadsheetType: "custom",
        prompt:
          "Compare the hallucination methods in these papers: one row per method, with columns for the approach, what it needs (model access, retrieval, extra training), how it was evaluated, the headline result and its limitations.",
      },
      {
        kind: "audio",
        audioType: "critique",
        length: "default",
        focus: "How well each paper's evaluation supports its claims, and what is still unsolved",
      },
      {
        kind: "report",
        reportType: "technical_report",
        prompt:
          "A digest of how these papers define, detect and reduce hallucination, with the trade-offs between the methods",
      },
    ],
  },
  {
    slug: "home-battery-storage-market-scan",
    title: "Home Battery Storage · Market Scan",
    icon: "Globe",
    coverColor: "bg-vintage-amber-400",
    sources: [
      {
        kind: "url",
        title: "Solar-Plus-Storage 101 (U.S. DOE)",
        url: "https://www.energy.gov/cmei/systems/articles/solar-plus-storage-101",
        licence: US_GOV,
      },
      {
        kind: "url",
        title:
          "California residents are increasingly pairing battery storage with solar installations (EIA)",
        url: "https://www.eia.gov/todayinenergy/detail.php?id=62524",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Energy storage for electricity generation (EIA Energy Explained)",
        url: "https://www.eia.gov/energyexplained/electricity/energy-storage-for-electricity-generation.php",
        licence: US_GOV,
      },
      {
        kind: "youtube",
        title:
          "Large-scale battery storage: Challenges and opportunities for technology and policy (video abstract, MRS Energy & Sustainability)",
        url: "https://www.youtube.com/watch?v=U__l-CFg6wM",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      {
        kind: "report",
        reportType: "briefing",
        prompt:
          "Brief a founder on the home battery market: how big it is and how fast it is growing, what systems cost, why households buy batteries (backup, solar self-consumption, bill savings) and which policies drive demand",
      },
      {
        kind: "spreadsheet",
        spreadsheetType: "custom",
        prompt:
          "A market data table: one row per figure the sources give (installed capacity, annual additions, attachment rate with solar, system size, cost), with columns for the metric, value, unit, year, region and source.",
      },
      {
        kind: "infographic",
        prompt:
          "Home battery storage at a glance: growth, costs and why households pair batteries with solar",
        orientation: "portrait",
        detailLevel: "standard",
      },
    ],
  },
  {
    slug: "reading-a-10-k",
    title: "Reading a 10-K",
    icon: "FileText",
    coverColor: "bg-vintage-orange-300",
    sources: [
      {
        kind: "url",
        title:
          "Costco Wholesale Corporation Form 10-K, fiscal year ended August 30, 2026 (SEC EDGAR)",
        url: "https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm",
        licence:
          "SEC EDGAR public filing (sec.gov: public information, may be copied with citation)",
      },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "financial_summary" },
      {
        kind: "report",
        reportType: "briefing",
        prompt:
          "Explain this 10-K to a business student: what the company does, how it makes money, the key numbers in the income statement, balance sheet and cash flow statement, and the biggest risk factors",
      },
      {
        kind: "quiz",
        questionCount: 10,
        difficulty: "medium",
        focus: "Reading a 10-K: the business, the financial statements, MD&A and risk factors",
      },
    ],
  },
  {
    slug: "getting-started-with-solomindlm",
    title: "Getting Started with SolomindLM",
    icon: "Lightbulb",
    coverColor: "bg-vintage-brown-300",
    sources: [
      {
        kind: "text",
        title: "Getting Started with SolomindLM",
        text: GETTING_STARTED_GUIDE,
        licence: "Original (SolomindLM)",
      },
    ],
    studio: [
      { kind: "report", reportType: "study_guide" },
      { kind: "flashcards", cardCount: 20, difficulty: "easy" },
      { kind: "quiz", questionCount: 10, difficulty: "easy" },
      { kind: "writtenQuestions", questionCount: 5, difficulty: "easy", questionType: "short" },
      { kind: "mindmap" },
      { kind: "audio", audioType: "brief", length: "short" },
      {
        kind: "infographic",
        prompt:
          "How a SolomindLM notebook works: add sources, chat with them, create in Studio, share",
        orientation: "landscape",
        detailLevel: "concise",
      },
      {
        kind: "spreadsheet",
        spreadsheetType: "custom",
        prompt:
          "A table of the Studio tools: one row per tool, with columns for what it makes, the options you can set and when to use it.",
      },
    ],
  },
];
