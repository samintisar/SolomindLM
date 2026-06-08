/**
 * Report type definitions and utilities
 */

export interface ReportTypeConfig {
  id: string;
  displayName: string;
  description: string;
}

export const REPORT_TYPES: Record<string, ReportTypeConfig> = {
  custom: {
    id: "custom",
    displayName: "Custom",
    description: "Custom Report",
  },
  briefing: {
    id: "briefing",
    displayName: "Briefing Doc",
    description: "Briefing Document",
  },
  study_guide: {
    id: "study_guide",
    displayName: "Study Guide",
    description: "Study Guide",
  },
  blog_post: {
    id: "blog_post",
    displayName: "Blog Post",
    description: "Blog Post",
  },
  summary: {
    id: "summary",
    displayName: "Summary",
    description: "Summary",
  },
  technical_report: {
    id: "technical_report",
    displayName: "Technical Report",
    description: "Technical Report",
  },
  concept_explainer: {
    id: "concept_explainer",
    displayName: "Concept Explainer",
    description: "Concept Explainer",
  },
  methodology_overview: {
    id: "methodology_overview",
    displayName: "Methodology Overview",
    description: "Methodology Overview",
  },
  literature_review: {
    id: "literature_review",
    displayName: "Literature Review",
    description: "Literature Review",
  },
};

/**
 * Normalize report type ID (handle various formats)
 * @param reportTypeId - The report type ID to normalize
 * @returns The normalized report type ID
 */
export function normalizeReportTypeId(reportTypeId: string): string {
  if (!reportTypeId) return "custom";

  // If it's already a valid key, return it
  if (reportTypeId in REPORT_TYPES) {
    return reportTypeId;
  }

  // Try to normalize by converting to lowercase and replacing spaces with underscores
  const normalized = reportTypeId.toLowerCase().replace(/\s+/g, "_");
  if (normalized in REPORT_TYPES) {
    return normalized;
  }

  // Return custom as default
  return "custom";
}

/**
 * Get the display name for a report type
 * @param reportTypeId - The report type ID
 * @returns The display name for the report type
 */
export function getReportTypeDisplayName(reportTypeId: string): string {
  const normalized = normalizeReportTypeId(reportTypeId);
  return REPORT_TYPES[normalized]?.displayName || "Report";
}

/**
 * Get the subtitle for a report item
 * @param reportTypeId - The report type ID
 * @returns The subtitle string in format "Report · {DisplayName}"
 */
export function isLiteratureReviewReportType(reportTypeId: string): boolean {
  return normalizeReportTypeId(reportTypeId) === "literature_review";
}

export function getReportSubtitle(reportTypeId: string): string {
  const normalized = normalizeReportTypeId(reportTypeId);
  if (normalized === "literature_review") {
    return "Literature Review";
  }
  const displayName = getReportTypeDisplayName(normalized);
  return `Report · ${displayName}`;
}
