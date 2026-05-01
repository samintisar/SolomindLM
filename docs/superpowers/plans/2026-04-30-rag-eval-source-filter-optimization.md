# RAG Eval Source Filter Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the RAG eval pipeline to test and optimize chat/deep research agent performance across different source filter configurations (notebook-only, web+news, academic, all-sources).

**Architecture:** Add optional `sourcePolicy` to eval fixtures and the Convex eval action. Run the same fixture with multiple channel combinations via a source matrix CLI flag. Capture per-source-type evidence in research artifacts. Add metrics to score source coverage, diversity, and per-channel recall. Report groups results by `(fixtureId, sourcePolicy)` for A/B comparison.

**Tech Stack:** TypeScript, Convex actions, existing RAG eval harness (`evals/rag/`).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `evals/rag/types.ts` | **Modify** | Add `sourcePolicy` to `EvalFixture` and `EvalRunArtifact` |
| `convex/eval/chatEvalAction.ts` | **Modify** | Accept `sourcePolicy` in args, pass to ChatAgent |
| `evals/rag/runners/convexChatInvoker.ts` | **Modify** | Forward `sourcePolicy` from fixture to Convex action |
| `evals/rag/runners/chatRunner.ts` | **Modify** | Include `sourcePolicy` in `ChatAgentContext` |
| `evals/rag/metrics/sourceAware.ts` | **Create** | Source diversity, per-channel recall, cross-run comparison metrics |
| `evals/rag/metrics/scorers.ts` | **Modify** | Wire in new source-aware metrics |
| `evals/rag/fixtures/sourceFilterVariants.ts` | **Create** | Helper to generate source-filtered fixture variants |
| `evals/rag/cli.ts` | **Modify** | Add `--source-matrix` CLI option and batching logic |
| `evals/rag/reports/reportGenerator.ts` | **Modify** | Group results by `(fixtureId, sourcePolicy)` in report |

---

## Task 1: Extend Eval Types with Source Policy

**Files:**
- Modify: `evals/rag/types.ts`
- Modify: `evals/rag/runners/types.ts`

- [ ] **Step 1: Add source policy types to `EvalFixture`**

In `evals/rag/types.ts`, after the `StudioParams` interface (around line 40), add:

```typescript
export interface SourcePolicyConfig {
  channels: string[];
  maxResultsPerChannel?: number;
  domainAllowlist?: string[];
  recencyDays?: number;
}
```

Then in `EvalFixture` (around line 90), add an optional field:

```typescript
  /** Source filter configuration for testing retrieval across different channels */
  sourcePolicy?: SourcePolicyConfig;
```

- [ ] **Step 2: Add source tracking to `EvalRunArtifact`**

In `EvalRunArtifact` (around line 160), add:

```typescript
  /** Source policy used for this run */
  sourcePolicy?: SourcePolicyConfig;
  /** Per-source-type evidence found (research runner only) */
  sourceEvidence?: Array<{
    channel: string;
    sourceCount: number;
    topDomains?: string[];
  }>;
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add evals/rag/types.ts
git commit -m "feat(eval): add sourcePolicy to fixture and artifact types"
```

---

## Task 2: Update Convex Eval Action to Accept Source Policy

**Files:**
- Modify: `convex/eval/chatEvalAction.ts`

- [ ] **Step 1: Add `sourcePolicy` to action args**

In `chatEvalActionArgs` (around line 31), add:

```typescript
  sourcePolicy: v.optional(
    v.object({
      channels: v.array(v.string()),
      maxResultsPerChannel: v.optional(v.number()),
      domainAllowlist: v.optional(v.array(v.string())),
      recencyDays: v.optional(v.number()),
    })
  ),
```

- [ ] **Step 2: Pass source policy to ChatAgent**

In the `handler` (around line 204), change the `agent.streamResponse` call from:

```typescript
    for await (const chunk of agent.streamResponse(
      {
        userId: userIdStr,
        noteId: notebookIdStr,
        conversationHistory: [],
        documentIds: documentIdStrings,
        enableNotebookSearch: true,
      },
      args.question,
      `eval-${Date.now()}`
    )) {
```

To:

