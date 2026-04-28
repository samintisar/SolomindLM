import { describe, expect, it } from "vitest";

import { routeChatMessage } from "./chatRouter";

describe("routeChatMessage", () => {
  it("skips retrieval for a guided-learning answer when the assistant is awaiting a response", () => {
    const route = routeChatMessage(
      "I actually don't know",
      [
        {
          role: "assistant",
          content:
            "Great question. What do you think we need to compare between data points?\n\nShare your thoughts and we'll build from there.",
          metadata: {
            guidedLearning: {
              awaitingUserResponse: true,
            },
          },
        },
      ],
      { instructionMode: "learningGuide" }
    );

    expect(route).toEqual({ type: "direct" });
  });

  it("still retrieves when a guided-learning user asks a new source question", () => {
    const route = routeChatMessage(
      "What are KNNs?",
      [
        {
          role: "assistant",
          content: "What do you already know about nearest neighbours?",
          metadata: {
            guidedLearning: {
              awaitingUserResponse: true,
            },
          },
        },
      ],
      { instructionMode: "learningGuide" }
    );

    expect(route).toEqual({ type: "retrieve" });
  });

  it("does not infer guided-learning state when explicit metadata says not awaiting", () => {
    const route = routeChatMessage(
      "I think so",
      [
        {
          role: "assistant",
          content: "Does that make sense?",
          metadata: {
            guidedLearning: {
              awaitingUserResponse: false,
            },
          },
        },
      ],
      { instructionMode: "learningGuide" }
    );

    expect(route).toEqual({ type: "retrieve" });
  });
});
