import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock convex/react
const mockUseQuery = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
}));

// Mock the Convex API — use a deep proxy so api.notes.index.list resolves to a string path
function deepProxy(): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === Symbol.toPrimitive) return () => "api";
        return deepProxy();
      },
    }
  );
}

vi.mock("@convex/_generated/api", () => ({
  api: deepProxy(),
  internal: deepProxy(),
  components: deepProxy(),
}));

// Import after mock setup
const { useNotes } = await import("../services/notesApi");

describe("useNotes (Convex-mocked integration)", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty array when query is loading (undefined)", () => {
    mockUseQuery.mockReturnValue(undefined);
    const { result } = renderHook(() => useNotes("notebook-1"));
    expect(result.current).toEqual([]);
  });

  it("returns mapped notes from query result", () => {
    const dbNotes = [
      {
        _id: "r1",
        _type: "report",
        title: "My Report",
        status: "completed",
        content: "Report content",
        metadata: {},
      },
      {
        _id: "f1",
        _type: "flashcard",
        title: "My Cards",
        status: "completed",
        cardsData: [{ question: "Q1", answer: "A1" }],
        metadata: {},
      },
    ];
    mockUseQuery.mockReturnValue(dbNotes);

    const { result } = renderHook(() => useNotes("notebook-1"));

    expect(result.current).toHaveLength(2);
    expect(result.current[0].type).toBe("report");
    expect(result.current[0].title).toBe("My Report");
    expect(result.current[1].type).toBe("flashcard");
    expect(result.current[1].title).toBe("My Cards");
  });

  it("passes notebookId and types to query", () => {
    mockUseQuery.mockReturnValue([]);

    renderHook(() => useNotes("notebook-1", ["report", "flashcard"]));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), {
      notebookId: "notebook-1",
      types: ["report", "flashcard"],
    });
  });

  it("skips query when notebookId is null", () => {
    mockUseQuery.mockReturnValue(undefined);

    renderHook(() => useNotes(null));

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), "skip");
  });

  it("handles mixed note types correctly", () => {
    const dbNotes = [
      {
        _id: "q1",
        _type: "quiz",
        title: "Quiz",
        status: "completed",
        questionsData: [],
        metadata: {},
      },
      {
        _id: "m1",
        _type: "mindmap",
        title: "Map",
        status: "completed",
        data: { topic: "Root", id: "r", children: [] },
        metadata: {},
      },
      {
        _id: "i1",
        _type: "infographic",
        title: "Infographic",
        status: "completed",
        data: { imageUrl: "https://example.com/img.png" },
        metadata: {},
      },
    ];
    mockUseQuery.mockReturnValue(dbNotes);

    const { result } = renderHook(() => useNotes("notebook-1"));

    expect(result.current).toHaveLength(3);
    expect(result.current[0].type).toBe("quiz");
    expect(result.current[1].type).toBe("mindmap");
    expect(result.current[2].type).toBe("infographic");
  });
});

describe("mapDatabaseNoteToNote — round-trip via useNotes", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("maps all 10 note types without error", () => {
    const dbNotes = [
      { _id: "1", _type: "report", title: "R", status: "completed", content: "", metadata: {} },
      {
        _id: "2",
        _type: "flashcard",
        title: "F",
        status: "completed",
        cardsData: [],
        metadata: {},
      },
      { _id: "3", _type: "quiz", title: "Q", status: "completed", questionsData: [], metadata: {} },
      {
        _id: "4",
        _type: "mindmap",
        title: "M",
        status: "completed",
        data: { topic: "Root", id: "r", children: [] },
        metadata: {},
      },
      { _id: "5", _type: "audioOverview", title: "A", status: "completed", metadata: {} },
      {
        _id: "6",
        _type: "infographic",
        title: "I",
        status: "completed",
        data: { imageUrl: "https://example.com/img.png" },
        metadata: {},
      },
      { _id: "7", _type: "spreadsheet", title: "X", status: "completed", data: "", metadata: {} },
      {
        _id: "8",
        _type: "writtenQuestions",
        title: "W",
        status: "completed",
        questionsData: [],
        metadata: {},
      },
      {
        _id: "9",
        _type: "note",
        title: "N",
        status: "completed",
        content: "text",
        createdAt: "2024-01-15T10:00:00Z",
        metadata: {},
      },
      {
        _id: "10",
        _type: "report",
        title: "R2",
        status: "completed",
        content: "",
        reportType: "study_guide",
        metadata: {},
      },
    ];
    mockUseQuery.mockReturnValue(dbNotes);

    const { result } = renderHook(() => useNotes("nb"));

    expect(result.current).toHaveLength(10);
    const types = result.current.map((n) => n.type);
    expect(types).toEqual([
      "report",
      "flashcard",
      "quiz",
      "mindmap",
      "audioOverview",
      "infographic",
      "spreadsheet",
      "writtenQuestions",
      "note",
      "report",
    ]);
  });
});
