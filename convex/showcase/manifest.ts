/**
 * The showcase notebooks (public-notebooks spec, PR 3): plain data that `seed.ts` builds through
 * the app's own ingestion, Studio, literature-review and deep-research paths. Publishing a
 * notebook lets every signed-in user read its sources, so each source records its licence and
 * must be public domain or openly licensed (see the plan's Sources appendix). Studio options are
 * the ones a user can pick in the Studio dialogs; `validateManifest` checks them.
 */
import { GETTING_STARTED_GUIDE } from "./gettingStartedGuide";
import { SHOWCASE_PROMPTS, type ShowcasePromptKey } from "./promptPacks";

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

type StudioItemOptions =
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

/**
 * A Studio item as the Create dialogs offer it. `promptKey` uses a Prompt Library prompt from
 * `promptPacks.ts` as the item's prompt, focus or topic (set one or the other, not both).
 */
export type ShowcaseStudioItem = StudioItemOptions & { promptKey?: ShowcasePromptKey };

/** The field each Studio kind's prompt goes in, as the Create dialogs send it. */
export function promptField(kind: StudioKind): "prompt" | "focus" | "topic" {
  switch (kind) {
    case "flashcards":
      return "topic";
    case "quiz":
    case "writtenQuestions":
    case "audio":
      return "focus";
    default:
      return "prompt";
  }
}

/** The item with its Prompt Library prompt (if any) written into the field its job reads. */
export function withPromptText(item: ShowcaseStudioItem): ShowcaseStudioItem {
  if (!item.promptKey) return item;
  return { ...item, [promptField(item.kind)]: SHOWCASE_PROMPTS[item.promptKey].text };
}

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
const SEC_FILING =
  "SEC EDGAR public filing (sec.gov: public information, may be copied with citation)";
