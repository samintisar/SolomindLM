"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps } from "../types";
import { trackResearchStep } from "../../research/steps";
import { internal } from "../../../_generated/api";

/**
 * generateTable node: Create literatureTables row from extracted data.
 *
 * Reads from extractedData (in-memory during workflow execution).
 * In production with workflow resumption, reads from literatureTableDrafts instead.
 *
 * Input:  state.extractedData, state.confirmedColumns, state.screenedPapers
 * Output: state.tableId, state.tableColumns
 */
export async function generateTableNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { extractedData, confirmedColumns, screenedPapers, query, notebookId, userId } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "populating",
      "in_progress",
      "Creating literature comparison table..."
    );
  }

  // Build table columns with system columns + confirmed columns
  const tableColumns = [
    {
      id: "paper_title",
      name: "Paper Title",
      type: "paper_title" as const,
      isVisible: true,
      isSystem: true,
      order: 0,
    },
    {
      id: "authors",
      name: "Authors",
      type: "authors" as const,
      isVisible: true,
      isSystem: true,
      order: 1,
    },
    {
      id: "year",
      name: "Year",
      type: "year" as const,
      isVisible: true,
      isSystem: true,
      order: 2,
    },
    ...confirmedColumns.map((col, index) => ({
      id: col.id,
      name: col.name,
      type: "custom" as const,
      instructions: col.instructions,
      isVisible: col.isVisible ?? true,
      isSystem: false,
      order: index + 3,
    })),
  ];

  // Build papers array for the table
  const includedPapers = screenedPapers.filter((p) => p.isIncluded);

  // Create or get citations for each included paper
  const citationIdMap: Record<string, string> = {};
  if (deps.ctx) {
    for (const paper of includedPapers) {
      const paperId = paper.doi || paper.title;
      const citationKey = paper.authors.length > 0
        ? `${paper.authors[0].split(" ").pop()}${paper.year || ""}`
        : `${paper.title.slice(0, 3)}${paper.year || ""}`;

      const citationId = await deps.ctx.runMutation(
        internal.studio.literature_tables.index.createCitation,
        {
          paperId,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          doi: paper.doi,
          url: paper.url,
          pdfUrl: paper.pdfUrl,
          sourceApi: paper.source,
          citationCount: paper.citationCount,
          abstract: paper.abstract,
          citationKey,
        }
      );
      citationIdMap[paperId] = citationId;
    }
  }

  const tablePapers = includedPapers.map((paper) => {
    const paperId = paper.doi || paper.title;
    const rowData = extractedData[paperId] || {};

    // Add system column data
    rowData["paper_title"] = paper.title;
    rowData["authors"] = paper.authors?.join(", ") || "Unknown";
    rowData["year"] = paper.year?.toString() || "n.d.";

    return {
      citationId: citationIdMap[paperId] as any,
      rowData,
      includeReason: paper.includeReason,
      isIncluded: paper.isIncluded,
    };
  });

  let tableId: string | undefined;

  // Persist literature table to database
  if (deps.ctx && notebookId && userId) {
    tableId = await deps.ctx.runMutation(
      internal.studio.literature_tables.index.createLiteratureTable,
      {
        title: query || "Literature Review Table",
        description: `Literature comparison table for: ${query}`,
        notebookId: notebookId as any,
        userId: userId as any,
        columns: tableColumns.map((col) => ({
          id: col.id,
          name: col.name,
          type: col.type,
          instructions: (col as any).instructions,
          isVisible: col.isVisible,
          isSystem: col.isSystem,
          order: col.order,
        })),
        papers: tablePapers,
      }
    );
  }

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "populating",
      "completed",
      `Created literature table with ${tablePapers.length} papers and ${tableColumns.length} columns`,
      { paperCount: tablePapers.length }
    );
  }

  return {
    tableId,
    tableColumns,
    progress: {
      phase: "populating",
      percentage: 80,
      message: `Created literature table with ${tablePapers.length} papers and ${tableColumns.length} columns.`,
    },
  };
}
