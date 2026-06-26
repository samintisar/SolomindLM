import { describe, expect, it } from "vitest";
import {
  computeRemoteGenerationBlocksSend,
  isStreamStillRelevant,
  researchProgressToStreamingActivity,
  resolveConversationMessages,
} from "./chatStreamHelpers";

describe("researchProgressToStreamingActivity", () => {
  it("maps writing phase", () => {
    expect(researchProgressToStreamingActivity({ phase: "writing" })).toEqual({
      phase: "writing",
      detail: "Synthesizing research report…",
    });
  });

  it("maps retrieving_notebook with chunk count", () => {
    expect(
      researchProgressToStreamingActivity({ phase: "retrieving_notebook", sourcesFound: 3 })
    ).toEqual({
      phase: "retrieving",
      detail: "Notebook search · 3 chunks found",
    });
  });

  it("maps retrieving_notebook without hits", () => {
    expect(researchProgressToStreamingActivity({ phase: "retrieving_notebook" })).toEqual({
      phase: "retrieving",
      detail: "Searching your notebook…",
    });
  });

  it("maps unknown phases to thinking with humanized label", () => {
    expect(researchProgressToStreamingActivity({ phase: "planning_subquestions" })).toEqual({
      phase: "thinking",
      detail: "planning subquestions",
    });
  });
});

describe("resolveConversationMessages", () => {
  it("returns empty when no conversation is selected", () => {
    expect(resolveConversationMessages(null, { messages: [{ role: "user" }] })).toEqual([]);
  });

  it("returns empty while the selected conversation is loading", () => {
    expect(resolveConversationMessages("conv_1", undefined)).toEqual([]);
  });

  it("returns bundle messages when a conversation is selected and loaded", () => {
    const messages = [{ role: "assistant", content: "hi" }];
    expect(resolveConversationMessages("conv_1", { messages })).toBe(messages);
  });
});

describe("isStreamStillRelevant", () => {
  it("is true only when stream and active conversation match", () => {
    expect(isStreamStillRelevant("conv_a", "conv_a")).toBe(true);
    expect(isStreamStillRelevant("conv_a", "conv_b")).toBe(false);
    expect(isStreamStillRelevant(null, null)).toBe(true);
    expect(isStreamStillRelevant("conv_a", null)).toBe(false);
  });
});

describe("computeRemoteGenerationBlocksSend", () => {
  it("is false when server is not generating", () => {
    expect(computeRemoteGenerationBlocksSend(false, [{ role: "user" }])).toBe(false);
  });

  it("is true when generating and last message is not assistant", () => {
    expect(computeRemoteGenerationBlocksSend(true, [{ role: "user" }, { role: "user" }])).toBe(
      true
    );
  });

  it("is false when generating but assistant already arrived", () => {
    expect(computeRemoteGenerationBlocksSend(true, [{ role: "user" }, { role: "assistant" }])).toBe(
      false
    );
  });
});
