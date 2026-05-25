export interface SourceGuide {
  summary: string;
  topics: string[];
  generatedAt: number;
}

export interface Source {
  id: string;
  title: string;
  type:
    | "PDF"
    | "TXT"
    | "WEB"
    | "DOCX"
    | "PPTX"
    | "IMG"
    | "DOC"
    | "PPT"
    | "XLSX"
    | "XLS"
    | "MD"
    | "JSON"
    | "CSV"
    | "PAPER";
  date: string;
  selected: boolean;
  content?: string;
  status?: "pending" | "processing" | "completed" | "failed";
  /** Original URL for WEB sources (url or youtube); used to open in new tab */
  url?: string;
  /** Kebab Refresh: web page (`url` type, not YouTube) or Google Drive–backed file */
  remoteRefreshKind?: "url" | "drive";
  /** Set for `paper_record` documents (discovery / OpenAlex) */
  paper?: {
    doi?: string;
    openAlexId?: string;
    fulltextStatus?: "available" | "unavailable" | "external_only";
    ingestionStatus?: "pending" | "ingested" | "metadata_only" | "failed";
  };
  /** AI-generated summary and topics for the source (NotebookLM-style) */
  sourceGuide?: SourceGuide;
}

export interface ReferenceChunk {
  id: number;
  sourceId: string;
  /** Same for all chunks from one notebook document — activity panel groups on this when set */
  documentId?: string;
  sourceTitle: string;
  /** Original source URL when the document is url/youtube — avoids opening homepage when title is hostname-only */
  sourceUrl?: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
}

export interface MessageToolCall {
  tool: string;
  query: string;
  status: "searching" | "done";
  resultCount?: number;
}

/** Grounding / confidence signal streamed after the main answer chunks */
export interface AgentGroundingCheck {
  passed: boolean;
  issues: string[];
  message: string;
  /** Async grounding path (__GROUNDING_WARN) — render as a subtle footnote, not a blocking alert */
  soft?: boolean;
}

/** Persisted on assistant messages (metadata.agentTrace) for history replay */
export interface ChatAgentTrace {
  toolCalls: MessageToolCall[];
  grounding: AgentGroundingCheck[];
  phases: Array<{ status: string; message: string }>;
  clarification?: string;
}

export type ChatActivityPhase =
  | "searching"
  | "reading"
  | "planning"
  | "thinking"
  | "generating"
  | "writing"
  | "retrieving"
  | "embedding"
  | "ranking"
  | "completed";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: number[];
  references?: ReferenceChunk[];
  timestamp: Date;
  status?: ChatActivityPhase;
  /** Server detail for the current phase (e.g. "Reading 12 passages...") */
  statusDetail?: string;
  feedback?: "up" | "down";
  followUps?: string[];
  toolCalls?: MessageToolCall[];
  groundingChecks?: AgentGroundingCheck[];
  clarificationQuestion?: string;
  /** Saved assistant turn: full trace from backend */
  agentTrace?: ChatAgentTrace;
  /** Deep research plan metadata for plan-approval messages */
  researchPlan?: { planId: string; subQuestions: unknown[]; sourcePolicy: unknown };
  /** Completed deep research answer linked to a research run */
  deepResearch?: { researchRunId: string };
  /** Literature review metadata for persisted review messages */
  literatureReview?: {
    sessionId: string;
    status: string;
    query: string;
    tableId?: string;
    reportId?: string;
    suggestedColumns?: Array<{
      id: string;
      name: string;
      instructions?: string;
      isVisible: boolean;
    }>;
    error?: string;
  };
  /** External sources discovered during chat (web, academic, news, finance) */
  externalSources?: Array<{
    title: string;
    url: string;
    snippet: string;
    sourceType: string;
    score?: number;
  }>;
}

export interface StudioTool {
  id: string;
  label: string;
  iconName: string; // Storing icon name as string to map in component
  color?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number; // index of correct option
  hint: string; // always required
  explanation: string; // always required
}

export interface WrittenQuestion {
  id: string;
  question: string;
  questionType: "short" | "essay";
  rubric: {
    maxPoints: number;
    criteria: string[];
  };
  modelAnswer?: string;
}

export interface WrittenQuestionAnswer {
  answer: string;
  graded: boolean;
  score?: number;
  maxScore?: number;
  feedback?: string;
  strengths?: string[];
  improvements?: string[];
  gradedAt?: string;
}

export interface Flashcard {
  type: "wh-question" | "fill-blank" | "true-false" | "definition" | "scenario";
  front: string;
  back: string;
  topic?: string;
  proficiency?: {
    nextReviewDate?: number;
    interval: number;
    easeFactor: number;
    streak: number;
    totalReviews: number;
    correctCount: number;
    incorrectCount: number;
    lastReviewedAt?: number;
    phase?: "learning" | "review" | "relearning";
    learningStep?: number;
  };
}

export interface MindMapNode {
  id: string;
  topic: string;
  children?: MindMapNode[];
}

