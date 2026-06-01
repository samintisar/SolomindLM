import { describe, expect, it } from "vitest";
import { mapDatabaseNoteToNote } from "./notesApi";

const baseNote = {
  _id: "note123",
  title: "Test Note",
  status: "completed",
  metadata: {},
};

describe("mapDatabaseNoteToNote", () => {
  it("maps report type", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "report",
      content: "Report content here",
      reportType: "study_guide",
    });
    expect(result.type).toBe("report");
    expect(result.id).toBe("note123");
    expect(result.title).toBe("Test Note");
    expect((result as { content: string }).content).toBe("Report content here");
    expect((result as { metadata: { reportType: string } }).metadata.reportType).toBe(
      "study_guide"
    );
    expect(result.preview).toBeTruthy();
  });

  it("maps flashcard type", () => {
    const cards = [
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ];
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "flashcard",
      cardsData: cards,
    });
    expect(result.type).toBe("flashcard");
    if (result.type === "flashcard") {
      expect(result.flashcards).toEqual(cards);
      expect(result.metadata.cardCount).toBe(2);
      expect(result.metadata.difficulty).toBe("medium");
    }
  });

  it("maps quiz type", () => {
    const questions = [{ question: "Q1", options: ["A", "B"], correctIndex: 0 }];
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "quiz",
      questionsData: questions,
    });
    expect(result.type).toBe("quiz");
    if (result.type === "quiz") {
      expect(result.questions).toEqual(questions);
      expect(result.metadata.questionCount).toBe(1);
    }
  });

  it("maps mindmap type with normalization", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "mindmap",
      data: { topic: "My Map", id: "root", children: [] },
    });
    expect(result.type).toBe("mindmap");
    if (result.type === "mindmap") {
      expect(result.mindMapData.nodeData.topic).toBe("My Map");
    }
  });

  it("maps mindmap with fallback title when topic missing", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "mindmap",
      data: { children: [] },
    });
    if (result.type === "mindmap") {
      expect(result.mindMapData.nodeData.topic).toBe("Test Note");
    }
  });

  it("maps audioOverview type", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "audioOverview",
      audioUrl: "https://audio.example.com/file.mp3",
      transcript: "Hello world",
    });
    expect(result.type).toBe("audioOverview");
    if (result.type === "audioOverview") {
      expect(result.audioUrl).toBe("https://audio.example.com/file.mp3");
      expect(result.transcript).toBe("Hello world");
      expect(result.preview).toBe("Audio Overview");
    }
  });

  it("maps audioOverview preview with duration from metadata", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "audioOverview",
      audioUrl: "https://audio.example.com/file.wav",
      transcript: "Hi",
      metadata: { durationSeconds: 125.4 },
    });
    expect(result.preview).toBe("Audio Overview · 2:05");
  });

  it("maps infographic type", () => {
    const infographicData = {
      imageUrl: "https://example.com/image.png",
      title: "Test Infographic",
      prompt: "Test prompt",
      metadata: { sourceDocumentIds: ["doc1"] },
    };
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "infographic",
      data: infographicData,
    });
    expect(result.type).toBe("infographic");
    if (result.type === "infographic") {
      expect(result.imageUrl).toBe("https://example.com/image.png");
      expect(result.title).toBe("Test Note");
    }
  });

  it("maps spreadsheet type with string data", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "spreadsheet",
      data: "a,b,c\n1,2,3",
    });
    expect(result.type).toBe("spreadsheet");
    if (result.type === "spreadsheet") {
      expect(result.content).toBe("a,b,c\n1,2,3");
    }
  });

  it("maps spreadsheet type with object data", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "spreadsheet",
      data: { content: "a,b\n1,2" },
    });
    if (result.type === "spreadsheet") {
      expect(result.content).toBe("a,b\n1,2");
    }
  });

  it("maps writtenQuestions type", () => {
    const questions = [{ question: "Explain X", modelAnswer: "X is..." }];
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "writtenQuestions",
      questionsData: questions,
      questionType: "essay",
    });
    expect(result.type).toBe("writtenQuestions");
    if (result.type === "writtenQuestions") {
      expect(result.questions).toEqual(questions);
      expect(result.metadata.questionCount).toBe(1);
      expect(result.metadata.questionType).toBe("essay");
    }
  });

  it("maps note type (user note)", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "note",
      type: "chat",
      content: "Saved chat content",
      createdAt: "2024-01-15T10:00:00Z",
    });
    expect(result.type).toBe("note");
    if (result.type === "note") {
      expect(result.noteType).toBe("chat");
      expect(result.content).toBe("Saved chat content");
    }
  });

  it("throws for unknown _type", () => {
    expect(() => mapDatabaseNoteToNote({ ...baseNote, _type: "unknownType" })).toThrow(
      "Unknown note type: unknownType"
    );
  });

  it("defaults reportType to custom when missing", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "report",
      content: "",
    });
    if (result.type === "report") {
      expect(result.metadata.reportType).toBe("custom");
    }
  });

  it("defaults difficulty to medium for flashcard", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "flashcard",
      cardsData: [],
    });
    if (result.type === "flashcard") {
      expect(result.metadata.difficulty).toBe("medium");
    }
  });

  it("handles missing cardsData gracefully", () => {
    const result = mapDatabaseNoteToNote({
      ...baseNote,
      _type: "flashcard",
    });
    if (result.type === "flashcard") {
      expect(result.flashcards).toEqual([]);
      expect(result.metadata.cardCount).toBe(0);
    }
  });
});
