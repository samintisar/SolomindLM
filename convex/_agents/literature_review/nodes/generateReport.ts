"use node";

import type { LiteratureReviewStateType } from "../state";
import type { LiteratureReviewNodeDeps, ReportSection } from "../types";
import { buildReportSectionPrompt, ReportSectionSchema } from "../prompts";
import { createLLM } from "../../_shared/llm_factory";
import { trackResearchStep } from "../../research/steps";
import { createServiceLogger } from "../../../_lib/logging/serviceLogger";

const SECTIONS = ["abstract", "introduction", "methods", "results", "discussion", "conclusion"];

/**
 * generateReport node: Generate formal academic report section-by-section.
 *
 * Each section is 400-600 words and generated as a separate LLM call.
 * Better quality than single long prompt + easier retry.
 *
 * Input:  state.extractedData, state.confirmedColumns, state.screenedPapers
 * Output: state.reportId
 */
export async function generateReportNode(
  state: LiteratureReviewStateType,
  deps: LiteratureReviewNodeDeps
): Promise<Partial<LiteratureReviewStateType>> {
  const { extractedData, screenedPapers, query } = state;

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "generating_report",
      "in_progress",
      "Generating formal literature review report..."
    );
  }

  const llm = createLLM({
    apiKey: deps.apiKey,
    mapModel: deps.smartModel,
    phase: "smart",
    temperatures: { map: 0.3 },
    maxTokens: 2000,
  });

  const structured = llm.withStructuredOutput(ReportSectionSchema);

  // Build paper data for prompts
  const includedPapers = screenedPapers.filter((p) => p.isIncluded);
  const papers = includedPapers.map((paper) => {
    const paperId = paper.doi || paper.title;
    return {
      title: paper.title,
      authors: paper.authors || [],
      year: paper.year,
      extractedData: extractedData[paperId] || {},
    };
  });

  // Generate citation keys
  const citationKeys: Record<string, string> = {};
  const usedKeys = new Set<string>();
  for (const paper of papers) {
    const baseKey = paper.authors.length > 0
      ? `${paper.authors[0].split(" ").pop()}${paper.year || ""}`
      : `${paper.title.slice(0, 3)}${paper.year || ""}`;
    let key = baseKey;
    let suffix = "a";
    while (usedKeys.has(key)) {
      key = baseKey + suffix;
      suffix = String.fromCharCode(suffix.charCodeAt(0) + 1);
    }
    usedKeys.add(key);
    citationKeys[paper.title] = key;
  }

  // Generate each section sequentially
  const sections: ReportSection[] = [];
  let fullContent = "";

  for (let i = 0; i < SECTIONS.length; i++) {
    const sectionName = SECTIONS[i];
    const progressMsg = `Generating section ${i + 1}/${SECTIONS.length}: ${sectionName}...`;

    if (deps.ctx && deps.sessionId) {
      await trackResearchStep(
        deps.ctx,
        deps.sessionId,
        "literature_review",
        "generating_report",
        "in_progress",
        progressMsg
      );
    }

    try {
      const prompt = buildReportSectionPrompt(sectionName, query, papers, citationKeys);
      const parsed = await structured.invoke([{ role: "user", content: prompt }]);

      sections.push({
        heading: parsed.heading,
        content: parsed.content,
      });

      fullContent += `## ${parsed.heading}\n\n${parsed.content}\n\n`;
    } catch (err) {
      const logger = createServiceLogger("literature_review", "generateReport");
      logger.error("Report section generation failed", err, { section: sectionName });
      // On failure, add placeholder section
      sections.push({
        heading: sectionName.charAt(0).toUpperCase() + sectionName.slice(1),
        content: `[Section generation failed — please retry]`,
      });
    }
  }

  let reportId: string | undefined;

  // TODO: Create literatureReports row in database
  // This requires studio/literature_reports module (Task 9)
  // For now, reportId remains undefined until the module is implemented
  if (deps.ctx) {
    // Placeholder: will call internal.studio.literature_reports.create when available
    reportId = undefined;
  }

  if (deps.ctx && deps.sessionId) {
    await trackResearchStep(
      deps.ctx,
      deps.sessionId,
      "literature_review",
      "generating_report",
      "completed",
      `Generated report with ${sections.length} sections`,
      { paperCount: includedPapers.length }
    );
  }

  return {
    reportId,
    progress: {
      phase: "completed",
      percentage: 100,
      message: `Literature review complete! Table and report generated with ${includedPapers.length} papers.`,
    },
  };
}
