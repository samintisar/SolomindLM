/**
 * Studio fixtures for the agentic-patterns test notebook.
 * All studio fixtures share the same notebookId and reuse the 20-pattern
 * ground-truth list as `expectedItems`.
 */
import type { EvalFixture } from "../../types";
import {
  AGENTIC_20_ITEMS,
  AGENTIC_20_NOTEBOOK_ID,
  AGENTIC_20_STUDIO_PARAMS,
} from "../agentic-patterns-20";

import { studioFlashcardsAgentic20 } from "./flashcards";

const sharedExpectedItems = (): string[] => [...AGENTIC_20_ITEMS];

const sharedTags = (kind: string): string[] => [
  "studio",
  kind,
  "list-enumeration",
  "agentic-patterns",
];

const REPORT_ENUMERATION_PROMPT =
  "Include a dedicated section titled '## The 20 Agentic Design Patterns' with numbered entries 1–20. " +
  "Each entry must name one pattern and give a 2–4 sentence description. " +
  "Use [Source N] citations where appropriate. " +
  "Cover only agentic AI design patterns — exclude unrelated topics.";

export const studioReportAgentic20: EvalFixture = {
  schemaVersion: 1,
  id: "studio-report-agentic-patterns-20",
  question: "Generate a report covering the 20 agentic AI design patterns.",
  runner: "report",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Report should explicitly enumerate and describe each of the 20 agentic AI design patterns " +
    "with clear organization and citations to source content.",
  studioParams: {
    ...AGENTIC_20_STUDIO_PARAMS,
    reportType: "summary",
    customPrompt: REPORT_ENUMERATION_PROMPT,
  },
  expectedStructure: {
    minItems: 20,
    requiredSections: ["The 20 Agentic Design Patterns"],
  },
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
  expectedItems: [],
  expectedAnswer:
    "An infographic showing 20 agentic AI design patterns with visual icons/labels for each: prompt chaining, routing, parallelization, reflection, tool use, planning, multi-agent collaboration, memory management, learning and adaptation, goal setting and monitoring, exception handling and recovery, human in the loop, knowledge retrieval, inter-agent communication, resource-aware optimization, reasoning techniques, evaluation and monitoring, guardrails and safety patterns, prioritization, exploration and discovery.",
  expectedBehavior:
    "Infographic should visually represent the agentic AI patterns with clear labels, icons, and an organized layout.",
  studioParams: {
    customPrompt:
      "Visualize the 20 agentic AI design patterns as an infographic with icons and brief descriptions for each pattern.",
  },
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
  studioParams: { ...AGENTIC_20_STUDIO_PARAMS, questionCount: 20, difficulty: "medium" },
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

export const studioAudioScriptShort: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-short",
  question: "Generate a SHORT audio overview script covering the 20 agentic AI design patterns.",
  runner: "audioScript",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Short two-host dialogue script (~12 min, ~2000 words). Should cover all 20 patterns briefly.",
  studioParams: { length: "short", audioType: "deep_dive" },
  expectedStructure: { minItems: 100 },
  tags: [...sharedTags("audio-script"), "length-short"],
};

export const studioAudioScriptDefault: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-default",
  question: "Generate a DEFAULT audio overview script covering the 20 agentic AI design patterns.",
  runner: "audioScript",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Default two-host dialogue script (~27 min, ~4400 words). Should cover all 20 patterns with depth.",
  studioParams: { length: "default", audioType: "deep_dive" },
  expectedStructure: { minItems: 220 },
  tags: [...sharedTags("audio-script"), "length-default"],
};

export const studioAudioScriptLong: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-long",
  question: "Generate a LONG audio overview script covering the 20 agentic AI design patterns.",
  runner: "audioScript",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior:
    "Long two-host dialogue script (~43 min, ~7000 words). Should cover all 20 patterns in depth with examples and discussion.",
  studioParams: { length: "long", audioType: "deep_dive" },
  expectedStructure: { minItems: 350 },
  tags: [...sharedTags("audio-script"), "length-long"],
};

// ─── Script-only fixtures (no TTS, faster iteration) ─────────

export const studioAudioScriptOnlyShort: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-only-short",
  question: "Generate a SHORT audio overview script (script only, no TTS).",
  runner: "audioScriptOnly",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior: "Short two-host dialogue script (~12 min, ~2000 words).",
  studioParams: { length: "short", audioType: "deep_dive" },
  expectedStructure: { minItems: 100 },
  tags: [...sharedTags("audio-script"), "length-short", "script-only"],
};

export const studioAudioScriptOnlyDefault: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-only-default",
  question: "Generate a DEFAULT audio overview script (script only, no TTS).",
  runner: "audioScriptOnly",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior: "Default two-host dialogue script (~27 min, ~4400 words).",
  studioParams: { length: "default", audioType: "deep_dive" },
  expectedStructure: { minItems: 220 },
  tags: [...sharedTags("audio-script"), "length-default", "script-only"],
};

export const studioAudioScriptOnlyLong: EvalFixture = {
  schemaVersion: 1,
  id: "studio-audio-script-only-long",
  question: "Generate a LONG audio overview script (script only, no TTS).",
  runner: "audioScriptOnly",
  notebookId: AGENTIC_20_NOTEBOOK_ID,
  expectedItems: sharedExpectedItems(),
  expectedBehavior: "Long two-host dialogue script (~43 min, ~7000 words).",
  studioParams: { length: "long", audioType: "deep_dive" },
  expectedStructure: { minItems: 350 },
  tags: [...sharedTags("audio-script"), "length-long", "script-only"],
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
  studioAudioScriptShort,
  studioAudioScriptDefault,
  studioAudioScriptLong,
  studioAudioScriptOnlyShort,
  studioAudioScriptOnlyDefault,
  studioAudioScriptOnlyLong,
];

export { studioFlashcardsAgentic20 };
