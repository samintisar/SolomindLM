import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { Note } from "@/shared/types/index";
import { getReportSubtitle, normalizeReportTypeId } from "@/shared/types/reportTypes";
import { pickStudioGenerationFields } from "../utils/studioGenerationLabels";
import { getSpreadsheetTypeLabel } from "./spreadsheetsApi";

function arrayCount(data: unknown, summaryCount: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (typeof summaryCount === "number" && Number.isFinite(summaryCount)) return summaryCount;
  return 0;
}

function normalizeMindMapNodeData(rawData: any, fallbackTitle: string) {
  const maybeWrapped = rawData?.nodeData?.nodeData ?? rawData?.nodeData ?? rawData;
  const normalized = maybeWrapped && typeof maybeWrapped === "object" ? { ...maybeWrapped } : {};

  if (typeof normalized.topic !== "string" || normalized.topic.trim().length === 0) {
    normalized.topic = fallbackTitle || "Mind Map";
  }
  if (typeof normalized.id !== "string" || normalized.id.trim().length === 0) {
    normalized.id = "root";
  }

  return normalized;
}

/**
 * Map a raw database note (with _type discriminator) to the frontend Note interface
 */
export function mapDatabaseNoteToNote(dbNote: any): Note {
  const { _type } = dbNote;

  switch (_type) {
    case "report":
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getReportPreview(dbNote),
        type: "report",
        content: dbNote.content || "",
        status: dbNote.status,
        metadata: {
          reportType: dbNote.reportType || dbNote.metadata?.reportType || "custom",
          documentIds: dbNote.metadata?.documentIds || [],
          error: dbNote.metadata?.error,
          chunksProcessed: dbNote.metadata?.chunksProcessed,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };

    case "flashcard": {
      const cardCount = arrayCount(dbNote.cardsData, dbNote._cardsCount);
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getFlashcardPreview(dbNote),
        type: "flashcard",
        flashcards: dbNote.cardsData || [],
        status: dbNote.status,
        metadata: {
          difficulty: dbNote.metadata?.difficulty || "medium",
          cardCount,
          topic: dbNote.metadata?.topic,
          error: dbNote.metadata?.error,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };
    }

    case "quiz": {
      const questionCount = arrayCount(dbNote.questionsData, dbNote._questionsCount);
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getQuizPreview(dbNote),
        type: "quiz",
        questions: dbNote.questionsData || [],
        status: dbNote.status,
        metadata: {
          questionCount,
          difficulty: dbNote.metadata?.difficulty || "medium",
          focusArea: dbNote.metadata?.focusArea,
          error: dbNote.metadata?.error,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };
    }

    case "mindmap": {
      const nodeData = normalizeMindMapNodeData(dbNote.data, dbNote.title);
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getMindMapPreview(dbNote),
        type: "mindmap",
        mindMapData: { nodeData },
        content: JSON.stringify(dbNote.data),
        status: dbNote.status,
        metadata: {
          error: dbNote.metadata?.error,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };
    }

    case "audioOverview":
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getAudioOverviewPreview(dbNote),
        type: "audioOverview",
        audioUrl: dbNote.audioUrl || "",
        transcript: dbNote.transcript || "",
        status: dbNote.status,
        metadata: dbNote.metadata,
      };

    case "infographic":
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getInfographicPreview(dbNote),
        type: "infographic",
        imageUrl: dbNote.data?.imageUrl || dbNote._imageUrl || "",
        prompt: dbNote.data?.prompt || "",
        status: dbNote.status,
        metadata: {
          sourceDocumentIds: dbNote.data?.metadata?.sourceDocumentIds || [],
          generatedAt: dbNote.data?.metadata?.generatedAt,
          customPrompt: dbNote.metadata?.customPrompt,
          orientation: dbNote.metadata?.orientation,
          visualStyle: dbNote.metadata?.visualStyle,
          detailLevel: dbNote.metadata?.detailLevel,
          error: dbNote.metadata?.error,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };

    case "spreadsheet":
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getSpreadsheetPreview(dbNote),
        type: "spreadsheet",
        content: typeof dbNote.data === "string" ? dbNote.data : dbNote.data?.content || "",
        status: dbNote.status,
        metadata: {
          spreadsheetType: dbNote.metadata?.spreadsheetType || "custom",
          documentIds: dbNote.metadata?.documentIds || [],
          error: dbNote.metadata?.error,
          customPrompt: dbNote.metadata?.customPrompt,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };

    case "writtenQuestions": {
      const questionCount = arrayCount(dbNote.questionsData, dbNote._questionsCount);
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getWrittenQuestionsPreview(dbNote),
        type: "writtenQuestions",
        questions: dbNote.questionsData || [],
        status: dbNote.status,
        metadata: {
          questionCount,
          difficulty: dbNote.metadata?.difficulty || "medium",
          questionType: dbNote.questionType || "short",
          focusArea: dbNote.metadata?.focusArea,
          totalPoints: dbNote.metadata?.totalPoints,
          error: dbNote.metadata?.error,
          ...pickStudioGenerationFields(dbNote.metadata),
        },
      };
    }

    case "note":
      return {
        id: dbNote._id,
        title: dbNote.title,
        preview: getNotePreview(dbNote),
        type: "note",
        noteType: dbNote.type || "chat",
        content: dbNote.content,
        messages: dbNote.messages,
        status: dbNote.status,
        metadata: {
          messageCount: dbNote.messageCount,
          conversationId: dbNote.conversationId,
          savedAt: new Date(dbNote.createdAt).toISOString(),
          ...dbNote.metadata,
        },
      };

    default:
      throw new Error(`Unknown note type: ${_type}`);
  }
}

/**
 * Helper functions for preview text generation
 */
