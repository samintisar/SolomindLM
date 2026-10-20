import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { type ChatInvokeInput, runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "wiring/chat-settings",
  runner: "chat",
  question: "How is the passé composé formed with avoir?",
  notebookId: "nb",
  expectedItems: [],
  expectedAnswer: "Subject-less avoir plus the past participle.",
  expectedBehavior: "Answers in French.",
  tags: [],
};

function recording(seen: ChatInvokeInput[]) {
  return {
    invoke: async (context: ChatInvokeInput) => {
      seen.push(context);
      return {
        answer: "a",
        citations: [],
        subQueries: [],
        preRerankChunks: [],
        postRerankChunks: [],
        selectedChunks: [],
        latencyMs: 1,
      };
    },
  };
}

describe("runChatEval production settings", () => {
  it("passes the smart model and output language to the agent options", async () => {
    const seen: ChatInvokeInput[] = [];
    await runChatEval(
      {
        fixture: {
          ...fixture,
          chat: { smartModel: "zai-org/GLM-5.3-Flash", outputLanguage: "fr" },
        },
        config: snapshotRetrievalConfig(),
      },
      recording(seen)
    );
    expect(seen[0]?.chatOptions).toEqual({
      smartModel: "zai-org/GLM-5.3-Flash",
      outputLanguage: "fr",
    });
  });

  it("sends notebook instructions as custom mode, as the notebook settings do in production", async () => {
    const seen: ChatInvokeInput[] = [];
    await runChatEval(
      {
        fixture: { ...fixture, chat: { instructions: "Answer as a French tutor." } },
        config: snapshotRetrievalConfig(),
      },
      recording(seen)
    );
    expect(seen[0]?.chatSettings).toEqual({
      instructionMode: "custom",
      customInstructions: "Answer as a French tutor.",
      responseLength: "default",
    });
  });

  it("leaves production defaults when no chat settings are given", async () => {
    const seen: ChatInvokeInput[] = [];
    await runChatEval({ fixture, config: snapshotRetrievalConfig() }, recording(seen));
    expect(seen[0]?.chatOptions).toEqual({ smartModel: undefined, outputLanguage: undefined });
    expect(seen[0]?.chatSettings).toEqual({
      instructionMode: "default",
      responseLength: "default",
    });
  });

  it("refuses notebook instructions combined with learning guide mode", async () => {
    const { errors } = await runChatEval(
      {
        fixture: {
          ...fixture,
          chatSettings: { instructionMode: "learningGuide" },
          chat: { instructions: "Be brief." },
        },
        config: snapshotRetrievalConfig(),
      },
      recording([])
    );
    expect(errors.join(" ")).toContain("learningGuide");
  });

  it("refuses an unlisted smart model before any run", async () => {
    const { errors } = await runChatEval(
      {
        fixture: { ...fixture, chat: { smartModel: "not/a-model" } },
        config: snapshotRetrievalConfig(),
      },
      recording([])
    );
    expect(errors.join(" ")).toContain("not/a-model");
  });

  it("refuses an unsupported output language before any run", async () => {
    const { errors } = await runChatEval(
      {
        fixture: { ...fixture, chat: { outputLanguage: "xx" } },
        config: snapshotRetrievalConfig(),
      },
      recording([])
    );
    expect(errors.join(" ")).toContain("xx");
  });
});
