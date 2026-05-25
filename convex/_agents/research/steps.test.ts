"use node";

import { describe, it, expect, vi } from "vitest";
import { trackResearchStep } from "./steps";

describe("trackResearchStep", () => {
  it("should call runMutation with correct args", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      runMutation,
    } as unknown as import("../../_generated/server").ActionCtx;

    await trackResearchStep(
      mockCtx,
      "research-123",
      "research",
      "planning",
      "in_progress",
      "Planning research strategy",
      { queryCount: 5, customField: "value" }
    );

    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(), // internal.research.index.upsertResearchStep
      {
        researchId: "research-123",
        agentType: "research",
        stepType: "planning",
        status: "in_progress",
        details: "Planning research strategy",
        metadata: { queryCount: 5, customField: "value" },
        order: 0,
      }
    );
  });

  it("should call runMutation with correct order for searching step", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      runMutation,
    } as unknown as import("../../_generated/server").ActionCtx;

    await trackResearchStep(mockCtx, "research-456", "literature_review", "searching", "completed");

    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        researchId: "research-456",
        agentType: "literature_review",
        stepType: "searching",
        status: "completed",
        order: 1,
      })
    );
  });

  it("should not throw when runMutation fails", async () => {
    const runMutation = vi.fn().mockRejectedValue(new Error("DB error"));
    const mockCtx = {
      runMutation,
    } as unknown as import("../../_generated/server").ActionCtx;

    // Should not throw
    await expect(
      trackResearchStep(mockCtx, "research-789", "research", "generating_report", "failed")
    ).resolves.toBeUndefined();

    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("should work without optional params", async () => {
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      runMutation,
    } as unknown as import("../../_generated/server").ActionCtx;

    await trackResearchStep(mockCtx, "research-abc", "research", "awaiting_user_input", "pending");

    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      researchId: "research-abc",
      agentType: "research",
      stepType: "awaiting_user_input",
      status: "pending",
      details: undefined,
      metadata: undefined,
      order: 8,
    });
  });
});
