import type { EvalReport, FailureGroup } from "../types";

/**
 * The AGENTS.md "Prompt authoring" constraints, copied verbatim. A work order is read by a coding
 * agent, so these travel with every task. The test in workOrder.test.ts checks them against
 * AGENTS.md so the copy cannot drift.
 */
export const PROMPT_RULES_FROM_AGENTS_MD: readonly string[] = [
  "**Production prompts must be generalized.** Prompt text in `convex/_agents/`, `convex/studio/`, and any",
  "user-facing generation path must work for arbitrary user-uploaded sources — any topic, length, or format.",
  "",
  "**Strictly forbidden:**",
  "",
  "- Tuning prompts to pass RAG eval metrics (`expected_item_recall`, `written_questions_count_match`, LLM judge scores, etc.)",
  "- Referencing eval fixtures, golden notebooks, canonical expected-item lists, or test source filenames in prompts",
  "- Eval-specific examples in prompt copy (benchmark datasets, named pattern lists, notebook IDs, etc.)",
  "",
  "**When evals fail**, fix with pipeline engineering — chunking, buffer multipliers, multi-round map/recovery,",
  "deduplication, selection logic, padding, timeouts, retrieval scope — not eval-targeted instructions.",
];

export interface WorkOrderOptions {
  /** Repeats the run used; the re-run commands carry it */
  repeats: number;
  split?: string;
}

function groupSection(group: FailureGroup, repeats: number): string[] {
  const lines = [
    `## [${group.category}] ${group.suggestedFix}`,
    "",
    "Target files:",
    ...group.targetFiles.map((file) => `- ${file}`),
    "",
  ];
  for (const c of group.cases) {
    lines.push(`### ${c.caseId} (${c.runner})`);
    for (const hint of c.traceHints ?? []) {
      lines.push(`- ${hint}`);
    }
    lines.push("");
    lines.push("Re-run:");
    lines.push("```");
    lines.push(`bun run eval:rag -- --case ${c.caseId} --repeats ${repeats} --verbose`);
    lines.push("```");
    lines.push("");
  }
  return lines;
}

/** Markdown task list for a coding agent, built from one report's failure groups. Pure. */
export function formatWorkOrder(report: EvalReport, opts: WorkOrderOptions): string {
  const { pass, fail, warn, info } = report.summary;
  const lines: string[] = [
    "# Eval work order",
    "",
    `- Commit: \`${report.commitSha.slice(0, 8)}\``,
    `- Split: ${opts.split ?? "all"}`,
    `- Repeats: ${opts.repeats}`,
    `- Cases: ${report.totalCases} (pass ${pass}, fail ${fail}, warn ${warn}, info ${info})`,
    "",
    "Work the groups top to bottom. Fix each group in its target files (or other pipeline files, per",
    "the rules below), then re-run its cases until they are stable across repeats.",
    "",
  ];

  if (report.failureGroups.length === 0) {
    lines.push("## No failures", "", "Nothing to fix in this run.", "");
  }
  for (const group of report.failureGroups) {
    lines.push(...groupSection(group, opts.repeats));
  }

  lines.push("## Flaky (not actionable this run)", "");
  if (report.flaky && report.flaky.length > 0) {
    for (const f of report.flaky) {
      lines.push(`- ${f.caseId} (${f.runner}) ${f.metric}: ${f.statuses.join(", ")}`);
    }
  } else {
    lines.push("None.");
  }
  lines.push("");

  lines.push("## Rules", "");
  lines.push(...PROMPT_RULES_FROM_AGENTS_MD);
  lines.push("");
  lines.push(
    "Prompt files are outside the allowed set by default. Only the eval-fix skill's narrow exception applies.",
    ""
  );
  lines.push("Before a fix is promoted, run the holdout and the promotion check:", "");
  lines.push("```");
  lines.push("bun run eval:holdout");
  lines.push("bun run eval:rag -- --promotion-check <before.json> <after.json>");
  lines.push("```", "");

  return lines.join("\n");
}
