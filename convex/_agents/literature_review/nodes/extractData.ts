"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, PaperExtraction } from "../types";
import { buildExtractionPrompt, ExtractionOutputSchema } from "../prompts";
import { createLLM } from "../../_shared/llm_factory";
import { trackResearchStep } from "../../research/steps";

const BATCH_SIZE = 5;

/**
 * extractData node: Batched data extraction for confirmed columns.
 *
 * Batch 5 papers per LLM call.
 * Write results to literatureTableDrafts after each batch (for resumability).
 *
 * Input:  state.screenedPapers, state.confirmedColumns, state.query
 * Output: state.extractedData
 */
export async function extractDataNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { screenedPapers, confirmedColumns, query, sessionId } = state;

  // Only extract from included papers
  const includedPapers = screenedPapers.filter((p) => p.isIncluded);

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "extracting",
      "in_progress",
      `Extracting data from ${includedPapers.length} included papers...`
    );
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: 0.2,
    maxTokens: 3000,
  });

  const structured = llm.withStructuredOutput(ExtractionOutputSchema);
  const extractedData: Record<string, Record<string, string>> = {};
  let batchNumber = 0;

  // Process in batches of 5
  for (let i = 0; i < includedPapers.length; i += BATCH_SIZE) {
    const batch = includedPapers.slice(i, i + BATCH_SIZE);
    batchNumber++;

    const batchPapers = batch.map((p) => ({
      paperId: p.doi || p.title,
      title: p.title,
      abstract: p.abstract || "",
    }));

    const extractionColumns = confirmedColumns.map((c) => ({
      id: c.id,
      name: c.name,
      instructions: c.instructions,
    }));

    const prompt = buildExtractionPrompt(query, extractionColumns, batchPapers);

    try {
      const parsed = await structured.invoke([{ role: "user", content: prompt }]);

      // Organize extractions by paper
      const batchExtractions: PaperExtraction[] = batch.map((paper) => {
        const paperId = paper.doi || paper.title;
        const rowData: Record<string, string> = {};

        for (const col of confirmedColumns) {
          const extraction = parsed.extractions.find(
            (e) => e.paperId === paperId && e.columnId === col.id
          );
          rowData[col.id] = extraction?.content || "Not specified";
        }

        return {
          paperId,
          rowData,
          includeReason: paper.includeReason,
          isIncluded: paper.isIncluded,
        };
      });

      // Write batch to literatureTableDrafts (if ctx available)
      if (deps.ctx && sessionId) {
        for (const extraction of batchExtractions) {
          // TODO: Create citation first, then draft row
          // For now, accumulate in memory
          extractedData[extraction.paperId] = extraction.rowData;
        }
      }

      // Merge into extractedData
      for (const extraction of batchExtractions) {
        extractedData[extraction.paperId] = extraction.rowData;
      }
    } catch (err) {
      // On failure, mark all columns as "Extraction failed" for this batch
      for (const paper of batch) {
        const paperId = paper.doi || paper.title;
        const rowData: Record<string, string> = {};
        for (const col of confirmedColumns) {
          rowData[col.id] = "Extraction failed";
        }
        extractedData[paperId] = rowData;
      }
    }

    if (deps.ctx && deps.sessionId) {
      await trackResearchStep(
        deps.ctx,
        deps.sessionId,
        "literature_review",
        "extracting",
        "in_progress",
        `Extracted batch ${batchNumber}/${Math.ceil(includedPapers.length / BATCH_SIZE)}`,
        { paperCount: Object.keys(extractedData).length }
      );
    }
  }

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "extracting",
      "completed",
      `Extracted data from ${Object.keys(extractedData).length} papers`,
      { paperCount: Object.keys(extractedData).length }
    );
  }

  return {
    extractedData,
    progress: {
      phase: "extracting",
      percentage: 70,
      message: `Extracted data from ${Object.keys(extractedData).length} papers across ${Math.ceil(includedPapers.length / BATCH_SIZE)} batches.`,
    },
  };
}
