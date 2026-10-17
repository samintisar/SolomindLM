import { describe, expect, it } from "vitest";
import {
  evalChatSettings,
  evalConversationHistory,
  evalOutputLanguage,
  evalSmartModel,
} from "./chatEvalAction";

describe("evalConversationHistory", () => {
  it("appends the question as the final user turn after the prior turns", () => {
    const history = evalConversationHistory(
      "Give me two more examples of that.",
      [
        { role: "user", content: "Which verbs take être?" },
        { role: "assistant", content: "Verbs of coming and going, such as aller." },
      ],
      4000
    );
    expect(history).toEqual([
      { role: "user", content: "Which verbs take être?" },
      { role: "assistant", content: "Verbs of coming and going, such as aller." },
      { role: "user", content: "Give me two more examples of that." },
    ]);
  });

  it("is only the question when there is no prior conversation", () => {
    expect(evalConversationHistory("Hello?", undefined, 4000)).toEqual([
      { role: "user", content: "Hello?" },
    ]);
  });

  it("trims to the token budget, keeping the most recent turns and the question", () => {
    const long = "x".repeat(4000);
    const history = evalConversationHistory(
      "final question",
      [
        { role: "user", content: long },
        { role: "assistant", content: "recent answer" },
      ],
      50
    );
    expect(history.at(-1)).toEqual({ role: "user", content: "final question" });
    expect(history.some((turn) => turn.content === long)).toBe(false);
  });
});

describe("evalChatSettings", () => {
  it("defaults to default mode with default response length, as production does", () => {
    expect(evalChatSettings(undefined)).toEqual({
      instructionMode: "default",
      responseLength: "default",
    });
  });

  it("passes learning guide mode through", () => {
    expect(evalChatSettings("learningGuide")).toEqual({
      instructionMode: "learningGuide",
      responseLength: "default",
    });
  });

  it("uses custom mode with the notebook instructions when they are given", () => {
    expect(evalChatSettings(undefined, "  Answer as a tutor.  ")).toEqual({
      instructionMode: "custom",
      customInstructions: "Answer as a tutor.",
      responseLength: "default",
    });
  });

  it("refuses notebook instructions combined with learning guide mode", () => {
    expect(() => evalChatSettings("learningGuide", "Be brief.")).toThrow(/learningGuide/);
  });
});

describe("evalSmartModel", () => {
  it("is undefined when no model is asked for (production default)", () => {
    expect(evalSmartModel(undefined)).toBeUndefined();
  });

  it("accepts a listed model id", () => {
    expect(evalSmartModel("zai-org/GLM-5.3-Flash")).toBe("zai-org/GLM-5.3-Flash");
  });

  it("refuses an unknown or retired model rather than silently using the default", () => {
    expect(() => evalSmartModel("not/a-model")).toThrow(/not\/a-model/);
    expect(() => evalSmartModel("zai-org/GLM-5.2")).toThrow(/zai-org\/GLM-5.2/);
  });
});

describe("evalOutputLanguage", () => {
  it("passes a supported code through and is undefined when unset", () => {
    expect(evalOutputLanguage("fr")).toBe("fr");
    expect(evalOutputLanguage(undefined)).toBeUndefined();
  });

  it("refuses an unsupported code, since the prompt would ignore it", () => {
    expect(() => evalOutputLanguage("xx")).toThrow(/xx/);
  });
});