function capitalizeDifficulty(difficulty: string | undefined): string {
  const d = (difficulty || "medium").toLowerCase();
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function getReportPreview(dbNote: any): string {
  const reportType = normalizeReportTypeId(
    dbNote.reportType || dbNote.metadata?.reportType || "custom"
  );
  const subtitle = getReportSubtitle(reportType);
  if (dbNote.status === "generating") return subtitle;
  if (dbNote.status === "failed") return `${subtitle} · Failed`;
  return subtitle;
}

function getFlashcardPreview(dbNote: any): string {
  const count = arrayCount(dbNote.cardsData, dbNote._cardsCount);
  const difficulty = capitalizeDifficulty(dbNote.metadata?.difficulty);
  if (dbNote.status === "generating")
    return `${count} Flashcard${count !== 1 ? "s" : ""} · ${difficulty}`;
  if (dbNote.status === "failed") return `${count} Flashcards · ${difficulty} · Failed`;
  return `${count} Flashcard${count !== 1 ? "s" : ""} · ${difficulty}`;
}

function getQuizPreview(dbNote: any): string {
  const count = arrayCount(dbNote.questionsData, dbNote._questionsCount);
  const difficulty = capitalizeDifficulty(dbNote.metadata?.difficulty);
  if (dbNote.status === "generating")
    return `${count} Question${count !== 1 ? "s" : ""} · ${difficulty}`;
  if (dbNote.status === "failed") return `${count} Questions · ${difficulty} · Failed`;
  return `${count} Question${count !== 1 ? "s" : ""} · ${difficulty}`;
}

function getMindMapPreview(dbNote: any): string {
  if (dbNote.status === "generating") return "Mind Map";
  if (dbNote.status === "failed") return "Mind Map · Failed";
  return "Mind Map";
}

/** Subtitle segment for studio saved list (m:ss). */
function formatAudioDurationForListSubtitle(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function getAudioOverviewPreview(dbNote: any): string {
  if (dbNote.status === "generating") return "Audio Overview";
  if (dbNote.status === "failed") return "Audio Overview · Failed";

  const durRaw = dbNote.metadata?.durationSeconds;
  const dur = typeof durRaw === "number" && Number.isFinite(durRaw) ? durRaw : null;
  const durationPart =
    dur != null && dur >= 0 ? ` · ${formatAudioDurationForListSubtitle(dur)}` : "";

  return `Audio Overview${durationPart}`;
}

function getInfographicPreview(dbNote: any): string {
  if (dbNote.status === "generating") return "Infographic · Generating…";
  if (dbNote.status === "failed") return "Infographic · Failed";
  return "Infographic";
}

function getSpreadsheetPreview(dbNote: any): string {
  const spreadsheetType = dbNote.metadata?.spreadsheetType || "custom";
  const typeLabel = getSpreadsheetTypeLabel(spreadsheetType);
  if (dbNote.status === "generating") return `Spreadsheet · ${typeLabel}`;
  if (dbNote.status === "failed") return `Spreadsheet · ${typeLabel} · Failed`;
  return `Spreadsheet · ${typeLabel}`;
}

function getWrittenQuestionsPreview(dbNote: any): string {
  const count = arrayCount(dbNote.questionsData, dbNote._questionsCount);
  const difficulty = capitalizeDifficulty(dbNote.metadata?.difficulty);
  if (dbNote.status === "generating")
    return `${count} Question${count !== 1 ? "s" : ""} · ${difficulty}`;
  if (dbNote.status === "failed") return `${count} Questions · ${difficulty} · Failed`;
  return `${count} Question${count !== 1 ? "s" : ""} · ${difficulty}`;
}

function getNotePreview(dbNote: any): string {
  const isChat = dbNote.type === "chat";
  if (isChat) return "Note · Saved Chat";
  // Manual note
  return dbNote.content?.substring(0, 100) || "Empty note";
}

/**
 * Load all studio notes for a notebook using a SINGLE unified query.
 *
 * This replaces the previous approach that used 8 separate subscriptions.
 *
 * @param notebookId - The notebook ID to load notes for
 * @param types - Optional filter to load only specific note types
 * @returns Array of Note objects
 */
export function useNotes(notebookId: string | null, types?: string[]): Note[] {
  const notes = useQuery(
    api.notes.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks">, types } : "skip"
  );

  // Map raw database notes to frontend Note interfaces
  // No useMemo needed - useQuery already memoizes the result
  return notes?.map(mapDatabaseNoteToNote) ?? [];
}

/**
 * Get note counts by type for a notebook
 */
export function useNoteCounts(notebookId: string | null) {
  return useQuery(
    api.notes.index.count,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );
}

/**
 * Get a single note by type and ID (full payload).
 */
export function useNote(type: string, noteId: string | null) {
  const note = useQuery(api.notes.index.get, noteId && type ? { type, id: noteId as any } : "skip");
  return note ? mapDatabaseNoteToNote(note) : null;
}

/**
 * Load full studio note content when opening a saved item from the list.
 */
export function useNoteDetail(type: string | null, noteId: string | null) {
  const note = useQuery(api.notes.index.get, type && noteId ? { type, id: noteId as any } : "skip");
  return {
    note: note ? mapDatabaseNoteToNote(note) : null,
    isLoading: note === undefined && Boolean(type && noteId),
  };
}

/**
 * Check if any notes are currently loading
 */
export function useNotesLoading(notebookId: string | null): boolean {
  const notes = useQuery(
    api.notes.index.list,
    notebookId ? { notebookId: notebookId as Id<"notebooks"> } : "skip"
  );

  // Convex returns undefined while loading, null on error, and the data when ready
  return notes === undefined;
}

// For single-type lookups, import directly from the specific service file
// (e.g., import { useReports } from "./reportsApi").