export interface MindMapNodeData {
  nodeData: MindMapNode;
}

// Infographic - single AI-generated image
export interface Infographic {
  imageUrl: string;
  title: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

/** Convex studio jobs persist these on artifact `metadata` while status is `generating`. */
export interface StudioGenerationMetadata {
  phase?: string;
  progress?: number;
  currentStep?: string;
  totalMapTasks?: number;
  completedMapTasks?: number;
}

// Base interface with shared properties for all note types
interface BaseNote {
  id: string;
  title: string;
  preview: string;
  status?: "draft" | "generating" | "completed" | "failed";
}

// Text note - simple content
export interface TextNote extends BaseNote {
  type: "text";
  content: string;
}

// Report note - document-based report with processing phases
export interface ReportNote extends BaseNote {
  type: "report";
  content: string;
  metadata: {
    reportType: string;
    documentIds: string[];
    error?: string;
    chunksProcessed?: number;
  } & StudioGenerationMetadata;
}

// Flashcard note - study cards
export interface FlashcardNote extends BaseNote {
  type: "flashcard";
  flashcards: Flashcard[];
  metadata: {
    difficulty: string;
    cardCount: number;
    topic?: string;
    error?: string;
    lastViewedIndex?: number;
    studyMode?: "browse" | "study";
    showMastered?: boolean;
    masteredThreshold?: number;
  } & StudioGenerationMetadata;
}

// Quiz note - multiple choice questions
export interface QuizNote extends BaseNote {
  type: "quiz";
  questions: QuizQuestion[];
  userAnswers?: Record<number, number>; // question index -> selected option
  metadata: {
    questionCount: number;
    difficulty: string;
    focusArea?: string;
    error?: string;
    lastViewedIndex?: number;
  } & StudioGenerationMetadata;
}

// Audio note - audio overview with transcript
export interface AudioNote extends BaseNote {
  type: "audio";
  content: string; // transcript
  metadata: {
    audioUrl: string;
    audioType: string;
    audioOverviewId: string;
    duration?: number;
    error?: string;
  } & StudioGenerationMetadata;
}

// Audio overview note - studio audio overview (id, title, transcript, audioUrl)
export interface AudioOverviewNote {
  id: string;
  title: string;
  preview: string;
  type: "audioOverview";
  audioUrl: string;
  transcript: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

// Mind map note - hierarchical knowledge graph
export interface MindMapNote extends BaseNote {
  type: "mindmap";
  mindMapData: MindMapNodeData;
  content: string; // JSON string representation
  metadata?: { error?: string } & StudioGenerationMetadata & Record<string, unknown>;
}

// Written questions note - open-ended questions with LLM grading
export interface WrittenQuestionsNote extends BaseNote {
  type: "writtenQuestions";
  questions: WrittenQuestion[];
  userAnswers?: Record<string, WrittenQuestionAnswer>;
  metadata: {
    questionCount: number;
    difficulty: "easy" | "medium" | "hard";
    questionType: "short" | "essay";
    focusArea?: string;
    totalPoints?: number;
    error?: string;
    lastViewedIndex?: number;
  } & StudioGenerationMetadata;
}

// Infographic note - single AI-generated infographic image
export interface InfographicNote extends BaseNote {
  type: "infographic";
  imageUrl?: string;
  title: string;
  prompt?: string;
  metadata: {
    sourceDocumentIds: string[];
    generatedAt?: number;
    customPrompt?: string;
    orientation?: "landscape" | "portrait" | "square";
    visualStyle?: string;
    detailLevel?: "concise" | "standard" | "detailed";
    error?: string;
  } & StudioGenerationMetadata;
}

// Spreadsheet note - structured table data
export interface SpreadsheetNote extends BaseNote {
  type: "spreadsheet";
  content: string; // Markdown table content
  metadata: {
    spreadsheetType:
      | "data_extraction"
      | "comparison_table"
      | "timeline"
      | "financial_summary"
      | "custom";
    documentIds: string[];
    error?: string;
    customPrompt?: string;
  } & StudioGenerationMetadata;
}

// User note - saved chat conversations or manual notes
export interface UserNote extends BaseNote {
  type: "note";
  noteType: "chat" | "manual"; // Distinguish between saved chats and manual notes
  content?: string; // For manual notes (markdown content)
  messages?: Message[]; // For saved chats (conversation snapshot)
  metadata: {
    messageCount?: number; // For saved chats
    conversationId?: string; // For saved chats - link to original conversation
    savedAt: string;
    [key: string]: unknown;
  };
}

// Discriminated union - the main Note type
export type Note =
  | TextNote
  | ReportNote
  | FlashcardNote
  | QuizNote
  | AudioNote
  | AudioOverviewNote
  | MindMapNote
  | WrittenQuestionsNote
  | InfographicNote
  | SpreadsheetNote
  | UserNote;

// Type guard functions for checking note types at runtime
export function isTextNote(note: Note): note is TextNote {
  return note.type === "text";
}

export function isReportNote(note: Note): note is ReportNote {
  return note.type === "report";
}

export function isFlashcardNote(note: Note): note is FlashcardNote {
  return note.type === "flashcard";
}

export function isQuizNote(note: Note): note is QuizNote {
  return note.type === "quiz";
}

export function isAudioNote(note: Note): note is AudioNote {
  return note.type === "audio";
}

export function isAudioOverviewNote(note: Note): note is AudioOverviewNote {
  return note.type === "audioOverview";
}

export function isMindMapNote(note: Note): note is MindMapNote {
  return note.type === "mindmap";
}

export function isWrittenQuestionsNote(note: Note): note is WrittenQuestionsNote {
  return note.type === "writtenQuestions";
}

export function isInfographicNote(note: Note): note is InfographicNote {
  return note.type === "infographic";
}

export function isSpreadsheetNote(note: Note): note is SpreadsheetNote {
  return note.type === "spreadsheet";
}

export function isUserNote(note: Note): note is UserNote {
  return note.type === "note";
}

export type ChatSettings = {
  instructionMode: "default" | "learningGuide" | "custom";
  customInstructions?: string;
  responseLength: "default" | "longer" | "shorter";
  smartModel?: string;
};

export interface NotebookItem {
  id: string;
  title: string;
  date: string;
  sourceCount: number;
  author?: string;
  coverColor?: string; // e.g. 'bg-amber-200'
  icon?: string;
  isFeatured?: boolean;
  /** True when this notebook is owned by someone else and you are an editor via share link */
  isSharedNotebook?: boolean;
  folderId?: string;
  created_at?: string | number;
  updated_at?: string | number;
  chatSettings?: ChatSettings;
}

export interface FolderItem {
  id: string;
  name: string;
  description?: string;
  color?: string; // e.g. 'bg-blue-500'
  icon?: string;
  notebookCount: number;
  created_at: string | number;
  updated_at: string | number;
}

// Union type for rendering mixed lists
export type NotebookOrFolder = NotebookItem | FolderItem;

// Type guard
export function isFolder(item: NotebookOrFolder): item is FolderItem {
  return "notebookCount" in item;
}

export interface Document {
  id: string;
  user_id: string;
  note_id: string;
  title?: string;
  file_name: string;
  file_type: "file" | "url" | "youtube";
  file_url?: string;
  status: "pending" | "processing" | "completed" | "failed";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UploadResponse {
  message: string;
  documentId: string;
  status: string;
}

/** Payload for `documents.upload` with `type: "paper_record"` */
export interface PaperRecordInput {
  abstract: string;
  authors: string[];
  doi?: string;
  venue?: string;
  publicationYear?: number;
  openAlexId?: string;
  semanticScholarId?: string;
  isOa: boolean;
  pdfUrl?: string;
  landingPageUrl?: string;
  license?: string;
}

/**
 * Unified discovery result from multi-source search
 */
export interface UnifiedDiscoveryResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  sourceType: "web" | "news" | "academic" | "finance";
  publishedDate?: string;
  metadata: {
    // Academic-specific
    authors?: string[];
    venue?: string;
    citationCount?: number;
    openAccess?: boolean;
    hasFullText?: boolean;
    publicationYear?: number;
    type?: string;
    doi?: string;
    openAlexId?: string;
    pdfUrl?: string;
    landingPageUrl?: string;
    license?: string;

    // Web/News-specific
    domain?: string;
    relevanceLabel?: "high" | "medium" | "low";
  };
}

/**
 * Response from unified discovery API
 */
export interface DiscoveryResponse {
  sources: UnifiedDiscoveryResult[];
  totalCount: number;
  sourceTypeCounts: Record<string, number>;
}

/**
 * Request options for unified discovery
 */
export interface DiscoveryRequest {
  query: string;
  sourceTypes: ("web" | "news" | "academic" | "finance")[];
  timeRange?: "day" | "week" | "month" | "year";
  filters: {
    academic?: {
      publicationYear?: { from?: number; to?: number };
      minCitations?: number;
      openAccessOnly?: boolean;
      hasFullText?: boolean;
    };
  };
  maxResults: number;
  sortBy?: "relevance" | "date" | "citations";
}

/**
 * Features that have daily limits
 */
export type DailyFeature =
  | "chat"
  | "flashcard"
  | "quiz"
  | "report"
  | "audio"
  | "writtenQuestion"
  | "spreadsheet"
  | "infographic";

/**
 * Error codes for different types of limit errors
 */
export type ErrorCode = "NOTEBOOK_LIMIT_REACHED" | "SOURCE_LIMIT_REACHED" | "DAILY_LIMIT_REACHED";

/**
 * Types of limits that can be enforced
 */
export type LimitType = "notebook" | "source" | "daily";

/**
 * Structured error data that can be serialized through Convex
 */
export interface LimitErrorData {
  code: ErrorCode;
  limit: number;
  current: number;
  limitType: LimitType;
  feature?: DailyFeature;
  isPro?: boolean;
}
