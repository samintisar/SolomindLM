import { useCallback } from "react";
import { getReportSubtitle } from "@/shared/types/reportTypes";
import type { AudioConfig } from "../../components/CustomizeAudioModal";
import type { FlashcardConfig } from "../../components/CustomizeFlashcardsModal";
import type { InfographicConfig } from "../../components/CustomizeInfographicModal";
import type { MindMapConfig } from "../../components/CustomizeMindMapModal";
import type { QuizConfig } from "../../components/CustomizeQuizModal";
import type { SpreadsheetConfig } from "../../components/CustomizeSpreadsheetsModal";
import type { WrittenQuestionsConfig } from "../../components/CustomizeWrittenQuestionsModal";
import { useCreateAudioOverview } from "../../services/audioApi";
import { useCreateFlashcard } from "../../services/flashcardsApi";
import { useCreateInfographic } from "../../services/infographicApi";
import { useCreateMindMap } from "../../services/mindMapApi";
import { useCreateQuiz } from "../../services/quizzesApi";
import { useCreateReport } from "../../services/reportsApi";
import { getSpreadsheetTypeLabel, useCreateSpreadsheet } from "../../services/spreadsheetsApi";
import { useCreateWrittenQuestions } from "../../services/writtenQuestionsApi";
import type { CreateFlowContext } from "./types";
import { type NotePlaceholder, useStudioCreateFlow } from "./useStudioCreateFlow";

// Placeholders and copy live at module scope so each flow's callback stays stable.

type StartTarget = { notebookId: string; documentIds: string[] };

/** The report modal's format, plus the user's own instructions for a custom one. */
interface ReportFlowConfig {
  formatId: string;
  customPrompt?: string;
}

const REPORT_TITLES: Record<string, string> = {
  briefing: "Briefing Document",
  study_guide: "Study Guide",
  blog_post: "Blog Post",
  summary: "Summary",
  technical_report: "Technical Report",
  concept_explainer: "Concept Explainer",
  methodology_overview: "Methodology Overview",
  custom: "Custom Report",
};

const reportPlaceholder = (
  { formatId }: ReportFlowConfig,
  documentIds: string[]
): NotePlaceholder => ({
  title: REPORT_TITLES[formatId] || "New Report",
  preview: getReportSubtitle(formatId),
  type: "report",
  content: "",
  metadata: { reportType: formatId, documentIds },
});

const REPORT_ERRORS = {
  toast: "Couldn't start the report. Please try again.",
  dev: "Failed to create report",
};

export function useCreateReportFlow(ctx: CreateFlowContext) {
  const createReport = useCreateReport();
  const start = useCallback(
    ({ formatId, customPrompt }: ReportFlowConfig, target: StartTarget) =>
      createReport({ ...target, reportType: formatId, customPrompt }),
    [createReport]
  );
  return useStudioCreateFlow(ctx, {
    noun: "a report",
    buildPlaceholder: reportPlaceholder,
    start,
    errorCopy: REPORT_ERRORS,
  });
}

/** Cards per set for the flashcards modal's size choice. */
const FLASHCARD_COUNT_MAP = { fewer: 20, standard: 35, more: 55 };

const flashcardsPlaceholder = (config: FlashcardConfig): NotePlaceholder => {
  const cardCount = FLASHCARD_COUNT_MAP[config.count];
  return {
    title: "Flashcards",
    preview: `${cardCount} Cards • ${config.difficulty}`,
    type: "flashcard",
    flashcards: [],
    metadata: { cardCount, difficulty: config.difficulty, topic: config.topic },
  };
};

const FLASHCARD_ERRORS = {
  toast: "Couldn't start flashcards. Please try again.",
  dev: "Failed to create flashcards",
};

