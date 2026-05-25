"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { allWithConcurrency, clearStateKeys, withoutMapOutputs } from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { getMessageContent, invokeWithRetry, invokeWithTimeout } from "./invokeHelpers.js";
import { COLLAPSE_PROMPTS, COLLAPSE_SYSTEM_PROMPT } from "./prompts.js";
import type { MapOutput } from "./structuredLlm.js";
import type { OverallStateType } from "./state.js";
import { analyzeAllTopics } from "./topicAnalysis.js";

export interface CollapseDeps {
  smartLlm: ChatTogetherAI;
  estimateTokens: (text: string) => number;
}

async function collapseGroup(
  group: string[],
  customPrompt: string | undefined,
  deps: CollapseDeps
): Promise<string> {
  const combined = group.join("\n\n---\n\n");

  const collapseTemplate =
    customPrompt && customPrompt.trim() ? COLLAPSE_PROMPTS["custom"] : COLLAPSE_PROMPTS["default"];
  const prompt = collapseTemplate
    .replace("{content}", combined)
    .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

  const response = await invokeWithRetry(
    () =>
      invokeWithTimeout(
        () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (deps.smartLlm as any).invoke([
            new SystemMessage(COLLAPSE_SYSTEM_PROMPT),
            new HumanMessage(prompt),
          ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        "CollapseGroup"
      ),
    PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
    "CollapseGroup"
  );

  return getMessageContent(response);
}

async function recursiveCollapse(
  summaries: string[],
  customPrompt: string | undefined,
  deps: CollapseDeps
): Promise<string[]> {
  if (summaries.length <= 3) {
    return summaries;
  }

  const targetGroupSize = 4;
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  for (const summary of summaries) {
    if (currentGroup.length >= targetGroupSize) {
      groups.push([...currentGroup]);
      currentGroup = [summary];
    } else {
      currentGroup.push(summary);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  const concurrency = GRAPH_CONFIG.COLLAPSE_CONCURRENCY;
  console.log(
    `[ReportGraph] Collapsing ${groups.length} groups with concurrency limit of ${concurrency}`
  );
  const collapsed = await allWithConcurrency(
    groups.map((group, idx) => {
      console.log(
        `[ReportGraph] Collapsing group ${idx + 1}/${groups.length} (${group.length} summaries)`
      );
      return () => collapseGroup(group, customPrompt, deps);
    }),
    concurrency
  );

  return recursiveCollapse(collapsed, customPrompt, deps);
}

export async function collapse(
  state: OverallStateType,
  deps: CollapseDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${"=".repeat(80)}`);
  console.log("[ReportGraph] ===== COLLAPSE PHASE =====");
  console.log("=".repeat(80));

  const validOutputs: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errorOutputs: Array<{ index: number; error: any }> = [];

  state.mapOutputs.forEach((output, idx) => {
    try {
      const parsed = JSON.parse(output);
      if (parsed._error === true) {
        errorOutputs.push({
          index: idx,
          error: {
            chunkIndex: parsed.chunkIndex,
            errorMessage: parsed.errorMessage,
            isTimeout: parsed.isTimeout,
            elapsedTime: parsed.elapsedTime,
          },
        });
      } else {
        validOutputs.push(output);
      }
    } catch (e) {
      errorOutputs.push({
        index: idx,
        error: {
          errorMessage: `Failed to parse output as JSON: ${(e as Error).message}`,
        },
      });
    }
  });

  if (errorOutputs.length > 0) {
    console.warn(
      `[ReportGraph] ⚠️ ${errorOutputs.length}/${state.mapOutputs.length} chunks failed during map phase:`
    );
    errorOutputs.forEach(({ index, error }) => {
      console.warn(
        `  [Chunk ${error.chunkIndex ?? index + 1}] ${error.errorMessage}${error.isTimeout ? " (timeout)" : ""} (${error.elapsedTime ? (error.elapsedTime / 1000).toFixed(1) + "s" : "N/A"})`
      );
    });
  }

  if (validOutputs.length === 0) {
    console.error("[ReportGraph] Collapse: ERROR - All chunks failed during map phase!");
    return {
      collapsedOutputs: [],
      finalOutput:
        "# Error\n\nUnable to generate report. All source chunks failed to process. Please try again with smaller documents or different content.",
      status: "error",
    };
  }

  console.log(
    `[ReportGraph] ✅ Proceeding with ${validOutputs.length}/${state.mapOutputs.length} successful chunks`
  );

  const summaries: string[] = [];
  const mapOutputsDetails = validOutputs.map((output, idx) => {
    const parsed = JSON.parse(output) as MapOutput;
    const summary = parsed.summary;
    const topics = parsed.topics;
    summaries.push(summary);
    return {
      index: idx,
      length: output.length,
      topics,
      preview: summary.substring(0, 100).replace(/\n/g, " "),
    };
  });

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "collapse",
        mapOutputsReceived: state.mapOutputs.length,
        validOutputs: validOutputs.length,
        errorOutputs: errorOutputs.length,
        mapOutputsDetails,
      },
      null,
      2
    )
  );

  const { topics: topicDistribution, allTopics } = analyzeAllTopics(validOutputs);
  console.log(
    `[ReportGraph] Topic distribution across valid map outputs:`,
    JSON.stringify(topicDistribution, null, 2)
  );
  console.log(
    `[ReportGraph] All unique topics found: ${Array.from(new Set(allTopics)).join(", ")}`
  );

  const totalTokens = summaries.reduce((sum, s) => sum + deps.estimateTokens(s), 0);

  console.log(`[ReportGraph] Collapse: total tokens ${totalTokens}`);

  console.log("[ReportGraph] Collapse: performing recursive collapse");
  const collapsed = await recursiveCollapse(summaries, state.customPrompt, deps);

  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  console.log(
    `[ReportGraph] Collapse: freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`
  );

  return {
    ...withoutMapOutputs(state),
    collapsedOutputs: collapsed,
    status: "reducing",
    ...clearStateKeys<OverallStateType>(["mapOutputs"]),
    progress: {
      phase: "collapse",
      percentage: 70,
      message: `Collapsed ${validOutputs.length} valid outputs into ${collapsed.length}${errorOutputs.length > 0 ? ` (${errorOutputs.length} failed)` : ""}`,
    },
  };
}
