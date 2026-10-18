/**
 * The showcase notebooks (public-notebooks spec, PR 3): plain data that `seed.ts` builds through
 * the app's own ingestion, Studio, literature-review and deep-research paths. Publishing a
 * notebook lets every signed-in user read its sources, so each source records its licence and
 * must be public domain or openly licensed (see the plan's Sources appendix). Studio options are
 * the ones a user can pick in the Studio dialogs; `validateManifest` checks them.
 */

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

export const SHOWCASE_NOTEBOOKS: ShowcaseNotebook[] = [];