```typescript
    const sourcePolicyChannels = args.sourcePolicy?.channels ?? ["notebook"];
    const isNotebookOnly = sourcePolicyChannels.length === 1 && sourcePolicyChannels[0] === "notebook";

    for await (const chunk of agent.streamResponse(
      {
        userId: userIdStr,
        noteId: notebookIdStr,
        conversationHistory: [],
        documentIds: documentIdStrings,
        enableNotebookSearch: sourcePolicyChannels.includes("notebook"),
        sourcePolicy: {
          channels: sourcePolicyChannels,
          maxResultsPerChannel: args.sourcePolicy?.maxResultsPerChannel ?? 5,
          ...(args.sourcePolicy?.domainAllowlist ? { domainAllowlist: args.sourcePolicy.domainAllowlist } : {}),
          ...(args.sourcePolicy?.recencyDays ? { recencyDays: args.sourcePolicy.recencyDays } : {}),
        },
        externalChunks: undefined,
      },
      args.question,
      `eval-${Date.now()}`
    )) {
```

- [ ] **Step 3: Return source policy in result**

In the return statement (around line 287), add:

```typescript
      sourcePolicy: args.sourcePolicy,
```

Also update the `ChatEvalResult` interface (around line 38) to include:

```typescript
  sourcePolicy?: {
    channels: string[];
    maxResultsPerChannel?: number;
  };
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck:convex
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/eval/chatEvalAction.ts
git commit -m "feat(eval): accept sourcePolicy in chatEvalAction"
```

---

## Task 3: Thread Source Policy Through Eval Invoker Chain

**Files:**
- Modify: `evals/rag/runners/convexChatInvoker.ts`
- Modify: `evals/rag/runners/chatRunner.ts`

- [ ] **Step 1: Update `ChatAgentContext` to include sourcePolicy**

In `evals/rag/runners/chatRunner.ts`, update the `ChatAgentContext` interface (around line 120):

```typescript
  const agentContext: ChatAgentContext = {
    userId: "__eval_unused__",
    noteId: fixture.notebookId ?? "",
    conversationHistory: [{ role: "user", content: fixture.question }],
    documentIds: fixture.documentIds,
    sourcePolicy: fixture.sourcePolicy,
  };
```

- [ ] **Step 2: Update `ChatAgentInvoker` interface to accept sourcePolicy**

In `evals/rag/runners/chatRunner.ts`, update the `ChatAgentInvoker` interface (around line 13):

```typescript
export interface ChatAgentInvoker {
  invoke(context: ChatAgentContext & { sourcePolicy?: import("../types").SourcePolicyConfig }): Promise<{
    answer: string;
    citations: string[];
    subQueries: string[];
    preRerankChunks: ReferenceChunk[];
    postRerankChunks: ReferenceChunk[];
    selectedChunks: ReferenceChunk[];
    latencyMs: number;
    tokenUsage?: { prompt: number; completion: number; total: number };
    sourcePolicy?: import("../types").SourcePolicyConfig;
  }>;
}
```

- [ ] **Step 3: Forward sourcePolicy in Convex invoker**

In `evals/rag/runners/convexChatInvoker.ts`, update the `invoke` method (around line 32):

```typescript
      const result = await client.action(api.eval.chatEvalAction.runChatEval, {
        evalSecret: options.evalSecret,
        question: lastMessage.content,
        notebookId: context.noteId as Id<"notebooks">,
        documentIds: context.documentIds as Id<"documents">[] | undefined,
        sourcePolicy: context.sourcePolicy,
      });
```

And update the return to include:

```typescript
        sourcePolicy: result.sourcePolicy,
```

- [ ] **Step 4: Update artifact construction in chatRunner**

In `evals/rag/runners/chatRunner.ts`, in the artifact construction (around line 132), add:

```typescript
      sourcePolicy: result.sourcePolicy,
```

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add evals/rag/runners/chatRunner.ts evals/rag/runners/convexChatInvoker.ts
git commit -m "feat(eval): thread sourcePolicy through invoker chain"
```

---

## Task 4: Create Source-Aware Metrics

**Files:**
- Create: `evals/rag/metrics/sourceAware.ts`
- Modify: `evals/rag/metrics/scorers.ts`

- [ ] **Step 1: Create `sourceAware.ts`**

```typescript
/**
 * Source-aware metrics for evaluating retrieval and answer quality
 * across different source channel configurations.
 */
import type { EvalFixture, EvalRunArtifact, EvalBaseline, MetricResult, MetricStatus } from "../types";

function baseMetric(
  metric: string,
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  status: MetricStatus,
  score: number,
  detail: string,
  breakdown?: Record<string, unknown>,
): MetricResult {
  return {
    metric,
    caseId: fixture.id,
    runner: artifact.runner,
    configHash: artifact.configHash,
    status,
    score,
    detail,
    ...(breakdown ? { breakdown } : {}),
  };
}

