import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { type ChatAgentInvoker, runChatEval } from "./chatRunner";
import { snapshotRetrievalConfig } from "./config";

const fixture: EvalFixture = {
  schemaVersion: 1,
  id: "wiring/multi-01",
  runner: "chat",
  question: "Give me two more examples of that.",
  notebookId: "nb",
  expectedItems: [],
  expectedAnswer: "Two examples built on the earlier topic.",
  expectedBehavior: "Uses the earlier topic.",
  tags: [],
  turns: [
    { role: "user", content: "Which verbs take être?" },
    { role: "assistant", content: "Verbs of coming and going, such as aller." },
  ],
  chatSettings: { instructionMode: "learningGuide" },
};

/** An invoker that records what it was asked and answers with a fixed artifact payload. */
function recordingInvoker(
  seen: Array<Parameters<ChatAgentInvoker["invoke"]>[0]>
): ChatAgentInvoker {
  return {
    invoke: async (context) => {
      seen.push(context);
      return {
        answer: "a",
        citations: [],
        subQueries: [],
        preRerankChunks: [],
        postRerankChunks: [],
        selectedChunks: [],
        latencyMs: 1,
        instructionMode: context.chatSettings?.instructionMode,
      };
    },
  };
}

describe("runChatEval multi-turn", () => {
  it("sends prior turns then the question as the final user turn", async () => {
    const seen: Array<Parameters<ChatAgentInvoker["invoke"]>[0]> = [];
    await runChatEval({ fixture, config: snapshotRetrievalConfig() }, recordingInvoker(seen));
    expect(seen[0]?.conversationHistory).toEqual([
      { role: "user", content: "Which verbs take être?" },
      { role: "assistant", content: "Verbs of coming and going, such as aller." },
      { role: "user", content: "Give me two more examples of that." },
    ]);
  });

  it("sends the fixture's instruction mode, defaulting to default", async () => {
    const seen: Array<Parameters<ChatAgentInvoker["invoke"]>[0]> = [];
    await runChatEval(
      { fixture: { ...fixture, chatSettings: undefined }, config: snapshotRetrievalConfig() },
      recordingInvoker(seen)
    );
    expect(seen[0]?.chatSettings).toEqual({
      instructionMode: "default",
      responseLength: "default",
    });
  });

  it("copies the instruction mode the agent ran onto the artifact", async () => {
    const seen: Array<Parameters<ChatAgentInvoker["invoke"]>[0]> = [];
    const { artifact } = await runChatEval(
      { fixture, config: snapshotRetrievalConfig() },
      recordingInvoker(seen)
    );
    expect(artifact.instructionMode).toBe("learningGuide");
  });

  it("rejects a turn whose role is not user or assistant", async () => {
    const bad = {
      ...fixture,
      turns: [{ role: "system" as "user", content: "You are helpful." }],
    };
    const { errors } = await runChatEval(
      { fixture: bad, config: snapshotRetrievalConfig() },
      recordingInvoker([])
    );
    expect(errors.join(" ")).toContain("turns");
  });

  it("rejects an empty turn", async () => {
    const bad = { ...fixture, turns: [{ role: "user" as const, content: "  " }] };
    const { errors } = await runChatEval(
      { fixture: bad, config: snapshotRetrievalConfig() },
      recordingInvoker([])
    );
    expect(errors.join(" ")).toContain("turns");
  });
});
