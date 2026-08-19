/**
 * Studio fixtures on the ML notebook — product-like prompts (no enumeration coaching).
 * Notebook: jd72h9qsq5zap11ede5k8rqkx585djmc
 */
import type { EvalFixture } from "../../types";

export const ML_NOTEBOOK_ID = "jd72h9qsq5zap11ede5k8rqkx585djmc";

const mlTags = (kind: string, split?: EvalFixture["split"]): string[] => {
  const tags = ["studio", kind, "ml-notebook"];
  if (split) tags.push(`split-${split}`);
  return tags;
};

export const studioMlReportTrain: EvalFixture = {
  schemaVersion: 1,
  id: "studio-ml-report-train",
  split: "train",
  question: "Summarize the main ideas from my ML course notes for a study guide.",
  runner: "report",
  notebookId: ML_NOTEBOOK_ID,
  expectedItems: ["supervised", "unsupervised", "overfitting"],
  expectedBehavior:
    "Report should synthesize key ML concepts from the notebook with clear sections and accurate terminology.",
  studioParams: {
    reportType: "summary",
    customPrompt:
      "Create a study guide covering core machine learning concepts from the sources. " +
      "Organize by topic with brief explanations suitable for exam prep.",
  },
  expectedStructure: {
    minItems: 3,
    requiredSections: ["Introduction"],
  },
  tags: mlTags("report"),
  scenarioCategory: "summarization",
};

export const studioMlFlashcardsTrain: EvalFixture = {
  schemaVersion: 1,
  id: "studio-ml-flashcards-train",
  split: "train",
  question: "Make flashcards to review key ML definitions from my notebook.",
  runner: "flashcards",
  notebookId: ML_NOTEBOOK_ID,
  expectedItems: ["gradient", "loss", "feature"],
  expectedBehavior:
    "Flashcards should have clear questions and answers grounded in notebook content.",
  studioParams: { cardCount: 12, difficulty: "medium" },
  expectedStructure: { minItems: 10 },
  tags: mlTags("flashcards"),
};

export const studioMlQuizTrain: EvalFixture = {
  schemaVersion: 1,
  id: "studio-ml-quiz-train",
  split: "train",
  question: "Quiz me on supervised vs unsupervised learning from my notes.",
  runner: "quiz",
  notebookId: ML_NOTEBOOK_ID,
  expectedItems: ["supervised", "unsupervised", "label"],
  expectedBehavior: "Quiz questions should test understanding with answer keys.",
  studioParams: { questionCount: 10, difficulty: "medium" },
  expectedStructure: { minItems: 8 },
  tags: mlTags("quiz"),
  scenarioCategory: "comparison",
};

export const studioMlMindmapHoldout: EvalFixture = {
  schemaVersion: 1,
  id: "studio-ml-mindmap-holdout",
  split: "holdout",
  question: "Map how preprocessing, model training, and evaluation connect in ML workflows.",
  runner: "mindmap",
  notebookId: ML_NOTEBOOK_ID,
  expectedItems: ["preprocessing", "training", "evaluation"],
  expectedBehavior: "Mindmap should show relationships between workflow stages from the notebook.",
  expectedStructure: { minItems: 5, jsonShape: "mindmap" },
  tags: mlTags("mindmap", "holdout"),
  scenarioCategory: "explanation",
};

export const ML_STUDIO_FIXTURES: EvalFixture[] = [
  studioMlReportTrain,
  studioMlFlashcardsTrain,
  studioMlQuizTrain,
  studioMlMindmapHoldout,
];
