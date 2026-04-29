/**
 * Parse NotebookLM Q&A output into EvalFixture format.
 *
 * Usage:
 * 1. Run the NotebookLM prompt
 * 2. Copy the output
 * 3. Parse with this utility
 * 4. Register in fixtures/index.ts
 */

import type { EvalFixture } from "../types";
import { createFixture } from "./fixtureTemplate";
import type { ScenarioCategory } from "./scenarioCategories";

interface ParsedQaPair {
  question: string;
  expectedAnswer: string;
  expectedItems: string[];
  scenarioCategory: ScenarioCategory;
  expectedBehavior: string;
}

/**
 * Parse NotebookLM-formatted Q&A output.
 */
export function parseNotebookLMOutput(text: string): ParsedQaPair[] {
  const pairs: ParsedQaPair[] = [];
  const blocks = text.split(/### Question:/g).filter((b) => b.trim());

  for (const block of blocks) {
    try {
      const question = extractField(block, "Question");
      const expectedAnswer = extractField(block, "Expected Answer");
      const itemsField = extractField(block, "Expected Items");
      const scenarioCategory = extractField(block, "Scenario Category").trim().toLowerCase() as ScenarioCategory;
      const expectedBehavior = extractField(block, "Expected Behavior");

      if (!question || !expectedAnswer) continue;

      const expectedItems = itemsField === "N/A" || !itemsField
        ? []
        : itemsField.split(",").map((i) => i.trim());

      pairs.push({
        question: question.trim(),
        expectedAnswer: expectedAnswer.trim(),
        expectedItems,
        scenarioCategory: isValidScenario(scenarioCategory) ? scenarioCategory : "factoid",
        expectedBehavior: expectedBehavior.trim(),
      });
    } catch {
      // Skip malformed blocks
      continue;
    }
  }

  return pairs;
}

function extractField(block: string, fieldName: string): string {
  const regex = new RegExp(`${fieldName}:\\s*([\\s\\S]*?)(?=###\\s|\\n\\n|$)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function isValidScenario(cat: string): cat is ScenarioCategory {
  const valid: ScenarioCategory[] = [
    "factoid", "list-enumeration", "comparison", "causality", "temporal",
    "ambiguous", "multi-doc", "technical", "summarization", "explanation",
  ];
  return valid.includes(cat as ScenarioCategory);
}

/**
 * Convert parsed Q&A pairs to EvalFixture[] with a given notebook ID.
 */
export function notebookLMToFixtures(
  parsed: ParsedQaPair[],
  notebookId: string,
  idPrefix = "nlm-"
): EvalFixture[] {
  return parsed.map((pair, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return createFixture({
      id: `${idPrefix}${suffix}`,
      question: pair.question,
      expectedAnswer: pair.expectedAnswer,
      expectedItems: pair.expectedItems.length > 0 ? pair.expectedItems : undefined,
      expectedBehavior: pair.expectedBehavior,
      notebookId,
      scenarioCategory: pair.scenarioCategory,
      tags: [pair.scenarioCategory],
    });
  });
}

/**
 * One-shot conversion: paste NotebookLM output, get fixtures.
 */
export function convertNotebookLM(
  notebookLMOutput: string,
  notebookId: string,
  idPrefix = "nlm-"
): EvalFixture[] {
  const parsed = parseNotebookLMOutput(notebookLMOutput);
  return notebookLMToFixtures(parsed, notebookId, idPrefix);
}

// Example usage:
/*
const notebookLMOutput = `### Question: What is...
### Expected Answer: ...
...`;

const fixtures = convertNotebookLM(notebookLMOutput, "jd72h9qsq5zap11ede5k8rqkx585djmc");
console.log(fixtures);
*/
