"use node";

import { MAP_PROMPTS } from "./prompts.js";
import { PROCESSING_CONFIG } from "./config.js";
import type { OverallStateType } from "./state.js";

/**
 * Sanitize custom prompt input.
 */
export function sanitizeUserInput(input: string): string {
  if (!input) return "";

  return input
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\{.*?\}/g, "")
    .replace(/<\|.*?\|>/g, "")
    .trim()
    .substring(0, PROCESSING_CONFIG.MAX_PROMPT_LENGTH);
}

// Validate input state before processing
export function validateInput(state: OverallStateType): Partial<OverallStateType> {
  console.log("\n" + "=".repeat(80));
  console.log("[SpreadsheetGraph] ===== INPUT VALIDATION =====");
  console.log("=".repeat(80));

  const errors: string[] = [];

  if (!state.chunks || state.chunks.length === 0) {
    errors.push("No chunks provided for processing");
  }

  if (!state.spreadsheetType) {
    errors.push("Spreadsheet type is required");
  }

  if (state.spreadsheetType && !MAP_PROMPTS[state.spreadsheetType]) {
    errors.push(
      `Invalid spreadsheet type: ${state.spreadsheetType}. Valid types: ${Object.keys(MAP_PROMPTS).join(", ")}`
    );
  }

  if (errors.length > 0) {
    console.error("[SpreadsheetGraph] Validation failed:", errors);
    return {
      ...state,
      status: "error",
      finalOutput: `# Validation Error\n\n${errors.map((e) => `- ${e}`).join("\n")}\n\nPlease fix these issues and try again.`,
    };
  }

  console.log("[SpreadsheetGraph] Validation passed");
  console.log(`  - Document IDs: ${state.documentIds?.length || 0}`);
  console.log(`  - Chunks: ${state.chunks?.length || 0}`);
  console.log(`  - Spreadsheet Type: ${state.spreadsheetType}`);
  console.log(
    `  - Custom Prompt: ${state.customPrompt ? "Yes (" + state.customPrompt.length + " chars)" : "No"}`
  );

  return state;
}
