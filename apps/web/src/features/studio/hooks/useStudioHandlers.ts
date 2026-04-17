import { useState, useCallback, useMemo } from "react";
import type { Note, Source } from "@/shared/types/index";
import type { FlashcardConfig } from "../components/CustomizeFlashcardsModal";
import type { QuizConfig } from "../components/CustomizeQuizModal";
import type { AudioConfig } from "../components/CustomizeAudioModal";
import type { WrittenQuestionsConfig } from "../components/CustomizeWrittenQuestionsModal";
import type { SlideDeckConfig } from "../components/CustomizeSlidesModal";
import type { SpreadsheetConfig } from "../components/CustomizeSpreadsheetsModal";
import {
  type CreateFlowContext,
  useCreateReportFlow,
  useCreateFlashcardsFlow,
  useCreateQuizFlow,
  useCreateMindMapFlow,
  useCreateWrittenQuestionsFlow,
  useCreateSlidesFlow,
  useCreateSpreadsheetFlow,
  useCreateAudioFlow,
} from "./flows";
import { useToast } from "@/shared/contexts/ToastContext";

export interface UseStudioHandlersProps {
  notes: Note[];
  sources: Source[];
  userId?: string | null;
  noteId?: string | null;
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
  isSlidesModalOpen: boolean;
  isSpreadsheetsModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  setIsFlashcardModalOpen: (open: boolean) => void;
  setIsQuizModalOpen: (open: boolean) => void;
  setIsAudioModalOpen: (open: boolean) => void;
  setIsWrittenQuestionsModalOpen: (open: boolean) => void;
  setIsSlidesModalOpen: (open: boolean) => void;
  setIsSpreadsheetsModalOpen: (open: boolean) => void;
  handleToolClick: (toolId: string) => void;
  handleCreateReport: (formatId: string, customPrompt?: string) => Promise<void>;
  handleCreateFlashcards: (config: FlashcardConfig) => Promise<void>;
  handleCreateQuiz: (config: QuizConfig) => Promise<void>;
  handleCreateMindMap: () => Promise<void>;
  handleCreateAudio: (config: AudioConfig) => void;
  handleCreateWrittenQuestions: (config: WrittenQuestionsConfig) => void;
  handleCreateSlides: (config: SlideDeckConfig) => Promise<void>;
  handleCreateSpreadsheet: (config: SpreadsheetConfig) => Promise<void>;
}

export function useStudioHandlers({
  notes,
  sources = [],
  userId,
  noteId,
  onAddNote,
  onUpdateNoteFull,
  onDeleteNote,
  confirm,
}: UseStudioHandlersProps): UseStudioHandlersReturn {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isWrittenQuestionsModalOpen, setIsWrittenQuestionsModalOpen] = useState(false);
  const [isSlidesModalOpen, setIsSlidesModalOpen] = useState(false);
  const [isSpreadsheetsModalOpen, setIsSpreadsheetsModalOpen] = useState(false);

  const toast = useToast();

  const flowContext: CreateFlowContext = useMemo(
    () => ({
      notes,
      sources,
      userId,
      noteId,
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
    [notes, sources, userId, noteId, onAddNote, onUpdateNoteFull, onDeleteNote, confirm, toast]
  );

  const createReportFlow = useCreateReportFlow(flowContext);
  const createFlashcardsFlow = useCreateFlashcardsFlow(flowContext);
  const createQuizFlow = useCreateQuizFlow(flowContext);
  const createMindMapFlow = useCreateMindMapFlow(flowContext);
  const createWrittenQuestionsFlow = useCreateWrittenQuestionsFlow(flowContext);
  const createSlidesFlow = useCreateSlidesFlow(flowContext);
  const createSpreadsheetFlow = useCreateSpreadsheetFlow(flowContext);
  const createAudioFlow = useCreateAudioFlow(flowContext);

  const handleToolClick = useCallback(
    (toolId: string) => {
      if (toolId === "reports") setIsReportModalOpen(true);
      else if (toolId === "flashcards") setIsFlashcardModalOpen(true);
      else if (toolId === "quiz") setIsQuizModalOpen(true);
      else if (toolId === "slides") setIsSlidesModalOpen(true);
      else if (toolId === "audio") setIsAudioModalOpen(true);
      else if (toolId === "mindmap") createMindMapFlow();
      else if (toolId === "writtenQuestions") setIsWrittenQuestionsModalOpen(true);
      else if (toolId === "spreadsheets") setIsSpreadsheetsModalOpen(true);
    },
    [createMindMapFlow]
  );

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

  const handleCreateSlides = useCallback(
    async (config: SlideDeckConfig) => {
      setIsSlidesModalOpen(false);
      await createSlidesFlow(config);
    },
    [createSlidesFlow]
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
    isSlidesModalOpen,
    isSpreadsheetsModalOpen,
    setIsReportModalOpen,
    setIsFlashcardModalOpen,
    setIsQuizModalOpen,
    setIsAudioModalOpen,
    setIsWrittenQuestionsModalOpen,
    setIsSlidesModalOpen,
    setIsSpreadsheetsModalOpen,
    handleToolClick,
    handleCreateReport,
    handleCreateFlashcards,
    handleCreateQuiz,
    handleCreateMindMap: createMindMapFlow,
    handleCreateAudio,
    handleCreateWrittenQuestions,
    handleCreateSlides,
    handleCreateSpreadsheet,
  };
}
