import { describe, it, expect } from "vitest";
import {
  researchProgressToStreamingActivity,
  computeRemoteGenerationBlocksSend,
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