export function useCreateFlashcardsFlow(ctx: CreateFlowContext) {
  const createFlashcards = useCreateFlashcard();
  const start = useCallback(
    (config: FlashcardConfig, target: StartTarget) =>
      createFlashcards({
        ...target,
        cardCount: FLASHCARD_COUNT_MAP[config.count],
        difficulty: config.difficulty,
        topic: config.topic || undefined,
      }),
    [createFlashcards]
  );
  return useStudioCreateFlow(ctx, {
    noun: "flashcards",
    buildPlaceholder: flashcardsPlaceholder,
    start,
    errorCopy: FLASHCARD_ERRORS,
  });
}

/** Questions per quiz for the quiz modal's size choice. */
const QUIZ_COUNT_MAP = { fewer: 10, standard: 20, more: 30 };

const quizPlaceholder = (config: QuizConfig): NotePlaceholder => {
  const questionCount = QUIZ_COUNT_MAP[config.count];
  return {
    title: "Quiz",
    preview: `${questionCount} Questions • ${config.difficulty}`,
    type: "quiz",
    questions: [],
    metadata: { questionCount, difficulty: config.difficulty, focusArea: config.focus },
  };
};

const QUIZ_ERRORS = {
  toast: "Couldn't start the quiz. Please try again.",
  dev: "Failed to create quiz",
};

export function useCreateQuizFlow(ctx: CreateFlowContext) {
  const createQuiz = useCreateQuiz();
  const start = useCallback(
    (config: QuizConfig, target: StartTarget) =>
      createQuiz({
        ...target,
        questionCount: QUIZ_COUNT_MAP[config.count],
        difficulty: config.difficulty,
        focus: config.focus || undefined,
      }),
    [createQuiz]
  );
  return useStudioCreateFlow(ctx, {
    noun: "a quiz",
    buildPlaceholder: quizPlaceholder,
    start,
    errorCopy: QUIZ_ERRORS,
  });
}

/** Questions per set for the written-questions modal's size choice. */
const WQ_COUNT_MAP = { fewer: 5, standard: 10, more: 15 };

const writtenQuestionsPlaceholder = (config: WrittenQuestionsConfig): NotePlaceholder => {
  const questionCount = WQ_COUNT_MAP[config.count];
  return {
    title: "Written Questions",
    preview: `${questionCount} Questions • ${config.questionType}`,
    type: "writtenQuestions",
    questions: [],
    metadata: {
      questionCount,
      difficulty: config.difficulty,
      questionType: config.questionType,
      focusArea: config.focus,
    },
  };
};

const WQ_ERRORS = {
  toast: "Couldn't start written questions. Please try again.",
  dev: "Failed to create written questions",
};

export function useCreateWrittenQuestionsFlow(ctx: CreateFlowContext) {
  const createWrittenQuestions = useCreateWrittenQuestions();
  const start = useCallback(
    (config: WrittenQuestionsConfig, target: StartTarget) =>
      createWrittenQuestions({
        ...target,
        questionCount: WQ_COUNT_MAP[config.count],
        difficulty: config.difficulty,
        questionType: config.questionType,
        focus: config.focus || undefined,
      }),
    [createWrittenQuestions]
  );
  return useStudioCreateFlow(ctx, {
    noun: "written questions",
    buildPlaceholder: writtenQuestionsPlaceholder,
    start,
    errorCopy: WQ_ERRORS,
  });
}

const mindMapPlaceholder = (): NotePlaceholder => ({
  title: "Mind Map",
  preview: "Mind Map",
  type: "mindmap",
  content: "",
  mindMapData: { nodeData: { id: "root", topic: "", children: [] } },
  metadata: {},
});

const MIND_MAP_ERRORS = {
  toast: "Couldn't start the mind map. Please try again.",
  dev: "Failed to create mind map",
};

export function useCreateMindMapFlow(ctx: CreateFlowContext) {
  const createMindMap = useCreateMindMap();
  const start = useCallback(
    (config: MindMapConfig, target: StartTarget) =>
      createMindMap({
        ...target,
        title: "Mind Map",
        customPrompt: config.customPrompt.trim() || undefined,
      }),
    [createMindMap]
  );
  return useStudioCreateFlow(ctx, {
    noun: "a mind map",
    buildPlaceholder: mindMapPlaceholder,
    start,
    errorCopy: MIND_MAP_ERRORS,
  });
}

