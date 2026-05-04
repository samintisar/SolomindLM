"use node";

import type { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { clearStateKeys, createLangSmithRunConfig, withoutMapOutputs } from "../_shared/index.js";

import { GRAPH_CONFIG, PROCESSING_CONFIG } from "./config.js";
import { sanitizeUserInput } from "./inputValidation.js";
import { getMessageContent, invokeWithRetry, invokeWithTimeout } from "./invokeHelpers.js";
import { REDUCE_PROMPTS, REDUCE_SYSTEM_PROMPT } from "./prompts.js";
import type { OverallStateType } from "./state.js";
import { analyzeAllTopics } from "./topicAnalysis.js";

function validateReportCompleteness(
  output: string,
  reportType: string
): {
  isComplete: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (reportType === "study_guide") {
    const requiredSections = [
      "Learning Objectives",
      "Study Notes",
      "Quiz Questions",
      "Answer Key",
      "Essay Questions",
      "Glossary",
    ];

    for (const section of requiredSections) {
      const patterns = [
        new RegExp(`##\\s*${section}`, "i"),
        new RegExp(`###\\s*${section}`, "i"),
        new RegExp(`\\*\\*${section}\\*\\*`, "i"),
        new RegExp(`${section}`, "i"),
      ];

      const found = patterns.some((pattern) => pattern.test(output));

      if (!found) {
        missing.push(`Missing section: ${section}`);
      }
    }

    const quizMatches = output.match(/^\d+\.\s+.+$/gm) || [];
    if (quizMatches.length < 10) {
      missing.push(`Incomplete quiz (${quizMatches.length}/10 questions)`);
    }

    const glossaryPatterns = [/##\s*Glossary/i, /###\s*Glossary/i, /\*\*Glossary\*\*/i];
    const hasGlossary = glossaryPatterns.some((pattern) => pattern.test(output));

    if (hasGlossary) {
      const glossaryMatch = output.match(/##\s*Glossary[\s\S]+$/i);
      if (glossaryMatch) {
        const glossaryEntries = glossaryMatch[0].match(/^[-*]\s+\*\*\w+/gm) || [];
        if (glossaryEntries.length < 5) {
          missing.push(`Incomplete glossary (${glossaryEntries.length} entries)`);
        }
      }
    }

    const lastLine = output.trim().split("\n").pop() || "";
    if (lastLine.length > 0 && !lastLine.match(/[.!?"]$/) && !lastLine.startsWith("#")) {
      missing.push("Abrupt ending detected (likely truncated)");
    }
  } else if (
    reportType === "briefing" ||
    reportType === "summary" ||
    reportType === "technical_report"
  ) {
    const lastLine = output.trim().split("\n").pop() || "";
    if (lastLine.length > 0 && !lastLine.match(/[.!?]$/) && !lastLine.startsWith("#")) {
      missing.push("Abrupt ending detected (likely truncated)");
    }

    if (reportType === "briefing") {
      const expectedSections = [
        "Executive Summary",
        "Main Themes",
        "Key Findings",
        "Recommendations",
      ];
      for (const section of expectedSections) {
        if (!new RegExp(section, "i").test(output)) {
          missing.push(`Missing section: ${section}`);
        }
      }
    }
  }

  return {
    isComplete: missing.length === 0,
    missing,
  };
}

export interface ReduceDeps {
  smartLlm: ChatTogetherAI;
}

export async function reduce(
  state: OverallStateType,
  deps: ReduceDeps
): Promise<Partial<OverallStateType>> {
  console.log(`\n${"=".repeat(80)}`);
  console.log("[ReportGraph] ===== REDUCE PHASE =====");
  console.log("=".repeat(80));

  const collapsedOutputsCount = state.collapsedOutputs.length;

  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        phase: "reduce",
        collapsedOutputsCount,
        reportType: state.reportType,
      },
      null,
      2
    )
  );

  const { topics: topicDistribution, allTopics } = analyzeAllTopics(state.collapsedOutputs);

  const validTopics = Array.from(new Set(allTopics)).filter(
    (t) =>
      !t.includes("Error") &&
      !t.includes("error") &&
      !t.includes("timeout") &&
      !t.includes("Unknown")
  );

  console.log(
    `[ReportGraph] Topic distribution before reduce:`,
    JSON.stringify(topicDistribution, null, 2)
  );
  console.log(`[ReportGraph] Total unique topics to synthesize: ${validTopics.length}`);
  console.log(`[ReportGraph] Valid topics: ${validTopics.join(", ")}`);

  const combined = state.collapsedOutputs.join("\n\n---\n\n");

  console.log(`[ReportGraph] Reduce: combined content length: ${combined.length} chars`);

  let promptTemplate = REDUCE_PROMPTS[state.reportType] || REDUCE_PROMPTS["custom"];

  if (validTopics.length > 0) {
    const topicList = validTopics.map((t, i) => `${i + 1}. ${t}`).join("\n");
    const topicRequirement = `

====================
EXPLICIT TOPIC COVERAGE REQUIREMENT
====================
You MUST create dedicated sections for EACH of the following ${validTopics.length} topics:
${topicList}

Each topic must receive approximately equal attention (${Math.round(100 / validTopics.length)}% of content each).
Do NOT combine topics or focus primarily on one.
====================

`;

    promptTemplate = promptTemplate.replace(
      /(CRITICAL REQUIREMENT[\s\S]*?)(\n\n##|Create a comprehensive)/,
      `$1${topicRequirement}$2`
    );
  }

  const prompt = promptTemplate
    .replace("{content}", combined)
    .replace("{customPrompt}", sanitizeUserInput(state.customPrompt || ""));

  console.log(`[ReportGraph] Reduce: prompt length: ${prompt.length} chars`);
  console.log(`[ReportGraph] Reduce: prompt preview: ${prompt.substring(0, 500)}...`);

  const startTime = Date.now();
  let finalOutput: string;

  try {
    const response = await invokeWithRetry(
      () =>
        invokeWithTimeout(
          () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (deps.smartLlm as any).invoke(
              [new SystemMessage(REDUCE_SYSTEM_PROMPT), new HumanMessage(prompt)],
              createLangSmithRunConfig({
                runName: "ReportGraph.Reduce",
                tags: ["agent", "report", "reduce"],
                metadata: {
                  reportType: state.reportType,
                  collapsedOutputsCount,
                  validTopicsCount: validTopics.length,
                },
              })
            ),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          "Reduce"
        ),
      PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
      "Reduce"
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseAny = response as any;
    const metadata = responseAny.response_metadata || {};
    const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

    console.log("[ReportGraph] ===== RESPONSE ANALYSIS =====");
    console.log("[ReportGraph] Content length:", responseAny.content?.toString()?.length || "N/A");
    console.log(
      "[ReportGraph] Estimated tokens:",
      Math.ceil((responseAny.content?.toString()?.length || 0) / 3)
    );
    console.log("[ReportGraph] Finish reason:", finishReason);
    console.log("[ReportGraph] Token usage:", JSON.stringify(metadata.token_usage || metadata));
    console.log(
      "[ReportGraph] Last 200 chars:",
      (responseAny.content?.toString() || "").slice(-200)
    );
    console.log("[ReportGraph] =====================================");

    finalOutput = getMessageContent(response);

    if (finishReason === "length") {
      console.error("[ReportGraph] ⚠️ OUTPUT TRUNCATED BY TOKEN LIMIT!");
      console.error("[ReportGraph] Increase REPORT_REDUCE_MAX_OUTPUT_TOKENS in env");

      finalOutput +=
        "\n\n---\n\n⚠️ **This report was truncated due to output length limits. " +
        "To generate a complete report, increase the REPORT_REDUCE_MAX_OUTPUT_TOKENS setting " +
        "or reduce the number of source documents.**";
    }

    const validation = validateReportCompleteness(finalOutput, state.reportType);
    if (!validation.isComplete) {
      console.warn("[ReportGraph] Report validation issues:", validation.missing);
      if (finishReason === "length") {
        console.error("[ReportGraph] Confirmed: truncation likely caused incompleteness");
      }
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).isTimeout ||
      (error instanceof Error &&
        (error.message.includes("timeout") ||
          error.message.includes("Timeout") ||
          error.message.includes("exceeded")));

    const errorContext = {
      timestamp: new Date().toISOString(),
      phase: "reduce",
      reportType: state.reportType,
      collapsedOutputsCount: state.collapsedOutputs.length,
      contentLength: combined.length,
      elapsedTime: elapsed,
      isTimeout: isTimeout,
      timeoutLimit: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split("\n").slice(0, 5).join("\n"),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              phase: (error as any).phase,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              isTimeout: (error as any).isTimeout,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              timeoutMs: (error as any).timeoutMs,
            }
          : String(error),
    };
    console.error("[ReportGraph] ===== REDUCE PHASE ERROR =====");
    console.error("[ReportGraph] Error context:", JSON.stringify(errorContext, null, 2));
    console.error("[ReportGraph] =====================================");

    const enhancedError =
      error instanceof Error
        ? new Error(`Reduce phase failed: ${error.message}${isTimeout ? " (timeout)" : ""}`)
        : new Error("Reduce phase failed with unknown error");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enhancedError as any).phase = "reduce";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enhancedError as any).isTimeout = isTimeout;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enhancedError as any).reportType = state.reportType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enhancedError as any).elapsedTime = elapsed;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enhancedError as any).errorContext = errorContext;
    if (error instanceof Error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (enhancedError as any).originalError = error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (enhancedError as any).stack = error.stack;
    }

    throw enhancedError;
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
    `[ReportGraph] Reduce: final output length: ${finalOutput.length} chars (took ${elapsed}ms)`
  );

  const collapsedOutputsSize = state.collapsedOutputs.reduce((sum, s) => sum + s.length * 2, 0);
  const chunksSize = (state.chunks || []).reduce((sum, s) => sum + s.length * 2, 0);
  console.log(
    `[ReportGraph] Reduce: freeing ~${((collapsedOutputsSize + chunksSize) / 1024).toFixed(2)} KB from intermediate data`
  );

  return {
    ...withoutMapOutputs(state),
    finalOutput,
    status: "completed",
    ...clearStateKeys<OverallStateType>(["collapsedOutputs", "chunks"]),
    progress: {
      phase: "reduce",
      percentage: 100,
      message: `Completed: ${state.reportType} report generated`,
    },
  };
}
