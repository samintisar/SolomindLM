import type { MetricResult, EvalReport } from "../types";
import { groupFailures } from "./failureGrouper";

export interface GenerateReportOptions {
  /** Commit SHA to include in the report */
  commitSha: string;
  /** Include warnings in failure groups (default: true) */
  includeWarnings?: boolean;
  /** Group results by source policy for A/B comparison */
  groupBySourcePolicy?: boolean;
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

  // Source Policy Comparison (if source-matrix was used)
  const sourcePolicyMetrics = report.metrics.filter((m) => m.metric === "expected_item_recall" && m.caseId.includes("--src"));
  if (sourcePolicyMetrics.length > 0) {
    lines.push("  Source Policy Comparison:");
    lines.push("  " + "-".repeat(50));

    // Group by base case ID
    const byBaseCase = new Map<string, typeof sourcePolicyMetrics>();
    for (const m of sourcePolicyMetrics) {
      const baseId = m.caseId.split("--src")[0];
      if (!byBaseCase.has(baseId)) byBaseCase.set(baseId, []);
      byBaseCase.get(baseId)!.push(m);
    }

    for (const [baseId, variants] of byBaseCase) {
      lines.push(`    ${baseId}:`);
      for (const v of variants.sort((a, b) => b.score - a.score)) {
        const channelInfo = v.configHash.slice(0, 20); // First 20 chars of config hash
        const icon = v.status === "pass" ? "✓" : v.status === "warn" ? "!" : "✗";
        lines.push(`      ${icon} ${v.score.toFixed(2)}  ${channelInfo}  ${v.detail.slice(0, 60)}`);
      }
      lines.push("");
    }
    lines.push("");
  }

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
