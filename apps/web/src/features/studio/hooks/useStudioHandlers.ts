import { useConvexAuth } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/shared/contexts/useToast";
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

export interface UseStudioHandlersProps {
  notes: Note[];
  sources: Source[];
  notebookId?: string | null;
  onAddNote: (note: Note) => void;
  onUpdateNote: (id: string, newTitle: string) => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  onSetActiveNoteId: (noteId: string | null) => void;
  confirm?: (
    title: string,
    message: string | React.ReactNode,
    options?: {
      confirmText?: string;
      cancelText?: string;
      variant?: "danger" | "warning" | "default";
    }
  ) => Promise<boolean>;
}

export interface UseStudioHandlersReturn {
  isReportModalOpen: boolean;
  isFlashcardModalOpen: boolean;
  isQuizModalOpen: boolean;
  isAudioModalOpen: boolean;
  isWrittenQuestionsModalOpen: boolean;
  isInfographicModalOpen: boolean;
  isSpreadsheetsModalOpen: boolean;
  isMindMapModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  setIsFlashcardModalOpen: (open: boolean) => void;
  setIsQuizModalOpen: (open: boolean) => void;
  setIsAudioModalOpen: (open: boolean) => void;
  setIsWrittenQuestionsModalOpen: (open: boolean) => void;
  setIsInfographicModalOpen: (open: boolean) => void;
  setIsSpreadsheetsModalOpen: (open: boolean) => void;
  setIsMindMapModalOpen: (open: boolean) => void;
  handleToolClick: (toolId: string) => void;
  handleCreateReport: (formatId: string, customPrompt?: string) => Promise<void>;
  handleCreateFlashcards: (config: FlashcardConfig) => Promise<void>;
  handleCreateQuiz: (config: QuizConfig) => Promise<void>;
  handleCreateMindMap: (config: MindMapConfig) => Promise<void>;
  handleCreateAudio: (config: AudioConfig) => void;
  handleCreateWrittenQuestions: (config: WrittenQuestionsConfig) => void;
  handleCreateInfographic: (config: InfographicConfig) => Promise<void>;
  handleCreateSpreadsheet: (config: SpreadsheetConfig) => Promise<void>;
}

export function useStudioHandlers({
  notes,
  sources = [],
  notebookId,
  onAddNote,
  onUpdateNoteFull,
  onDeleteNote,
  confirm,
}: UseStudioHandlersProps): UseStudioHandlersReturn {
  const { isAuthenticated } = useConvexAuth();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isWrittenQuestionsModalOpen, setIsWrittenQuestionsModalOpen] = useState(false);
  const [isInfographicModalOpen, setIsInfographicModalOpen] = useState(false);
  const [isSpreadsheetsModalOpen, setIsSpreadsheetsModalOpen] = useState(false);
  const [isMindMapModalOpen, setIsMindMapModalOpen] = useState(false);

  const toast = useToast();

  const flowContext: CreateFlowContext = useMemo(
    () => ({
      notes,
      sources,
      isAuthenticated,
      notebookId,
      onAddNote,
      onUpdateNoteFull,
      onDeleteNote,
      confirm,
      toast: {
        success: toast.success,
        error: toast.error,
        info: toast.info,
        loading: toast.loading,
      },
    }),
    [
      notes,
      sources,
      isAuthenticated,
      notebookId,
      onAddNote,
      onUpdateNoteFull,
      onDeleteNote,
      confirm,
      toast,
    ]
  );

  const createReportFlow = useCreateReportFlow(flowContext);
  const createFlashcardsFlow = useCreateFlashcardsFlow(flowContext);
  const createQuizFlow = useCreateQuizFlow(flowContext);
  const createMindMapFlow = useCreateMindMapFlow(flowContext);
  const createWrittenQuestionsFlow = useCreateWrittenQuestionsFlow(flowContext);
  const createInfographicFlow = useCreateInfographicFlow(flowContext);
  const createSpreadsheetFlow = useCreateSpreadsheetFlow(flowContext);
  const createAudioFlow = useCreateAudioFlow(flowContext);

  const handleToolClick = useCallback((toolId: string) => {
    if (toolId === "reports") setIsReportModalOpen(true);
    else if (toolId === "flashcards") setIsFlashcardModalOpen(true);
    else if (toolId === "quiz") setIsQuizModalOpen(true);
    else if (toolId === "infographic") setIsInfographicModalOpen(true);
    else if (toolId === "audio") setIsAudioModalOpen(true);
    else if (toolId === "mindmap") setIsMindMapModalOpen(true);
    else if (toolId === "writtenQuestions") setIsWrittenQuestionsModalOpen(true);
    else if (toolId === "spreadsheets") setIsSpreadsheetsModalOpen(true);
  }, []);

  const handleCreateReport = useCallback(
    async (formatId: string, customPrompt?: string) => {
      setIsReportModalOpen(false);
      await createReportFlow(formatId, customPrompt);
    },
    [createReportFlow]
  );

  const handleCreateFlashcards = useCallback(
    async (config: FlashcardConfig) => {
      setIsFlashcardModalOpen(false);
      await createFlashcardsFlow(config);
    },
    [createFlashcardsFlow]
  );

  const handleCreateQuiz = useCallback(
    async (config: QuizConfig) => {
      setIsQuizModalOpen(false);
      await createQuizFlow(config);
    },
    [createQuizFlow]
  );

  const handleCreateWrittenQuestions = useCallback(
    async (config: WrittenQuestionsConfig) => {
      setIsWrittenQuestionsModalOpen(false);
      await createWrittenQuestionsFlow(config);
    },
    [createWrittenQuestionsFlow]
  );

  const handleCreateAudio = useCallback(
    (config: AudioConfig) => {
      setIsAudioModalOpen(false);
      void createAudioFlow(config);
    },
    [createAudioFlow]
  );

  const handleCreateInfographic = useCallback(
    async (config: InfographicConfig) => {
      setIsInfographicModalOpen(false);
      await createInfographicFlow(config);
    },
    [createInfographicFlow]
  );

  const handleCreateMindMap = useCallback(
    async (config: MindMapConfig) => {
      setIsMindMapModalOpen(false);
      await createMindMapFlow(config);
    },
    [createMindMapFlow]
  );

  const handleCreateSpreadsheet = useCallback(
    async (config: SpreadsheetConfig) => {
      setIsSpreadsheetsModalOpen(false);
      await createSpreadsheetFlow(config);
    },
    [createSpreadsheetFlow]
  );

  return {
    isReportModalOpen,
    isFlashcardModalOpen,
    isQuizModalOpen,
    isAudioModalOpen,
    isWrittenQuestionsModalOpen,
    isInfographicModalOpen,
    isSpreadsheetsModalOpen,
    isMindMapModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    setIsWrittenQuestionsModalOpen,
    setIsInfographicModalOpen,
    setIsSpreadsheetsModalOpen,
    setIsMindMapModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateMindMap,
    handleCreateAudio,
    handleCreateWrittenQuestions,
    handleCreateInfographic,
    handleCreateSpreadsheet,
  };
}
