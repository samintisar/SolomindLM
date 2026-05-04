/**
 * Studio fixtures for the agentic-patterns test notebook.
 * All studio fixtures share the same notebookId and reuse the 20-pattern
 * ground-truth list as `expectedItems`.
 */
import type { EvalFixture } from "../../types";
import { AGENTIC_20_ITEMS, AGENTIC_20_NOTEBOOK_ID } from "../agentic-patterns-20";

import { studioFlashcardsAgentic20 } from "./flashcards";

const sharedExpectedItems = (): string[] => [...AGENTIC_20_ITEMS];

const sharedTags = (kind: string): string[] => [
  "studio",
  kind,
  "list-enumeration",
  "agentic-patterns",
];

export const studioReportAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-report-agentic-patterns-20",
  question: "Generate a report covering the 20 agentic AI design patterns.",
  runner: "report",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Report should describe each of the 20 patterns. Cite source content where appropriate.",
  studioParams: { reportType: "summary" },
  expectedStructure: { minItems: 20 },
  tags: sharedTags("report"),
};

export const studioQuizAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-quiz-agentic-patterns-20",
  question: "Generate a quiz covering the 20 agentic AI design patterns.",
  runner: "quiz",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Quiz should include questions covering each of the 20 patterns. Each question must have an answer key.",
  studioParams: { questionCount: 20, difficulty: "medium" },
  expectedStructure: { minItems: 20 },
  tags: sharedTags("quiz"),
};

export const studioMindmapAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-mindmap-agentic-patterns-20",
  question: "Build a mindmap of the 20 agentic AI design patterns.",
  runner: "mindmap",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Mindmap should have a root node plus a node per pattern, with descriptive children where appropriate.",
  expectedStructure: { minItems: 21 }, // root + 20 patterns at minimum
  tags: sharedTags("mindmap"),
};

export const studioInfographicAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-infographic-agentic-patterns-20",
  question: "Create an infographic visualizing the 20 agentic AI design patterns.",
  runner: "infographic",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Infographic should visually represent the agentic AI patterns with clear labels, icons, and an organized layout.",
  studioParams: { customPrompt: "Visualize the 20 agentic AI design patterns as an infographic with icons and brief descriptions for each pattern." },
  tags: sharedTags("infographic"),
};

export const studioSpreadsheetAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-spreadsheet-agentic-patterns-20",
  question: "Build a spreadsheet comparing the 20 agentic AI design patterns.",
  runner: "spreadsheet",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Spreadsheet should have one row per pattern with descriptive columns (name, description, use case, etc.).",
  studioParams: {
    customPrompt:
      "Create a comparison table of the 20 agentic AI design patterns with columns: Pattern, Description, Typical Use Case.",
  },
  expectedStructure: { minItems: 20 },
  tags: sharedTags("spreadsheet"),
};

export const studioWrittenQuestionsAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-written-questions-agentic-patterns-20",
  question: "Generate written-response questions on the 20 agentic AI design patterns.",
  runner: "writtenQuestions",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Set should include open-ended questions exercising understanding of each pattern. Provide an expected-answer or rubric for each.",
  studioParams: { questionCount: 20, difficulty: "medium" },
  expectedStructure: { minItems: 20 },
  tags: sharedTags("written-questions"),
};

export const studioAudioScriptAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-agentic-patterns-20",
  question: "Generate an audio overview script covering the 20 agentic AI design patterns.",
  runner: "audioScript",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Two-host dialogue script that names and briefly describes each of the 20 patterns. The synthesized audio is NOT evaluated — only the script.",
  tags: sharedTags("audio-script"),
};

export const STUDIO_FIXTURES: EvalFixture[] = [
  studioReportAgentic20,
  studioFlashcardsAgentic20,
  studioQuizAgentic20,
  studioMindmapAgentic20,
  studioInfographicAgentic20,
  studioSpreadsheetAgentic20,
  studioWrittenQuestionsAgentic20,
  studioAudioScriptAgentic20,
];

export { studioFlashcardsAgentic20 };
