"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { env } from "../../_lib/env.js";
import {
  invokeWithTimeout,
  invokeWithRetry,
  allWithConcurrency,
  clearStateKeys,
  createLangSmithRunConfig,
  withoutMapOutputs,
} from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { getMessageContent } from "./csvHelpers.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { COLLAPSE_PROMPTS, COLLAPSE_SYSTEM_PROMPT } from "./prompts.js";
import type { OverallStateType } from "./state.js";

export type SpreadsheetCollapseDeps = {
  smartLlm: ChatTogetherAI;
  estimateTokens: (text: string) => number;
};

async function collapseGroup(
  group: string[],
  spreadsheetType: string,
  customPrompt: string | undefined,
  deps: SpreadsheetCollapseDeps
): Promise<string> {
  const combined = group.join("\n\n---\n\n");
  // If customPrompt is provided (even for predefined types), use the custom template
  // Otherwise, use the predefined template for the spreadsheet type
  const collapsePrompt =
    customPrompt && customPrompt.trim()
      ? COLLAPSE_PROMPTS["custom"]
      : COLLAPSE_PROMPTS[spreadsheetType] || COLLAPSE_PROMPTS["custom"];

  const prompt = collapsePrompt
    .replace("{content}", combined)
    .replace("{customPrompt}", sanitizeUserInput(customPrompt || ""));

  const response = await invokeWithRetry(
    () =>
      invokeWithTimeout(
        () =>
          (deps.smartLlm as any).invoke(
            [new SystemMessage(COLLAPSE_SYSTEM_PROMPT), new HumanMessage(prompt)],
            createLangSmithRunConfig({
              runName: "SpreadsheetGraph.CollapseGroup",
              tags: ["agent", "spreadsheet", "collapse"],
              metadata: {
                fragmentCount: group.length,
              },
            })
          ),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        "CollapseGroup"
      ),
    {
      maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
      baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
      onRetry: (attempt, error, delay) => {
        console.warn(
          `[SpreadsheetGraph] CollapseGroup attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
          error.message
        );
        console.log(`[SpreadsheetGraph] Retrying CollapseGroup in ${delay}ms...`);
      },
    },
    "CollapseGroup"
  );

  return getMessageContent(response);
}

async function recursiveCollapse(
  textOutputs: string[],
  spreadsheetType: string,
  customPrompt: string | undefined,
  deps: SpreadsheetCollapseDeps
): Promise<string[]> {
  // Use packChunks-style token-based grouping
  const TARGET_TOKENS = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS; // ~15000 tokens

  if (textOutputs.length <= 2) {
    return textOutputs;
  }

  // Group by estimated tokens
  const groups: string[][] = [];
  let currentGroup: string[] = [];
  let currentTokens = 0;

  for (const output of textOutputs) {
    const outputTokens = deps.estimateTokens(output);

    if (currentTokens + outputTokens > TARGET_TOKENS && currentGroup.length > 0) {
      groups.push([...currentGroup]);
      currentGroup = [output];
      currentTokens = outputTokens;
    } else {
      currentGroup.push(output);
      currentTokens += outputTokens;
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  console.log(
    `[SpreadsheetGraph] Collapsing ${groups.length} token-aware groups (target: ${TARGET_TOKENS} tokens each)`
  );

  const concurrency = parseInt(env.SPREADSHEET_COLLAPSE_CONCURRENCY || "5", 10);
  const collapsed = await allWithConcurrency(
    groups.map((group, idx) => {
      const totalTokens = group.reduce((sum, t) => sum + deps.estimateTokens(t), 0);
      console.log(
        `[SpreadsheetGraph] Collapsing group ${idx + 1}/${groups.length} (${group.length} fragments, ~${totalTokens} tokens)`
      );
      return () => collapseGroup(group, spreadsheetType, customPrompt, deps);
    }),
    concurrency
  );

  return recursiveCollapse(collapsed, spreadsheetType, customPrompt, deps);
}

// Node: Collapse phase - consolidate text outputs
export async function collapse(
  state: OverallStateType,
  deps: SpreadsheetCollapseDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${"=".repeat(80)}`);
  console.log("[SpreadsheetGraph] ===== COLLAPSE PHASE =====");
  console.log("=".repeat(80));

  const mapOutputsDetails = state.mapOutputs.map((output, idx) => ({
    index: idx,
    length: output.length,
    preview: output.substring(0, 100).replace(/\n/g, " "),
  }));

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "collapse",
        mapOutputsReceived: state.mapOutputs.length,
        mapOutputsDetails,
      },
      null,
      2
    )
  );

  if (!state.mapOutputs || state.mapOutputs.length === 0) {
    console.error("[SpreadsheetGraph] Collapse: ERROR - No mapOutputs received!");
    return {
      collapsedOutputs: [],
      status: "reducing",
    };
  }

  const totalTokens = state.mapOutputs.reduce((sum, s) => sum + deps.estimateTokens(s), 0);

  console.log(`[SpreadsheetGraph] Collapse: total tokens ${totalTokens}`);

  const TARGET_TOKENS = GRAPH_CONFIG.REDUCE_CHUNK_SIZE_TOKENS; // ~15000 tokens

  // If total tokens are already below target, skip collapse and go directly to reduce
  if (totalTokens <= TARGET_TOKENS) {
    console.log(
      `[SpreadsheetGraph] Collapse: skipping (${totalTokens} tokens <= ${TARGET_TOKENS} target), passing through to reduce`
    );
    return {
      ...withoutMapOutputs(state),
      collapsedOutputs: state.mapOutputs,
      status: "reducing",
      progress: {
        phase: "collapse",
        percentage: 70,
        message: `Skipped collapse (${totalTokens} tokens, already below ${TARGET_TOKENS} target)`,
      },
    };
  }

  // If we have few outputs, skip collapse and go directly to reduce
  if (state.mapOutputs.length <= 2) {
    console.log(
      "[SpreadsheetGraph] Collapse: skipping (only 2 outputs), passing through to reduce"
    );
    return {
      ...withoutMapOutputs(state),
      collapsedOutputs: state.mapOutputs,
      status: "reducing",
      progress: {
        phase: "collapse",
        percentage: 70,
        message: `Skipped collapse (${state.mapOutputs.length} outputs)`,
      },
    };
  }

  console.log("[SpreadsheetGraph] Collapse: performing recursive collapse");
  const collapsed = await recursiveCollapse(
    state.mapOutputs,
    state.spreadsheetType,
    state.customPrompt,
    deps
  );

  // Calculate memory freed before clearing
  const mapOutputsSize = state.mapOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  console.log(
    `[SpreadsheetGraph] Collapse: freeing ~${(mapOutputsSize / 1024).toFixed(2)} KB from mapOutputs`
  );

  return {
    ...withoutMapOutputs(state),
    collapsedOutputs: collapsed,
    status: "reducing",
    ...clearStateKeys<OverallStateType>(["mapOutputs"]),
    progress: {
      phase: "collapse",
      percentage: 70,
      message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
    },
  };
}
