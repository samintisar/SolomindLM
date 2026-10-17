import { describe, expect, it } from "vitest";
import { evalChatSettings, evalConversationHistory } from "./chatEvalAction";

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
});
