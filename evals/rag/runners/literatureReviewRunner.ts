import type { Id } from "../../../convex/_generated/dataModel";
import type { PaperScope } from "../../../convex/literatureReview/notebookPapers";
import type { EvalFixture, StudioOutput } from "../types";
import { runWithHarness } from "./harness";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";

export interface LiteratureReviewEvalResult {
  sessionId: string;
  tableId: string;
  reportId: string;
  searchQueries: string[];
  confirmedColumns: Array<{ id: string; name: string; instructions?: string; isVisible: boolean }>;
  counts: {
    found: number;
    deduplicated: number;
    screened: number;
    /** Search papers included by screening. */
    included: number;
    /** Selected notebook papers, included without screening (#301). Absent in older results. */
    fromNotebook?: number;
    extractedRows: number;
    /** Rows whose extraction call failed (#398). Absent in older results. */
    extractionFailedRows?: number;
  };
  stagePapers: {
    search: Array<{
      title: string;
      authors: string[];
      year?: number;
      abstract: string;
      url: string;
      pdfUrl?: string;
      source: string;
      citationCount?: number;
      doi?: string;
      score: number;
      isIncluded?: boolean;
      includeReason?: string;
    }>;
    deduped: Array<{
      title: string;
      authors: string[];
      year?: number;
      abstract: string;
      url: string;
      pdfUrl?: string;
      source: string;
      citationCount?: number;
      doi?: string;
      score: number;
      isIncluded?: boolean;
      includeReason?: string;
    }>;
    ranked: Array<{
      title: string;
      authors: string[];
      year?: number;
      abstract: string;
      url: string;
      pdfUrl?: string;
      source: string;
      citationCount?: number;
      doi?: string;
      score: number;
      isIncluded?: boolean;
      includeReason?: string;
    }>;
    screened: Array<{
      title: string;
      authors: string[];
      year?: number;
      abstract: string;
      url: string;
      pdfUrl?: string;
      source: string;
      citationCount?: number;
      doi?: string;
      score: number;
      isIncluded?: boolean;
      includeReason?: string;
    }>;
  };
  screeningDecisions: Array<{ title: string; isIncluded: boolean; reason?: string }>;
  extractionCoverage: Array<{
    columnId: string;
    columnName: string;
    filledCount: number;
    totalCount: number;
    coverageRatio: number;
  }>;
  extractionSamples: Array<{
    paperTitle: string;
    columnName: string;
    extractedValue: string;
  }>;
  table: {
    title: string;
    columns: Array<{ id: string; name: string }>;
    papers: Array<{ rowData: Record<string, string>; includeReason?: string; isIncluded: boolean }>;
  };
  report: {
    title: string;
    content: string;
    sections: Array<{ heading: string; content: string }>;
  };
  workflowProvenance?: {
    searchQueries?: string[];
    databasesUsed?: string[];
    recordsIdentified?: number;
    recordsAfterDedupe?: number;
    recordsRanked?: number;
    recordsScreened?: number;
    recordsIncluded?: number;
    recordsExcluded?: number;
    recordsFromNotebook?: number;
    /** "Only your papers": no database search ran. */
    searchSkipped?: boolean;
    extractedRowCount?: number;
  };
  latencyMs: number;
}

export interface LiteratureReviewInvoker {
  invoke(args: {
    question: string;
    notebookId: Id<"notebooks">;
    /** Notebook sources to include as papers; the action keeps only PDFs and saved papers. */
    documentIds?: Id<"documents">[];
    paperScope?: PaperScope;
  }): Promise<LiteratureReviewEvalResult>;
}

function validateFixture(fixture: EvalFixture): string[] {
  const errors: string[] = [];
  if (!fixture.id) errors.push("Fixture missing id");
  if (!fixture.question?.trim()) errors.push("Fixture missing question");
  if (!fixture.notebookId) {
    errors.push("Literature review fixture must specify a notebookId");
  }
  if (!Array.isArray(fixture.expectedItems)) {
    errors.push("expectedItems must be an array");
  } else if (fixture.expectedItems.length === 0 && !fixture.expectedAnswer?.trim()) {
    errors.push("Fixture must have at least one expectedItem or a non-empty expectedAnswer");
  }
  return errors;
}

function serializeLiteratureReview(result: LiteratureReviewEvalResult): string {
  const tableLines = [
    `# ${result.table.title}`,
    "",
    `Found: ${result.counts.found}`,
    `Included: ${result.counts.included}`,
    ...(result.counts.fromNotebook ? [`From your notebook: ${result.counts.fromNotebook}`] : []),
    ...(result.counts.extractionFailedRows
      ? [`Extraction failed: ${result.counts.extractionFailedRows}`]
      : []),
    "",
    result.table.columns.map((c) => c.name).join(" | "),
    ...result.table.papers.map((paper) =>
      result.table.columns.map((c) => paper.rowData[c.id] ?? "").join(" | ")
    ),
  ];

  // Report first so eval judges see the narrative synthesis before the table data
  return [`# ${result.report.title}`, "", result.report.content, "", tableLines.join("\n")].join(
    "\n"
  );
}

export async function runLiteratureReviewEval(
  options: EvalRunnerOptions,
  invoker?: LiteratureReviewInvoker
): Promise<EvalRunnerResult> {
  const { fixture } = options;
  return runWithHarness(options, invoker, {
    runner: "literatureReview",
    validate: validateFixture,
    missingInvokerMessage:
      "No LiteratureReviewInvoker provided for real run. " +
      "Use --dry-run to validate fixtures without invoking literature review actions.",
    failurePrefix: "Literature review invocation failed",
    async invoke(literatureReview, configHash) {
      const paperScope = fixture.studioParams?.paperScope;
      const result = await literatureReview.invoke({
        question: fixture.question,
        notebookId: fixture.notebookId as Id<"notebooks">,
        ...(fixture.documentIds?.length
          ? { documentIds: fixture.documentIds as Id<"documents">[] }
          : {}),
        ...(paperScope ? { paperScope } : {}),
      });

      const studioOutput: StudioOutput = { kind: "literatureReview", raw: result };
      return {
        caseId: fixture.id,
        runner: "literatureReview",
        configHash,
        answer: serializeLiteratureReview(result),
        citations: [],
        preRerankChunks: [],
        postRerankChunks: [],
        selectedChunks: [],
        subQueries: result.searchQueries,
        studioOutput,
        latencyMs: result.latencyMs,
        timestamp: new Date().toISOString(),
      };
    },
  });
}
