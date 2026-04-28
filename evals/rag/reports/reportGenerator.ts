import type { MetricResult, EvalReport } from "../types";
import { groupFailures } from "./failureGrouper";

export interface GenerateReportOptions {
  /** Commit SHA to include in the report */
  commitSha: string;
  /** Include warnings in failure groups (default: true) */
  includeWarnings?: boolean;
}

/**
 * Generate a full EvalReport from metric results.
 */
export function generateReport(
  metrics: MetricResult[],
  options: GenerateReportOptions
): EvalReport {
  const summary = { pass: 0, fail: 0, warn: 0, info: 0 };
  for (const m of metrics) {
    summary[m.status]++;
  }

  const failureGroups = groupFailures(metrics, {
    includeWarnings: options.includeWarnings,
  });

  // Deduplicate case count
  const uniqueCases = new Set(metrics.map((m) => `${m.caseId}::${m.runner}`));

  return {
    timestamp: new Date().toISOString(),
    commitSha: options.commitSha,
    totalCases: uniqueCases.size,
    summary,
    metrics,
    failureGroups,
  };
}

/**
 * Format a report as a human-readable string for console output.
 */
export function formatReport(report: EvalReport): string {
  const lines: string[] = [
    "═══════════════════════════════════════",
    "  RAG Eval Report",
    "═══════════════════════════════════════",
    `  Timestamp : ${report.timestamp}`,
    `  Commit    : ${report.commitSha.slice(0, 8)}`,
    `  Cases     : ${report.totalCases}`,
    "",
    "  Summary:",
    `    PASS : ${report.summary.pass}`,
    `    FAIL : ${report.summary.fail}`,
    `    WARN : ${report.summary.warn}`,
    `    INFO : ${report.summary.info}`,
    "",
  ];

  if (report.failureGroups.length > 0) {
    lines.push("  Failure Groups:");
    for (const group of report.failureGroups) {
      lines.push(`    [${group.category}] ${group.suggestedFix}`);
      lines.push(`      Target files: ${group.targetFiles.join(", ")}`);
      for (const c of group.cases) {
        lines.push(`      Case: ${c.caseId} (${c.runner})`);
        for (const hint of c.traceHints ?? []) {
          lines.push(`        - ${hint}`);
        }
      }
      lines.push("");
    }
  } else {
    lines.push("  All metrics passing. No failures.");
  }

  lines.push("═══════════════════════════════════════");
  return lines.join("\n");
}
