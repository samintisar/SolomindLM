"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import {
  invokeWithTimeout,
  invokeWithRetry,
  clearStateKeys,
  withoutMapOutputs,
} from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { cleanCsvOutput, getMessageContent, validateTableCompleteness } from "./csvHelpers.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { REDUCE_PROMPTS, REDUCE_SYSTEM_PROMPT } from "./prompts.js";
import type { OverallStateType } from "./state.js";

export type SpreadsheetReduceDeps = {
  smartLlm: ChatTogetherAI;
};

// Node: Reduce phase - generate CSV from consolidated text
export async function reduce(
  state: OverallStateType,
  deps: SpreadsheetReduceDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${"=".repeat(80)}`);
  console.log("[SpreadsheetGraph] ===== REDUCE PHASE (CSV GENERATION) =====");
  console.log("=".repeat(80));

  const collapsedOutputsCount = state.collapsedOutputs.length;

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "reduce",
        collapsedOutputsCount,
        spreadsheetType: state.spreadsheetType,
      },
      null,
      2
    )
  );

  const combined = state.collapsedOutputs.join("\n\n---\n\n");

  console.log(`[SpreadsheetGraph] Reduce: combined content length: ${combined.length} chars`);

  // Get the reduce prompt based on spreadsheet type
  // If customPrompt is provided (even for predefined types), use the custom template
  // Otherwise, use the predefined template for the spreadsheet type
  const reducePrompt =
    state.customPrompt && state.customPrompt.trim()
      ? REDUCE_PROMPTS["custom"]
      : REDUCE_PROMPTS[state.spreadsheetType] || REDUCE_PROMPTS["custom"];
  const prompt = reducePrompt
    .replace("{spreadsheetType}", state.spreadsheetType)
    .replace("{customPrompt}", sanitizeUserInput(state.customPrompt || ""))
    .replace("{content}", combined);

  console.log(`[SpreadsheetGraph] Reduce: prompt length: ${prompt.length} chars`);

  const startTime = Date.now();
  let finalOutput: string;

  try {
    const response = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (deps.smartLlm as any).invoke([
              new SystemMessage(REDUCE_SYSTEM_PROMPT),
              new HumanMessage(prompt),
            ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          "Reduce"
        ),
      {
        maxAttempts: PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        baseDelayMs: PROCESSING_CONFIG.RETRY_BACKOFF_MS,
        onRetry: (attempt, error, delay) => {
          console.warn(
            `[SpreadsheetGraph] Reduce attempt ${attempt}/${PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS} failed:`,
            error.message
          );
          console.log(`[SpreadsheetGraph] Retrying Reduce in ${delay}ms...`);
        },
      },
      "Reduce"
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseAny = response as any;
    const metadata = responseAny.response_metadata || {};
    const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

    console.log("[SpreadsheetGraph] ===== RESPONSE ANALYSIS =====");
    console.log(
      "[SpreadsheetGraph] Content length:",
      responseAny.content?.toString()?.length || "N/A"
    );
    console.log(
      "[SpreadsheetGraph] Estimated tokens:",
      Math.ceil((responseAny.content?.toString()?.length || 0) / 3)
    );
    console.log("[SpreadsheetGraph] Finish reason:", finishReason);
    console.log(
      "[SpreadsheetGraph] Token usage:",
      JSON.stringify(metadata.token_usage || metadata)
    );
    console.log(
      "[SpreadsheetGraph] Last 200 chars:",
      (responseAny.content?.toString() || "").slice(-200)
    );
    console.log("[SpreadsheetGraph] =====================================");

    // CLEAN THE OUTPUT - Remove markdown code blocks
    const rawContent = getMessageContent(response);
    finalOutput = cleanCsvOutput(rawContent);

    if (finishReason === "length") {
      console.error("[SpreadsheetGraph] ⚠️ CSV TRUNCATED!");
      // For CSV, truncation is fatal for the last row. Remove incomplete row.
      const lastNewline = finalOutput.lastIndexOf("\n");
      if (lastNewline > 0) {
        const beforeTrim = finalOutput;
        finalOutput = finalOutput.substring(0, lastNewline);
        console.log(
          `[SpreadsheetGraph] Trimmed incomplete last row. Removed ${beforeTrim.length - finalOutput.length} chars.`
        );
      }
    }

    const validation = validateTableCompleteness(finalOutput, state.spreadsheetType);
    if (!validation.isComplete) {
      console.warn("[SpreadsheetGraph] CSV validation issues:", validation.missing);
      if (finishReason === "length") {
        console.error("[SpreadsheetGraph] Confirmed: truncation likely caused incompleteness");
      }
    }
  } catch (error) {
    const errorContext = {
      timestamp: new Date().toISOString(),
      spreadsheetType: state.spreadsheetType,
      collapsedOutputsCount: state.collapsedOutputs.length,
      contentLength: combined.length,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 3).join("\n"),
            }
          : String(error),
    };
    console.error("[SpreadsheetGraph] Reduce phase error:", JSON.stringify(errorContext, null, 2));

    finalOutput = `Error,Could not generate CSV\nMessage,${error instanceof Error ? error.message : "Unknown error"}\nType,${state.spreadsheetType}`;
  }

  const elapsed = Date.now() - startTime;

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "reduce_complete",
        finalOutputLength: finalOutput.length,
        processingTimeMs: elapsed,
        outputPreview: finalOutput.substring(0, 200).replace(/\n/g, " "),
      },
      null,
      2
    )
  );

  console.log(
    `[SpreadsheetGraph] Reduce: final CSV output length: ${finalOutput.length} chars (took ${elapsed}ms)`
  );

  // Calculate memory to be freed
  const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  console.log(
    `[SpreadsheetGraph] Reduce: freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`
  );

  return {
    ...withoutMapOutputs(state),
    finalOutput,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["collapsedOutputs", "chunks"]),
    progress: {
      phase: "reduce",
      percentage: 100,
      message: "Completed: CSV spreadsheet generated",
    },
  };
}