/**
 * Source Diversity Score
 * Measures whether the answer references multiple source types when
 * multiple channels were enabled.
 *
 * Score = 1 if multiple channels enabled and evidence from >1 source type found
 * Score = 0.5 if single channel or no diversity
 * Status: pass if score >= 0.5
 */
export function sourceDiversityScore(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline,
): MetricResult {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];
  const evidence = artifact.sourceEvidence ?? [];

  if (channels.length <= 1) {
    return baseMetric(
      "source_diversity",
      fixture,
      artifact,
      "pass",
      1,
      "Single channel mode — diversity not applicable.",
      { channels, evidenceCount: evidence.length },
    );
  }

  const activeChannels = new Set(evidence.map((e) => e.channel));
  const score = activeChannels.size > 1 ? 1 : 0.5;
  const status = score >= 1 ? "pass" : "warn";

  return baseMetric(
    "source_diversity",
    fixture,
    artifact,
    status,
    score,
    `${activeChannels.size}/${channels.length} enabled channels produced evidence. Active: ${Array.from(activeChannels).join(", ")}`,
    { channels, activeChannels: Array.from(activeChannels), evidence },
  );
}

/**
 * Source Recall by Channel
 * For each enabled channel, checks if expected items were found in
 * chunks attributed to that source type.
 *
 * Returns one MetricResult per channel with recall score.
 */
export function sourceRecallByChannel(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline,
): MetricResult[] {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];

  if (fixture.expectedItems.length === 0) {
    return [
      baseMetric(
        "source_recall_by_channel",
        fixture,
        artifact,
        "pass",
        1,
        "No expected items — per-channel recall not applicable.",
        { channels },
      ),
    ];
  }

  // Group chunks by inferred source (from sourceUrl domain or metadata)
  const chunksBySource: Record<string, Array<{ content: string }>> = {};
  for (const chunk of artifact.selectedChunks) {
    const source = inferSourceChannel(chunk.sourceUrl);
    if (!chunksBySource[source]) chunksBySource[source] = [];
    chunksBySource[source].push(chunk);
  }

  return channels.map((channel) => {
    const channelChunks = chunksBySource[channel] ?? [];
    const combinedText = channelChunks.map((c) => c.content).join("\n");

    const matched: string[] = [];
    for (const item of fixture.expectedItems) {
      if (combinedText.toLowerCase().includes(item.toLowerCase())) {
        matched.push(item);
      }
    }
    const score = fixture.expectedItems.length > 0 ? matched.length / fixture.expectedItems.length : 1;

    return baseMetric(
      `source_recall_${channel}`,
      fixture,
      artifact,
      score >= 0.5 ? "pass" : score > 0 ? "warn" : "fail",
      score,
      `${matched.length}/${fixture.expectedItems.length} items found in ${channel} (${channelChunks.length} chunks).`,
      { channel, matched, chunkCount: channelChunks.length },
    );
  });
}

/**
 * Infer source channel from a URL or chunk metadata.
 */
function inferSourceChannel(sourceUrl?: string): string {
  if (!sourceUrl) return "notebook";
  const url = sourceUrl.toLowerCase();
  if (url.includes("arxiv.org")) return "academic";
  if (url.includes("semanticscholar.org")) return "academic";
  if (url.includes("ncbi.nlm.nih.gov")) return "academic";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("tiktok.com")) return "social";
  if (url.includes("news") || url.includes("bbc") || url.includes("reuters")) return "news";
  return "web";
}

/**
 * External Source Utilization
 * Measures whether external sources (non-notebook) contributed meaningfully
 * when they were enabled.
 *
 * Score = fraction of selected chunks that came from external sources
 * Status: pass if >= 20% external when external channels enabled
 */
