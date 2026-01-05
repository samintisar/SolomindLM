

export interface Source {
  id: string;
  title: string;
  type: 'PDF' | 'TXT' | 'WEB';
  date: string;
  selected: boolean;
  content?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ReferenceChunk {
  id: number;
  sourceId: string;
  sourceTitle: string;
  content: string;
  chunkIndex: number;
  similarity?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: number[];
  references?: ReferenceChunk[];
  timestamp: Date;
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
  questionType: 'short' | 'essay';
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
  front: string;
  back: string;
}

export interface MindMapNode {
  id: string;
  topic: string;
  children?: MindMapNode[];
}

export interface MindMapNodeData {
  nodeData: MindMapNode;
}

// Base interface with shared properties for all note types
interface BaseNote {
  id: string;
  title: string;
  preview: string;
  status?: 'draft' | 'generating' | 'completed' | 'failed';
}

// Text note - simple content
export interface TextNote extends BaseNote {
  type: 'text';
  content: string;
}

// Report note - document-based report with processing phases
export interface ReportNote extends BaseNote {
  type: 'report';
  content: string;
  metadata: {
    reportType: string;
    documentIds: string[];
    phase?: string; // For internal intermediate statuses: mapping, collapsing, reducing, synthesizing, etc.
    error?: string;
    chunksProcessed?: number;
  };
}

// Flashcard note - study cards
export interface FlashcardNote extends BaseNote {
  type: 'flashcard';
  flashcards: Flashcard[];
  metadata: {
    difficulty: string;
    cardCount: number;
    topic?: string;
    error?: string;
  };
}

// Quiz note - multiple choice questions
export interface QuizNote extends BaseNote {
  type: 'quiz';
  questions: QuizQuestion[];
  userAnswers?: Record<number, number>; // question index -> selected option
  metadata: {
    questionCount: number;
    difficulty: string;
    focusArea?: string;
    error?: string;
  };
}

// Audio note - audio overview with transcript
export interface AudioNote extends BaseNote {
  type: 'audio';
  content: string; // transcript
  metadata: {
    audioUrl: string;
    audioType: string;
    audioOverviewId: string;
    duration?: number;
    phase?: string;
    error?: string;
  };
}

// Mind map note - hierarchical knowledge graph
export interface MindMapNote extends BaseNote {
  type: 'mindmap';
  mindMapData: MindMapNodeData;
  content: string; // JSON string representation
  metadata?: {
    phase?: string;
    error?: string;
    [key: string]: any;
  };
}

// Written questions note - open-ended questions with LLM grading
export interface WrittenQuestionsNote extends BaseNote {
  type: 'writtenQuestions';
  questions: WrittenQuestion[];
  userAnswers?: Record<string, WrittenQuestionAnswer>;
  metadata: {
    questionCount: number;
    difficulty: 'easy' | 'medium' | 'hard';
    questionType: 'short' | 'essay' | 'mixed';
    focusArea?: string;
    totalPoints?: number;
    error?: string;
  };
}

// Discriminated union - the main Note type
export type Note = TextNote | ReportNote | FlashcardNote | QuizNote | AudioNote | MindMapNote | WrittenQuestionsNote;

// Type guard functions for checking note types at runtime
export function isTextNote(note: Note): note is TextNote {
  return note.type === 'text';
}

export function isReportNote(note: Note): note is ReportNote {
  return note.type === 'report';
}

export function isFlashcardNote(note: Note): note is FlashcardNote {
  return note.type === 'flashcard';
}

export function isQuizNote(note: Note): note is QuizNote {
  return note.type === 'quiz';
}

export function isAudioNote(note: Note): note is AudioNote {
  return note.type === 'audio';
}

export function isMindMapNote(note: Note): note is MindMapNote {
  return note.type === 'mindmap';
}

export function isWrittenQuestionsNote(note: Note): note is WrittenQuestionsNote {
  return note.type === 'writtenQuestions';
}

export interface NotebookItem {
  id: string;
  title: string;
  date: string;
  sourceCount: number;
  author?: string;
  coverColor?: string; // e.g. 'bg-amber-200'
  icon?: string;
  isFeatured?: boolean;
  folderId?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  description?: string;
  color?: string; // e.g. 'bg-blue-500'
  icon?: string;
  notebookCount: number;
  created_at: string;
  updated_at: string;
}

// Union type for rendering mixed lists
export type NotebookOrFolder = NotebookItem | FolderItem;

// Type guard
export function isFolder(item: NotebookOrFolder): item is FolderItem {
  return 'notebookCount' in item;
}

export interface Document {
  id: string;
  user_id: string;
  note_id: string;
  title?: string;
  file_name: string;
  file_type: 'file' | 'url' | 'youtube';
  file_url?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UploadResponse {
  message: string;
  documentId: string;
  status: string;
}

/**
 * Discovered web source from search API
 */
export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

/**
 * Response from source discovery API
 */
export interface DiscoveryResponse {
  query: string;
  count: number;
  sources: DiscoveredSource[];
}

/**
 * Request options for source discovery
 */
export interface DiscoveryRequest {
  query: string;
  scoreThreshold?: number;
  excludeDomains?: string[];
  maxResults?: number;
}