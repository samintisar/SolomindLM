import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { EvalReport } from "../types";
import { formatWorkOrder, PROMPT_RULES_FROM_AGENTS_MD } from "./workOrder";

const report: EvalReport = {
  timestamp: "2026-10-17T03:17:00.000Z",
  commitSha: "0123456789abcdef",
  totalCases: 3,
  split: "smoke",
  summary: { pass: 4, fail: 2, warn: 0, info: 1 },
  metrics: [],
  failureGroups: [
    {
      category: "retrieval",
      suggestedFix: "Improve vector/keyword search so expected items appear in retrieved chunks",
      targetFiles: ["convex/_agents/chat/hybrid_search.ts", "convex/_services/processing/"],
      cases: [
        {
          caseId: "agentic-patterns-20",
          runner: "chat",
          failures: [],
          traceHints: ["expected_item_recall: 3/20 items found"],
        },
        {
          caseId: "ml-basic-2",
          runner: "chat",
          failures: [],
          traceHints: ["retrieval_item_recall_top5: 0/2 items found"],
        },
      ],
    },
  ],
  flaky: [
    {
      caseId: "ml-basic-2",
      runner: "chat",
      metric: "binary_judge_chat_grounding",
      statuses: ["pass", "fail", "pass"],
    },
  ],
};

describe("formatWorkOrder", () => {
  const md = formatWorkOrder(report, { repeats: 3, split: "smoke" });

  it("writes a header with commit, split and totals", () => {
    expect(md).toContain("# Eval work order");
    expect(md).toContain("- Commit: `01234567`");
    expect(md).toContain("- Split: smoke");
    expect(md).toContain("- Repeats: 3");
    expect(md).toContain("- Cases: 3\n");
    expect(md).toContain("- Metric rows: pass 4, fail 2, warn 0, info 1\n");
  });

  it("writes each failure group with its category, target files and cases", () => {
    expect(md).toContain(
      "## [retrieval] Improve vector/keyword search so expected items appear in retrieved chunks"
    );
    expect(md).toContain(
      "Target files:\n- convex/_agents/chat/hybrid_search.ts\n- convex/_services/processing/"
    );
    expect(md).toContain("### agentic-patterns-20 (chat)");
    expect(md).toContain("- expected_item_recall: 3/20 items found");
    expect(md).toContain("### ml-basic-2 (chat)");
    expect(md).toContain("- retrieval_item_recall_top5: 0/2 items found");
  });

  it("gives the exact re-run command for every case", () => {
    expect(md).toContain("bun run eval:rag -- --case agentic-patterns-20 --repeats 3 --verbose");
    expect(md).toContain("bun run eval:rag -- --case ml-basic-2 --repeats 3 --verbose");
  });

  it("lists flaky rows under a section that says they are not actionable", () => {
    const flakySection = md.split("## Flaky (not actionable this run)")[1]?.split("## Rules")[0];
    expect(flakySection).toContain(
      "- ml-basic-2 (chat) binary_judge_chat_grounding: pass, fail, pass"
    );
  });

  it("closes with the AGENTS.md prompt rules and the promotion command", () => {
    const rules = md.split("## Rules")[1] ?? "";
    expect(rules).toContain("bun run eval:holdout");
    expect(rules).toContain("bun run eval:rag -- --promotion-check <before.json> <after.json>");
    for (const line of PROMPT_RULES_FROM_AGENTS_MD) {
      if (line === "") continue;
      expect(rules).toContain(line);
    }
  });

  it("says so when there are no failure groups", () => {
    const clean = formatWorkOrder(
      { ...report, failureGroups: [], flaky: undefined },
      { repeats: 1 }
    );

    expect(clean).toContain("## No failures");
    expect(clean).toContain("## Flaky (not actionable this run)\n\nNone.");
    expect(clean).toContain("- Split: all");
  });
});

describe("PROMPT_RULES_FROM_AGENTS_MD", () => {
  it("equals the whole Prompt authoring section of AGENTS.md, line for line", () => {
    const agents = readFileSync(new URL("../../../AGENTS.md", import.meta.url), "utf-8");
    const lines = agents.split("\n");
    const start = lines.findIndex((line) => line.startsWith("## Prompt authoring"));
    expect(start).toBeGreaterThanOrEqual(0);
    // The section runs to the next level-2 heading (or end of file).
    const nextHeading = lines.findIndex((line, i) => i > start && line.startsWith("## "));
    const end = nextHeading === -1 ? lines.length : nextHeading;
    const section = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();

    // A new bullet or paragraph in AGENTS.md makes this fail until the quoted block is updated.
    expect(PROMPT_RULES_FROM_AGENTS_MD.join("\n").trim()).toBe(section);
  });
});