export function externalSourceUtilization(
  fixture: EvalFixture,
  artifact: EvalRunArtifact,
  _baseline?: EvalBaseline,
): MetricResult {
  const channels = artifact.sourcePolicy?.channels ?? ["notebook"];
  const hasExternal = channels.some((c) => c !== "notebook");

  if (!hasExternal) {
    return baseMetric(
      "external_source_utilization",
      fixture,
      artifact,
      "pass",
      1,
      "Notebook-only mode — external utilization not applicable.",
      { channels },
    );
  }

  const externalChunks = artifact.selectedChunks.filter((c) => {
    const source = inferSourceChannel(c.sourceUrl);
    return source !== "notebook";
  });

  const total = artifact.selectedChunks.length;
  const score = total > 0 ? externalChunks.length / total : 0;

  let status: MetricStatus;
  if (score >= 0.2) status = "pass";
  else if (score > 0) status = "warn";
  else status = "fail";

  return baseMetric(
    "external_source_utilization",
    fixture,
    artifact,
    status,
    score,
    `${externalChunks.length}/${total} selected chunks from external sources (${(score * 100).toFixed(1)}%).`,
    { externalChunks: externalChunks.length, total, channels },
  );
}
```

- [ ] **Step 2: Wire metrics into `scoreAllMetrics`**

In `evals/rag/metrics/scorers.ts`, add import:

```typescript
import {
  sourceDiversityScore,
  sourceRecallByChannel,
  externalSourceUtilization,
} from "./sourceAware";
```

Then in `scoreAllMetrics` (around line 46), add after the existing RAG metrics:

```typescript
    // Source-aware metrics (only for runs with sourcePolicy configured)
    if (artifact.sourcePolicy) {
      results.push(sourceDiversityScore(fixture, artifact, baseline));
      results.push(...sourceRecallByChannel(fixture, artifact, baseline));
      results.push(externalSourceUtilization(fixture, artifact, baseline));
    }
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add evals/rag/metrics/sourceAware.ts evals/rag/metrics/scorers.ts
git commit -m "feat(eval): add source-aware metrics for channel diversity and recall"
```

---

## Task 5: Add Source Matrix Fixture Variants Helper

**Files:**
- Create: `evals/rag/fixtures/sourceFilterVariants.ts`

- [ ] **Step 1: Create helper to generate fixture variants**

```typescript
/**
 * Helper to generate source-filtered variants of a base fixture.
 *
 * Usage: define one base fixture, then call `withSourceMatrix()` to
 * produce N variants with different channel combinations.
 */
import type { EvalFixture, SourcePolicyConfig } from "../types";

/** Common channel combinations to test */
export const DEFAULT_SOURCE_MATRIX: SourcePolicyConfig[] = [
  { channels: ["notebook"] },
  { channels: ["notebook", "web"] },
  { channels: ["notebook", "web", "news"] },
  { channels: ["notebook", "academic"] },
  { channels: ["notebook", "web", "news", "academic"] },
];

/**
 * Generate source-filtered variants of a base fixture.
 *
 * @param base - The base fixture (should NOT have sourcePolicy set)
 * @param matrix - Channel combinations to test (default: 5 common combos)
 * @returns Array of fixture variants, each with a unique id and sourcePolicy
 */
export function withSourceMatrix(
  base: EvalFixture,
  matrix: SourcePolicyConfig[] = DEFAULT_SOURCE_MATRIX,
): EvalFixture[] {
  return matrix.map((policy, index) => ({
    ...base,
    id: `${base.id}--src${index}`,
    schemaVersion: base.schemaVersion + 1,
    sourcePolicy: policy,
    tags: [...base.tags, `source-matrix`, `channels-${policy.channels.join("-")}`],
  }));
}

/**
 * Generate a source matrix focused on academic vs web comparison.
 */
export function withAcademicWebMatrix(base: EvalFixture): EvalFixture[] {
  return withSourceMatrix(base, [
    { channels: ["notebook"] },
    { channels: ["notebook", "web"] },
    { channels: ["notebook", "academic"] },
    { channels: ["notebook", "web", "academic"] },
  ]);
}

/**
 * Generate a source matrix for news-sensitive queries.
 */
export function withNewsMatrix(base: EvalFixture): EvalFixture[] {
  return withSourceMatrix(base, [
    { channels: ["notebook"] },
    { channels: ["notebook", "news"] },
    { channels: ["notebook", "web", "news"] },
  ]);
}
```

- [ ] **Step 2: Export from fixtures index**

In `evals/rag/fixtures/index.ts`, add to the exports (around line 20):

```typescript
export {
  withSourceMatrix,
  withAcademicWebMatrix,
  withNewsMatrix,
  DEFAULT_SOURCE_MATRIX,
} from "./sourceFilterVariants";
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add evals/rag/fixtures/sourceFilterVariants.ts evals/rag/fixtures/index.ts
git commit -m "feat(eval): add source matrix fixture variant helpers"
```

---

## Task 6: Add `--source-matrix` CLI Option

**Files:**
- Modify: `evals/rag/cli.ts`

- [ ] **Step 1: Add CLI parsing for `--source-matrix`**

In the `CliOptions` interface (around line 24), add:

```typescript
  /** Comma-separated source channel combinations (e.g. "notebook,web+academic") */
  sourceMatrix?: string;
```

In `parseArgs` (around line 77), add:

```typescript
      case "--source-matrix":
        opts.sourceMatrix = args[++i];
        break;