const ARXIV_CC_BY = "CC BY 4.0 (arXiv)";
/** Approved for this notebook only (2026-10-19): attribution-only, like CC BY. */
const PYTORCH_TUTORIALS = "BSD-3-Clause (pytorch/tutorials, © PyTorch contributors)";
const ONET =
  "CC BY 4.0 (O*NET OnLine, U.S. Department of Labor, Employment and Training Administration)";

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
      {
        kind: "url",
        title: "Economic surplus",
        url: "https://en.wikipedia.org/wiki/Economic_surplus",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Price ceiling",
        url: "https://en.wikipedia.org/wiki/Price_ceiling",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Cost curve",
        url: "https://en.wikipedia.org/wiki/Cost_curve",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Monopoly",
        url: "https://en.wikipedia.org/wiki/Monopoly",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Oligopoly",
        url: "https://en.wikipedia.org/wiki/Oligopoly",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Externality",
        url: "https://en.wikipedia.org/wiki/Externality",
        licence: WIKIPEDIA,
      },
      {
        kind: "youtube",
        title:
          "Intermediate Microeconomics: Consumer Surplus (University of Utah, Department of Economics)",
        url: "https://www.youtube.com/watch?v=O9UfktOERII",
        licence: YOUTUBE_CC_BY,
      },
      {
        kind: "youtube",
        title:
          "Intermediate Microeconomics: Monopoly versus Competition, Part 1 (University of Utah, Department of Economics)",
        url: "https://www.youtube.com/watch?v=PkRGHZh4XxM",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      { kind: "flashcards", cardCount: 55, difficulty: "medium", promptKey: "exam.flashcards" },
      { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "exam.quiz" },
      {
        kind: "writtenQuestions",
        questionCount: 10,
        difficulty: "medium",
        questionType: "short",
        promptKey: "exam.written",
      },
      { kind: "report", reportType: "study_guide" },
      { kind: "mindmap", promptKey: "exam.mindmap" },
      { kind: "audio", audioType: "brief", length: "short", promptKey: "exam.audio" },
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
      {
        kind: "url",
        title: "Pharmacodynamics",
        url: "https://en.wikipedia.org/wiki/Pharmacodynamics",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Therapeutic index",
        url: "https://en.wikipedia.org/wiki/Therapeutic_index",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "ACE inhibitor",
        url: "https://en.wikipedia.org/wiki/ACE_inhibitor",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Nonsteroidal anti-inflammatory drug",
        url: "https://en.wikipedia.org/wiki/Nonsteroidal_anti-inflammatory_drug",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        // "Opioid" (about 9,000 words) timed out in URL extraction on dev, twice.
        title: "Drug interaction",
        url: "https://en.wikipedia.org/wiki/Drug_interaction",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Antibiotic",
        url: "https://en.wikipedia.org/wiki/Antibiotic",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Finding and Learning about Side Effects (adverse reactions) (FDA)",
        url: "https://www.fda.gov/drugs/find-information-about-drug/finding-and-learning-about-side-effects-adverse-reactions",
        licence: US_GOV,
      },
      {
        kind: "youtube",
        title:
          "Drug Antagonists, Agonist/Antagonists and Inverse Agonists (VetMedAcademy with the MSD Veterinary Manual)",
        url: "https://www.youtube.com/watch?v=GTZCKeqnpLo",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      { kind: "flashcards", cardCount: 55, difficulty: "hard", promptKey: "clinical.flashcards" },
      { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "clinical.quiz" },
      {
        kind: "writtenQuestions",
        questionCount: 10,
        difficulty: "medium",
        questionType: "short",
        promptKey: "clinical.written",
      },
      { kind: "report", reportType: "study_guide" },
      { kind: "mindmap", promptKey: "exam.mindmap" },
      { kind: "audio", audioType: "brief", length: "short", promptKey: "exam.audio" },
    ],
  },
  {
    slug: "spaced-repetition-literature-review",
    title: "Literature Review: Does Spaced Repetition Work?",
    icon: "Search",
    coverColor: "bg-vintage-green-400",
    sources: [
      {
        kind: "url",
        title: "Spacing effect",
        url: "https://en.wikipedia.org/wiki/Spacing_effect",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Spaced repetition",
        url: "https://en.wikipedia.org/wiki/Spaced_repetition",
        licence: WIKIPEDIA,
      },
    ],
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
      take: 11,
      // Chosen 2026-10-19: three from the search above, two openly licensed reviews that replaced
      // off-topic results, and six CC BY 4.0 studies (lab, classroom, a null result, meta-analyses).
      pinnedDois: [
        "10.1073/pnas.1815156116",
        "10.1186/s12909-022-03324-8",
        "10.29311/ndtps.v0i15.3376",
        "10.1007/s10459-023-10274-3",
        "10.3390/bs15060771",
        "10.1371/journal.pone.0090656",
        "10.1002/acp.3485",
        "10.3389/fpsyg.2020.00811",
        "10.1007/s10648-022-09677-2",
        "10.1186/s40594-024-00468-5",
        "10.1017/s0272263124000706",
      ],
    },
    studio: [
      { kind: "flashcards", cardCount: 35, difficulty: "medium", promptKey: "papers.flashcards" },
      { kind: "audio", audioType: "critique", length: "default", promptKey: "papers.critique" },
    ],
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
      {
        kind: "url",
        title: "Hallucination (artificial intelligence)",
        url: "https://en.wikipedia.org/wiki/Hallucination_(artificial_intelligence)",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Why Language Models Hallucinate",
        url: "https://arxiv.org/abs/2509.04664",
        licence: ARXIV_CC_BY,
      },
      {
        kind: "url",
        title: "Does Fine-Tuning LLMs on New Knowledge Encourage Hallucinations?",
        url: "https://arxiv.org/abs/2405.05904",
        licence: ARXIV_CC_BY,
      },
      {
        kind: "url",
        title:
          "LLMs Know More Than They Show: On the Intrinsic Representation of LLM Hallucinations",
        url: "https://arxiv.org/abs/2410.02707",
        licence: ARXIV_CC_BY,
      },
      {
        kind: "url",
        title: "Inference-Time Intervention: Eliciting Truthful Answers from a Language Model",
        url: "https://arxiv.org/abs/2306.03341",
        licence: ARXIV_CC_BY,
      },
      {
        kind: "url",
        title: "Long-form factuality in large language models",
        url: "https://arxiv.org/abs/2403.18802",
        licence: "CC0 1.0 (arXiv)",
      },
      {
        kind: "url",
        title: "HALoGEN: Fantastic LLM Hallucinations and Where to Find Them",
        url: "https://arxiv.org/abs/2501.08292",
        licence: ARXIV_CC_BY,
      },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "custom", promptKey: "papers.comparison" },
      { kind: "report", reportType: "custom", promptKey: "papers.digest" },
      { kind: "mindmap", promptKey: "papers.mindmap" },
      { kind: "flashcards", cardCount: 35, difficulty: "medium", promptKey: "papers.flashcards" },
      { kind: "audio", audioType: "critique", length: "default", promptKey: "papers.critique" },
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
      {
        kind: "url",
        title: "Home energy storage",
        url: "https://en.wikipedia.org/wiki/Home_energy_storage",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Lithium iron phosphate battery",
        url: "https://en.wikipedia.org/wiki/Lithium_iron_phosphate_battery",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Virtual power plant",
        url: "https://en.wikipedia.org/wiki/Virtual_power_plant",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Residential Clean Energy Credit (IRS)",
        url: "https://www.irs.gov/credits-deductions/residential-clean-energy-credit",
        licence: US_GOV,
      },
      {
        kind: "url",
        title:
          "Rooftop solar photovoltaic systems account for 20% of Puerto Rico's capacity mix (EIA)",
        url: "https://www.eia.gov/todayinenergy/detail.php?id=67406",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Battery storage capacity averaged 70% growth over the last three years (EIA)",
        url: "https://www.eia.gov/todayinenergy/detail.php?id=67925",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Solar and Resilience Basics (U.S. DOE)",
        url: "https://www.energy.gov/cmei/systems/solar-and-resilience-basics",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Responding to fires that include energy storage systems (U.S. Fire Administration)",
        url: "https://www.usfa.fema.gov/blog/responding-to-fires-that-include-energy-storage-systems-are-a-new-and-evolving-hazard/",
        licence: US_GOV,
      },
    ],
    studio: [
      { kind: "report", reportType: "briefing", promptKey: "market.briefing" },
      { kind: "spreadsheet", spreadsheetType: "custom", promptKey: "market.table" },
      // No infographic: the generated image invented most of its figures (the image model gets
      // no data). Add one back once infographics draw from the sources' numbers.
      { kind: "audio", audioType: "debate", length: "default", promptKey: "decision.debate" },
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
        licence: SEC_FILING,
      },
      {
        kind: "url",
        title: "Costco Wholesale Corporation Form 10-Q, quarter ended May 10, 2026 (SEC EDGAR)",
        url: "https://www.sec.gov/Archives/edgar/data/909832/000090983226000051/cost-20260510.htm",
        licence: SEC_FILING,
      },
      {
        kind: "url",
        title:
          "Costco fourth quarter and fiscal year 2026 results, Form 8-K Exhibit 99.1 (SEC EDGAR)",
        url: "https://www.sec.gov/Archives/edgar/data/909832/000090983226000084/costex9918-k92426.htm",
        licence: SEC_FILING,
      },
      {
        kind: "url",
        title: "Costco 2026 proxy statement, Schedule 14A (SEC EDGAR)",
        url: "https://www.sec.gov/Archives/edgar/data/909832/000090983225000159/cost-20251204.htm",
        licence: SEC_FILING,
      },
      {
        kind: "file",
        fileName: "SEC Investor Bulletin - How to Read a 10-K.pdf",
        url: "https://www.sec.gov/files/reada10k.pdf",
        licence: US_GOV,
      },
      {
        kind: "file",
        fileName: "SEC Investor Bulletin - How to Read an 8-K.pdf",
        url: "https://www.sec.gov/investor/pubs/readan8k.pdf",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Beginners' Guide to Financial Statements (SEC)",
        url: "https://www.sec.gov/about/reports-publications/beginners-guide-financial-statements",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Form 10-K",
        url: "https://en.wikipedia.org/wiki/Form_10-K",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Income statement",
        url: "https://en.wikipedia.org/wiki/Income_statement",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Cash flow statement",
        url: "https://en.wikipedia.org/wiki/Cash_flow_statement",
        licence: WIKIPEDIA,
      },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "financial_summary" },
      { kind: "report", reportType: "custom", promptKey: "filing.walkthrough" },
      { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "filing.quiz" },
      {
        kind: "writtenQuestions",
        questionCount: 5,
        difficulty: "medium",
        questionType: "short",
        promptKey: "filing.written",
      },
      { kind: "flashcards", cardCount: 35, difficulty: "medium", promptKey: "filing.flashcards" },
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
      // Practice material, one source of each kind, on one topic: the Moon.
      {
        kind: "url",
        title: "Lunar phase",
        url: "https://en.wikipedia.org/wiki/Lunar_phase",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Moon Phases (NASA Science)",
        url: "https://science.nasa.gov/moon/moon-phases/",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Tides (NASA Science)",
        url: "https://science.nasa.gov/moon/tides/",
        licence: US_GOV,
      },
      {
        kind: "file",
        fileName: "NASA - Earth's Moon lithograph.pdf",
        url: "https://www.nasa.gov/wp-content/uploads/2009/12/moon_lithograph.pdf",
        licence: US_GOV,
      },
      {
        kind: "youtube",
        title: "Phases and Motions of the Moon (Launch Pad Astronomy)",
        url: "https://www.youtube.com/watch?v=1CC0P7y90PU",
        licence: YOUTUBE_CC_BY,
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
  {
    slug: "learn-pytorch",
    title: "Learn PyTorch from Scratch",
    icon: "Monitor",
    coverColor: "bg-vintage-orange-400",
    chatMode: "learningGuide",
    sources: [
      {
        kind: "url",
        title: "Learn the Basics: Tensors (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title: "Learn the Basics: Datasets & DataLoaders (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/data_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title: "Learn the Basics: Build the Neural Network (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/buildmodel_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title:
          "Learn the Basics: Automatic Differentiation with torch.autograd (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title: "Learn the Basics: Optimizing Model Parameters (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/optimization_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title: "Learn the Basics: Save and Load the Model (PyTorch Tutorials)",
        url: "https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html",
        licence: PYTORCH_TUTORIALS,
      },
      {
        kind: "url",
        title: "PyTorch",
        url: "https://en.wikipedia.org/wiki/PyTorch",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Automatic differentiation",
        url: "https://en.wikipedia.org/wiki/Automatic_differentiation",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Stochastic gradient descent",
        url: "https://en.wikipedia.org/wiki/Stochastic_gradient_descent",
        licence: WIKIPEDIA,
      },
      {
        kind: "youtube",
        title: "Machine Learning Lecture 23: PyTorch Tutorial (University of Utah)",
        url: "https://www.youtube.com/watch?v=YhJMd78ctdw",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      { kind: "report", reportType: "custom", promptKey: "code.cheatsheet" },
      { kind: "report", reportType: "concept_explainer", promptKey: "code.concepts" },
      { kind: "flashcards", cardCount: 35, difficulty: "medium", promptKey: "code.flashcards" },
      { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "code.quiz" },
      {
        kind: "writtenQuestions",
        questionCount: 5,
        difficulty: "medium",
        questionType: "short",
        promptKey: "code.written",
      },
      { kind: "spreadsheet", spreadsheetType: "custom", promptKey: "code.reference" },
      { kind: "mindmap", promptKey: "code.mindmap" },
      { kind: "audio", audioType: "deep_dive", length: "default", promptKey: "code.audio" },
    ],
  },
  {
    slug: "ap-us-government-founding-documents",
    title: "AP U.S. Government: Founding Documents",
    icon: "GraduationCap",
    coverColor: "bg-vintage-red-400",
    chatMode: "learningGuide",
    sources: [
      {
        kind: "url",
        title: "The Declaration of Independence: A Transcription (National Archives)",
        url: "https://www.archives.gov/founding-docs/declaration-transcript",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Articles of Confederation (National Archives)",
        url: "https://www.archives.gov/milestone-documents/articles-of-confederation",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "The Constitution of the United States: A Transcription (National Archives)",
        url: "https://www.archives.gov/founding-docs/constitution-transcript",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "The Bill of Rights: A Transcription (National Archives)",
        url: "https://www.archives.gov/founding-docs/bill-of-rights-transcript",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "The Federalist Papers, Nos. 1–10 (Library of Congress)",
        url: "https://guides.loc.gov/federalist-papers/text-1-10",
        licence: "Public domain (published 1787–88; Library of Congress research guide)",
      },
      {
        kind: "url",
        title: "The Federalist Papers, Nos. 51–60 (Library of Congress)",
        url: "https://guides.loc.gov/federalist-papers/text-51-60",
        licence: "Public domain (published 1788; Library of Congress research guide)",
      },
      {
        kind: "url",
        title: "The Federalist Papers, Nos. 71–80 (Library of Congress)",
        url: "https://guides.loc.gov/federalist-papers/text-71-80",
        licence: "Public domain (published 1788; Library of Congress research guide)",
      },
      {
        kind: "url",
        title: "Federalist No. 10",
        url: "https://en.wikipedia.org/wiki/Federalist_No._10",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Anti-Federalism",
        url: "https://en.wikipedia.org/wiki/Anti-Federalism",
        licence: WIKIPEDIA,
      },
      {
        kind: "youtube",
        title: "Anti-Federalists and the Bill of Rights (U.S. National Archives)",
        url: "https://www.youtube.com/watch?v=EycxYd5-Ylo",
        licence: YOUTUBE_CC_BY,
      },
      // "If Men Were Angels" (Teach Democracy, cAwTVBcn9lk) was dropped on 2026-10-20: a talk on
      // teaching the Constitution. Any essay-writing prompt matched it so closely that the topic
      // filter kept it alone, and the essays came out about classroom role-play.
      {
        kind: "youtube",
        title: "AP US Government: Foundational Documents, Federalist 10 (Dave Thomer)",
        url: "https://www.youtube.com/watch?v=ihXaM5Rx4RE",
        licence: YOUTUBE_CC_BY,
      },
    ],
    studio: [
      {
        kind: "writtenQuestions",
        questionCount: 5,
        difficulty: "hard",
        questionType: "essay",
        promptKey: "documents.essay",
      },
      { kind: "audio", audioType: "debate", length: "default", promptKey: "documents.debate" },
      { kind: "spreadsheet", spreadsheetType: "custom", promptKey: "documents.timeline" },
      { kind: "report", reportType: "study_guide" },
      {
        kind: "flashcards",
        cardCount: 35,
        difficulty: "medium",
        promptKey: "documents.flashcards",
      },
      { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "documents.quiz" },
    ],
  },
  {
    slug: "career-research-data-careers",
    title: "Career Research: Data Scientist vs Software Developer vs Statistician",
    icon: "BarChart",
    coverColor: "bg-vintage-green-500",
    sources: [
      {
        kind: "url",
        title: "Data Scientists, Occupational Outlook Handbook (BLS)",
        url: "https://www.bls.gov/ooh/math/data-scientists.htm",
        licence: US_GOV,
      },
      {
        kind: "url",
        title:
          "Software Developers, Quality Assurance Analysts, and Testers, Occupational Outlook Handbook (BLS)",
        url: "https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Mathematicians and Statisticians, Occupational Outlook Handbook (BLS)",
        url: "https://www.bls.gov/ooh/math/mathematicians-and-statisticians.htm",
        licence: US_GOV,
      },
      {
        kind: "url",
        title: "Data Scientists, 15-2051.00 (O*NET OnLine)",
        url: "https://www.onetonline.org/link/summary/15-2051.00",
        licence: ONET,
      },
      {
        kind: "url",
        title: "Software Developers, 15-1252.00 (O*NET OnLine)",
        url: "https://www.onetonline.org/link/summary/15-1252.00",
        licence: ONET,
      },
      {
        kind: "url",
        title: "Statisticians, 15-2041.00 (O*NET OnLine)",
        url: "https://www.onetonline.org/link/summary/15-2041.00",
        licence: ONET,
      },
      {
        kind: "url",
        title: "Data science",
        url: "https://en.wikipedia.org/wiki/Data_science",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Software engineering",
        url: "https://en.wikipedia.org/wiki/Software_engineering",
        licence: WIKIPEDIA,
      },
      {
        kind: "url",
        title: "Statistician",
        url: "https://en.wikipedia.org/wiki/Statistician",
        licence: WIKIPEDIA,
      },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "custom", promptKey: "decision.table" },
      { kind: "report", reportType: "briefing", promptKey: "decision.briefing" },
      {
        kind: "infographic",
        prompt:
          "The three careers side by side: median pay, projected growth, typical entry education and the core day-to-day tasks of each.",
        orientation: "landscape",
        detailLevel: "standard",
      },
      {
        kind: "writtenQuestions",
        questionCount: 5,
        difficulty: "medium",
        questionType: "short",
        promptKey: "decision.interview",
      },
      { kind: "audio", audioType: "debate", length: "default", promptKey: "decision.debate" },
    ],
    deepResearch: {
      query:
        "How is hiring for entry-level data scientists, software developers and statisticians changing in 2025–2026, including the effect of AI tools on junior roles, and which skills do employers now ask for in each?",
      channels: ["notebook", "web", "news"],
    },
  },
];
