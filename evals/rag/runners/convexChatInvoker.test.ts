import { describe, expect, it } from "vitest";
import type { ChatAgentContext } from "../../../convex/_agents/chat/types";
import { chatEvalArgsFor } from "./convexChatInvoker";

function context(partial: Partial<ChatAgentContext>): ChatAgentContext {
  return {
    userId: "__eval_unused__",
    noteId: "nb-1",
    conversationHistory: [{ role: "user", content: "Give me two more examples of that." }],
    ...partial,
  };
}

describe("chatEvalArgsFor", () => {
  it("sends the final user message as the question and the earlier turns as history", () => {
    const args = chatEvalArgsFor(
      context({
        conversationHistory: [
          { role: "user", content: "Which verbs take être?" },
          { role: "assistant", content: "Verbs of coming and going." },
          { role: "user", content: "Give me two more examples of that." },
        ],
      }),
      "secret"
    );
    expect(args.question).toBe("Give me two more examples of that.");
    expect(args.conversationHistory).toEqual([
      { role: "user", content: "Which verbs take être?" },
      { role: "assistant", content: "Verbs of coming and going." },
    ]);
    expect(args.evalSecret).toBe("secret");
  });

  it("sends no prior history for a single-turn question", () => {
    expect(chatEvalArgsFor(context({}), "s").conversationHistory).toEqual([]);
  });

  it("passes learning guide mode through and defaults to default", () => {
    expect(
      chatEvalArgsFor(
        context({
          chatSettings: { instructionMode: "learningGuide", responseLength: "default" },
        }),
        "s"
      ).chatSettings
    ).toEqual({ instructionMode: "learningGuide" });
    expect(
      chatEvalArgsFor(
        context({ chatSettings: { instructionMode: "default", responseLength: "default" } }),
        "s"
      ).chatSettings
    ).toEqual({ instructionMode: "default" });
  });

  it("rejects a history turn whose role is not user or assistant", () => {
    expect(() =>
      chatEvalArgsFor(
        context({
          conversationHistory: [
            { role: "system", content: "rules" },
            { role: "user", content: "q" },
          ],
        }),
        "s"
      )
    ).toThrow(/role/);
  });
});