```

In `printHelp` (around line 122), add:

```typescript
  --source-matrix <combos>  Test fixture against multiple channel combinations (e.g. "notebook,web+academic")
```

- [ ] **Step 2: Add source matrix expansion logic**

Before the main fixture loop (around line 261), add:

```typescript
  // Expand fixtures for source matrix testing
  let expandedFixtures: EvalFixture[] = [];
  for (const fixture of fixtureIds.map((id) => getFixture(id))) {
    if (opts.sourceMatrix) {
      const combos = opts.sourceMatrix.split(",").map((s) => s.trim());
      const matrix: SourcePolicyConfig[] = combos.map((combo) => ({
        channels: combo.split("+"),
      }));
      expandedFixtures.push(...withSourceMatrix(fixture, matrix));
    } else {
      expandedFixtures.push(fixture);
    }
  }
```

Then change the loop to use `expandedFixtures` instead of `fixtureIds`:

```typescript
  for (const fixture of expandedFixtures) {
```

- [ ] **Step 3: Update report generation to group by source config**

In `generateReport` call (around line 317), pass the source matrix flag:

```typescript
  const report = generateReport(allMetrics, {
    commitSha,
    includeWarnings: true,
    groupBySourcePolicy: !!opts.sourceMatrix,
  });
```

- [ ] **Step 4: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/rag/cli.ts
git commit -m "feat(eval): add --source-matrix CLI option for A/B testing source filters"
```

---

## Task 7: Update Report Generation for Source Grouping

**Files:**
- Modify: `evals/rag/reports/reportGenerator.ts`

- [ ] **Step 1: Add source comparison to `formatReport`**

In `evals/rag/reports/reportGenerator.ts`, update the `GenerateReportOptions` interface (around line 4):

```typescript
export interface GenerateReportOptions {
  /** Commit SHA to include in the report */
  commitSha: string;
  /** Include warnings in failure groups (default: true) */
  includeWarnings?: boolean;
  /** Group results by source policy for A/B comparison */
  groupBySourcePolicy?: boolean;
}
```

Then update `formatReport` (around line 43) to add a source comparison section:

```typescript
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
  const sourcePolicyMetrics = report.metrics.filter((m) =
003e m.metric === "expected_item_recall" && m.caseId.includes("--src"));
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
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add evals/rag/reports/reportGenerator.ts
git commit -m "feat(eval): group report results by source policy for A/B comparison"
```

---

## Task 8: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

```bash
bun run typecheck:convex && bun run typecheck:web
```

Expected: Both PASS

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

Expected: PASS (or auto-fix warnings)

- [ ] **Step 3: Run eval dry-run**

```bash
bun run eval:rag -- --dry-run
```

Expected: All fixtures validate successfully, including any source-matrix variants.

- [ ] **Step 4: Test source matrix CLI**

```bash
bun run eval:rag -- --case agentic-patterns-20 --source-matrix notebook,web+academic --dry-run
```

Expected: 3 fixture variants validated (notebook-only, notebook+web, notebook+academic).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "style: lint fixes" || echo "No fixes needed"
```

---

## Example Usage After Implementation

**Test a single fixture with multiple source configs:**
```bash
bun run eval:rag -- --case my-fixture --source-matrix notebook,web+academic,all
```

**Test academic vs web for a research query:**
```bash
bun run eval:rag -- --case research-fixture --source-matrix notebook,notebook+academic,notebook+web
```

**Add source-matrix fixtures to the registry:**
```typescript
import { agenticPatterns20 } from "./agentic-patterns-20";
import { withSourceMatrix } from "./sourceFilterVariants";

export const FIXTURES: Record<string, EvalFixture> = {
  [agenticPatterns20.id]: agenticPatterns20,
  // Generate 5 source-filtered variants automatically
  ...Object.fromEntries(
    withSourceMatrix(agenticPatterns20).map((f) => [f.id, f])
  ),
};
```

---

## Spec Coverage Checklist

| Requirement | Task |
|-------------|------|
| Extend fixture types with sourcePolicy | Task 1 |
| Convex eval action accepts sourcePolicy | Task 2 |
| Invoker chain forwards sourcePolicy | Task 3 |
| Source diversity metric | Task 4 |
| Per-channel recall metric | Task 4 |
| External source utilization metric | Task 4 |
| Source matrix fixture variants | Task 5 |
| `--source-matrix` CLI option | Task 6 |
| Report groups by source config | Task 7 |
| Typecheck/lint/tests pass | Task 8 |

## Rollback

If issues arise, the changes are additive (new file + optional fields). Reverting the commits will restore the eval pipeline to its previous state without affecting production chat/research agents.
