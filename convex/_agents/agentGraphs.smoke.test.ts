"use node";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AudioOverviewGraph } from "./audio_overview/AudioOverviewGraph";
import { FlashcardGraph } from "./flashcard/FlashcardGraph";
import { MindMapGraph } from "./mindmap/MindMapGraph";
import { QuizGraph } from "./quiz/QuizGraph";
import { ReportGraph } from "./report/ReportGraph";
import { SpreadsheetGraph } from "./spreadsheet/SpreadsheetGraph";
import { WrittenQuestionsGraph } from "./written_questions/WrittenQuestionsGraph";

vi.mock("@langchain/community/chat_models/togetherai", () => ({
  ChatTogetherAI: vi.fn().mockImplementation(function (this: unknown, config: unknown) {
    return {
      ...(typeof config === "object" && config !== null ? config : {}),
      withStructuredOutput: () => ({
        invoke: vi.fn().mockResolvedValue({}),
      }),
    };
  }),
}));

const DUMMY_KEY = "test-api-key";
const MAP_MODEL = "openai/gpt-oss-20b";
const REDUCE_MODEL = "openai/gpt-oss-120b";

type GraphFactory = {
  name: string;
  create: () => { buildGraph: () => unknown };
};

const graphs: GraphFactory[] = [
  {
    name: "FlashcardGraph",
    create: () => new FlashcardGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "ReportGraph",
    create: () => new ReportGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "QuizGraph",
    create: () => new QuizGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "MindMapGraph",
    create: () => new MindMapGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "SpreadsheetGraph",
    create: () => new SpreadsheetGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "WrittenQuestionsGraph",
    create: () => new WrittenQuestionsGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
  {
    name: "AudioOverviewGraph",
    create: () => new AudioOverviewGraph(DUMMY_KEY, MAP_MODEL, REDUCE_MODEL),
  },
];

describe("LangGraph agent wiring smoke tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(graphs)("$name.buildGraph compiles without throwing", ({ create }) => {
    const graph = create().buildGraph();
    expect(graph).toBeDefined();
    expect(typeof graph).toBe("object");
  });
});
