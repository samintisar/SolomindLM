import type { EvalFixture, EvalRunArtifact, StudioOutput } from "../types";
import { computeConfigHash } from "../configHash";
import type { EvalRunnerOptions, EvalRunnerResult } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";

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
    included: number;
    extractedRows: number;
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
    extractedRowCount?: number;
  };
  latencyMs: number;
}

export interface LiteratureReviewInvoker {
  invoke(args: {
    question: string;
    notebookId: Id<"notebooks">;
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

function stubArtifact(fixture: EvalFixture, configHash: string): EvalRunArtifact {
  return {
    caseId: fixture.id,
    runner: "literatureReview",
    configHash,
    answer: "",
    citations: [],
    preRerankChunks: [],
    postRerankChunks: [],
    selectedChunks: [],
    subQueries: [],
    latencyMs: 0,
    timestamp: new Date().toISOString(),
  };
}

function serializeLiteratureReview(result: LiteratureReviewEvalResult): string {
  const tableLines = [
    `# ${result.table.title}`,
    "",
    `Found: ${result.counts.found}`,
    `Included: ${result.counts.included}`,
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
  const { fixture, config, dryRun } = options;
  const configHash = computeConfigHash(config);

  const validationErrors = validateFixture(fixture);
  if (validationErrors.length > 0) {
    return { artifact: stubArtifact(fixture, configHash), errors: validationErrors };
  }

  if (dryRun) {
    return { artifact: stubArtifact(fixture, configHash), errors: [] };
  }

  if (!invoker) {
    throw new Error(
      "No LiteratureReviewInvoker provided for real run. " +
        "Use --dry-run to validate fixtures without invoking literature review actions."
    );
  }

  const errors: string[] = [];
  try {
    const result = await invoker.invoke({
      question: fixture.question,
      notebookId: fixture.notebookId as Id<"notebooks">,
    });

    const answer = serializeLiteratureReview(result);
    const studioOutput: StudioOutput = { kind: "literatureReview", raw: result };
    const artifact: EvalRunArtifact = {
      caseId: fixture.id,
      runner: "literatureReview",
      configHash,
      answer,
      citations: [],
      preRerankChunks: [],
      postRerankChunks: [],
      selectedChunks: [],
      subQueries: result.searchQueries,
      studioOutput,
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    };

    return { artifact, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Literature review invocation failed: ${message}`);
    return { artifact: stubArtifact(fixture, configHash), errors };
  }
}