const infographicPlaceholder = (
  config: InfographicConfig,
  documentIds: string[]
): NotePlaceholder => ({
  title: "Infographic",
  preview: "Infographic • Generating...",
  type: "infographic",
  imageUrl: "",
  metadata: {
    sourceDocumentIds: documentIds,
    generatedAt: 0,
    customPrompt: config.customPrompt,
    orientation: config.orientation,
    visualStyle: config.visualStyle,
    detailLevel: config.detailLevel,
  },
});

const INFOGRAPHIC_ERRORS = {
  toast: "Couldn't start the infographic. Please try again.",
  dev: "Failed to create infographic",
};

export function useCreateInfographicFlow(ctx: CreateFlowContext) {
  const createInfographic = useCreateInfographic();
  const start = useCallback(
    (config: InfographicConfig, target: StartTarget) =>
      createInfographic({
        ...target,
        title: "Infographic",
        customPrompt: config.customPrompt,
        orientation: config.orientation,
        visualStyle: config.visualStyle,
        detailLevel: config.detailLevel,
      }),
    [createInfographic]
  );
  return useStudioCreateFlow(ctx, {
    noun: "an infographic",
    buildPlaceholder: infographicPlaceholder,
    start,
    errorCopy: INFOGRAPHIC_ERRORS,
  });
}

const spreadsheetPlaceholder = (
  config: SpreadsheetConfig,
  documentIds: string[]
): NotePlaceholder => ({
  title: "Spreadsheet",
  preview: `Spreadsheet • ${getSpreadsheetTypeLabel(config.spreadsheetType)}`,
  type: "spreadsheet",
  content: "",
  metadata: {
    spreadsheetType: config.spreadsheetType,
    documentIds,
    customPrompt: config.customPrompt,
  },
});

const SPREADSHEET_ERRORS = {
  toast: "Couldn't start the spreadsheet. Please try again.",
  dev: "Failed to create spreadsheet",
};

export function useCreateSpreadsheetFlow(ctx: CreateFlowContext) {
  const createSpreadsheet = useCreateSpreadsheet();
  const start = useCallback(
    (config: SpreadsheetConfig, target: StartTarget) =>
      createSpreadsheet({
        ...target,
        title: "Spreadsheet",
        spreadsheetType: config.spreadsheetType,
        customPrompt: config.customPrompt,
      }),
    [createSpreadsheet]
  );
  return useStudioCreateFlow(ctx, {
    noun: "a spreadsheet",
    buildPlaceholder: spreadsheetPlaceholder,
    start,
    errorCopy: SPREADSHEET_ERRORS,
  });
}

/** The audio format id as a title: "deep_dive" -> "Deep Dive" (first underscore only). */
const audioFormatTitle = (formatId: string) =>
  formatId.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());

const audioPlaceholder = (config: AudioConfig): NotePlaceholder => ({
  title: "Audio Overview",
  preview: `Audio Overview • ${audioFormatTitle(config.formatId)} • ${config.length}`,
  type: "audioOverview",
  audioUrl: "",
  transcript: "",
  metadata: {
    audioType: config.formatId,
    length: config.length,
    focus: config.focus,
  },
});

const AUDIO_ERRORS = {
  toast: "Couldn't start the audio overview. Please try again.",
  dev: "Failed to create audio overview",
};

export function useCreateAudioFlow(ctx: CreateFlowContext) {
  const createAudioOverview = useCreateAudioOverview();
  const start = useCallback(
    (config: AudioConfig, target: StartTarget) =>
      createAudioOverview({
        ...target,
        title: `Audio Overview • ${audioFormatTitle(config.formatId)}`,
        audioType: config.formatId,
        length: config.length,
        focus: config.focus,
      }),
    [createAudioOverview]
  );
  return useStudioCreateFlow(ctx, {
    noun: "an audio overview",
    buildPlaceholder: audioPlaceholder,
    start,
    errorCopy: AUDIO_ERRORS,
  });
}
