

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

export interface Note {
  id: string;
  title: string;
  preview: string;
  type: 'text' | 'report' | 'flashcard' | 'quiz' | 'audio' | 'mindmap';
  // Content
  content?: string;
  // Report-specific fields
  status?: 'generating' | 'mapping' | 'collapsing' | 'reducing' | 'completed' | 'failed';
  metadata?: {
    reportType?: string;
    documentIds?: string[];
    phase?: string;
    error?: string;
    chunksProcessed?: number;
    [key: string]: any;
  };
  // Flashcard-specific fields
  flashcards?: Flashcard[];
  // Quiz-specific fields
  questions?: QuizQuestion[];
  // Mind Map-specific fields
  mindMapData?: MindMapNodeData;
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