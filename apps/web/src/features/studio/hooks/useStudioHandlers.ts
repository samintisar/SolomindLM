import { useConvexAuth } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import type { Note, Source } from "@/shared/types/index";
import type { AudioConfig } from "../components/CustomizeAudioModal";
import type { FlashcardConfig } from "../components/CustomizeFlashcardsModal";
import type { InfographicConfig } from "../components/CustomizeInfographicModal";
import type { MindMapConfig } from "../components/CustomizeMindMapModal";
import type { QuizConfig } from "../components/CustomizeQuizModal";
import type { SpreadsheetConfig } from "../components/CustomizeSpreadsheetsModal";
import type { WrittenQuestionsConfig } from "../components/CustomizeWrittenQuestionsModal";
import {
  type CreateFlowContext,
  useCreateAudioFlow,
  useCreateFlashcardsFlow,
  useCreateInfographicFlow,
  useCreateMindMapFlow,
  useCreateQuizFlow,
  useCreateReportFlow,
  useCreateSpreadsheetFlow,
  useCreateWrittenQuestionsFlow,
} from "./flows";

const STUDIO_TOOL_IDS = [
  "reports",
  "flashcards",
  "quiz",
  "infographic",
  "audio",
  "mindmap",
  "writtenQuestions",
  "spreadsheets",
] as const;

/** A Studio tool card; each opens its customize modal. */
type StudioToolId = (typeof STUDIO_TOOL_IDS)[number];

function isStudioToolId(id: string): id is StudioToolId {
  return (STUDIO_TOOL_IDS as readonly string[]).includes(id);
}

export interface UseStudioHandlersProps {
  sources: Source[];
  notebookId?: string | null;
  onAddNote: (note: Note) => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  confirm?: CreateFlowContext["confirm"];
}

/** Each modal's submit handler: closes the modal, then starts that tool's create flow. */
interface StudioCreateHandlers {
  reports: (formatId: string, customPrompt?: string) => void;
  flashcards: (config: FlashcardConfig) => void;
  quiz: (config: QuizConfig) => void;
  infographic: (config: InfographicConfig) => void;
  audio: (config: AudioConfig) => void;
  mindmap: (config: MindMapConfig) => void;
  writtenQuestions: (config: WrittenQuestionsConfig) => void;
  spreadsheets: (config: SpreadsheetConfig) => void;
}

export interface UseStudioHandlersReturn {
  /** The tool whose customize modal is open, if any. */
  openTool: StudioToolId | null;
  closeTool: () => void;
  handleToolClick: (toolId: string) => void;
  create: StudioCreateHandlers;
}

export function useStudioHandlers({
  sources = [],
  notebookId,
  onAddNote,
  onUpdateNoteFull,
  onDeleteNote,
  confirm,
}: UseStudioHandlersProps): UseStudioHandlersReturn {
  const { isAuthenticated } = useConvexAuth();
  const [openTool, setOpenTool] = useState<StudioToolId | null>(null);

  const flowContext: CreateFlowContext = useMemo(
    () => ({
      sources,
      isAuthenticated,
      notebookId,
      onAddNote,
      onUpdateNoteFull,
      onDeleteNote,
      confirm,
    }),
    [sources, isAuthenticated, notebookId, onAddNote, onUpdateNoteFull, onDeleteNote, confirm]
  );

  const reportFlow = useCreateReportFlow(flowContext);
  const flashcardsFlow = useCreateFlashcardsFlow(flowContext);
  const quizFlow = useCreateQuizFlow(flowContext);
  const infographicFlow = useCreateInfographicFlow(flowContext);
  const audioFlow = useCreateAudioFlow(flowContext);
  const mindMapFlow = useCreateMindMapFlow(flowContext);
  const writtenQuestionsFlow = useCreateWrittenQuestionsFlow(flowContext);
  const spreadsheetFlow = useCreateSpreadsheetFlow(flowContext);

  const closeTool = useCallback(() => setOpenTool(null), []);

  const handleToolClick = useCallback((toolId: string) => {
    if (isStudioToolId(toolId)) setOpenTool(toolId);
  }, []);

  const create = useMemo<StudioCreateHandlers>(() => {
    const closeThen =
      <TConfig>(flow: (config: TConfig) => Promise<void>) =>
      (config: TConfig) => {
        setOpenTool(null);
        void flow(config);
      };
    return {
      reports: (formatId, customPrompt) => closeThen(reportFlow)({ formatId, customPrompt }),
      flashcards: closeThen(flashcardsFlow),
      quiz: closeThen(quizFlow),
      infographic: closeThen(infographicFlow),
      audio: closeThen(audioFlow),
      mindmap: closeThen(mindMapFlow),
      writtenQuestions: closeThen(writtenQuestionsFlow),
      spreadsheets: closeThen(spreadsheetFlow),
    };
  }, [
    reportFlow,
    flashcardsFlow,
    quizFlow,
    infographicFlow,
    audioFlow,
    mindMapFlow,
    writtenQuestionsFlow,
    spreadsheetFlow,
  ]);

  return { openTool, closeTool, handleToolClick, create };
}
