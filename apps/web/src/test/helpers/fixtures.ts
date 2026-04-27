import type { Message, ReferenceChunk, Source, Note } from "@/shared/types/index";

export function createMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content: "Test message",
    timestamp: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  };
}

export function createMockReferenceChunk(
  overrides: Partial<ReferenceChunk> = {}
): ReferenceChunk {
  return {
    id: 1,
    sourceId: "src-1",
    sourceTitle: "Test Source",
    content: "Test chunk content",
    chunkIndex: 0,
    similarity: 0.9,
    ...overrides,
  };
}

export function createMockSource(overrides: Partial<Source> = {}): Source {
  return {
    id: `doc-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Document",
    type: "PDF",
    date: "2024-01-15",
    selected: false,
    ...overrides,
  };
}

export function createMockNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test Note",
    type: "report",
    status: "completed",
    content: "Test content",
    preview: "Test preview",
    metadata: { savedAt: new Date().toISOString() },
    ...overrides,
  } as Note;
}
