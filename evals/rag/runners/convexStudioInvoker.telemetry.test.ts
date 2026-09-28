import { beforeEach, describe, expect, it, vi } from "vitest";

const convexBrowserMock = vi.hoisted(() => {
  class MockConvexHttpClient {
    action = vi.fn();

    constructor(_convexUrl: string) {
      convexHttpClients.push(this);
    }
  }

  const convexHttpClients: MockConvexHttpClient[] = [];

  return {
    ConvexHttpClient: MockConvexHttpClient,
    convexHttpClients,
  };
});

vi.mock("convex/browser", () => ({
  ConvexHttpClient: convexBrowserMock.ConvexHttpClient,
}));

import { pickStudioInvokeTelemetry, STUDIO_INVOKER_FACTORIES } from "./convexStudioInvoker";

const kickoffIdFields = {
  report: "reportId",
  flashcards: "flashcardId",
  quiz: "quizId",
  mindmap: "mindmapId",
  infographic: "infographicId",
  spreadsheet: "spreadsheetId",
  writtenQuestions: "writtenQuestionId",
  audioScript: "audioOverviewId",
  audioScriptOnly: "audioOverviewId",
} as const;

const telemetry = {
  tokenUsage: { prompt: 11, completion: 7, total: 18 },
  tokenUsageSource: "provider" as const,
  stageSpans: [
    { stage: "retrieve" as const, latencyMs: 20 },
    { stage: "reduce" as const, latencyMs: 40 },
  ],
};

const registeredFactories = Object.entries(STUDIO_INVOKER_FACTORIES).map(
  ([kind, factory]) => [kind, factory!] as const
);

describe("pickStudioInvokeTelemetry", () => {
  it("copies token usage, token usage source, and stage spans when present", () => {
    expect(
      pickStudioInvokeTelemetry({
        status: "completed",
        tokenUsage: telemetry.tokenUsage,
        tokenUsageSource: telemetry.tokenUsageSource,
        stageSpans: telemetry.stageSpans,
      })
    ).toEqual(telemetry);
  });

  it("omits telemetry fields when the status does not include them", () => {
    expect(pickStudioInvokeTelemetry({ status: "completed", title: "T" })).toEqual({});
  });
});

describe("STUDIO_INVOKER_FACTORIES telemetry", () => {
  beforeEach(() => {
    convexBrowserMock.convexHttpClients.length = 0;
    vi.clearAllMocks();
  });

  it.each(registeredFactories)(
    "copies token usage, token usage source, and stage spans for %s",
    async (kind, factory) => {
      const kickoffIdField = kickoffIdFields[kind as keyof typeof kickoffIdFields];
      const kickoffId = `${kind}-id`;
      const client = factory("https://convex.example", { evalSecret: "secret" });
      const mockHttpClient = convexBrowserMock.convexHttpClients.at(-1);

      expect(mockHttpClient).toBeDefined();

      mockHttpClient?.action
        .mockResolvedValueOnce({ [kickoffIdField]: kickoffId })
        .mockResolvedValueOnce({
          status: "completed",
          title: `${kind} title`,
          content: `${kind} body`,
          ...telemetry,
        });

      const result = await client.invoke({ notebookId: "nb" });

      expect(result.tokenUsage).toEqual(telemetry.tokenUsage);
      expect(result.tokenUsageSource).toBe("provider");
      expect(result.stageSpans).toEqual(telemetry.stageSpans);
      expect(result.raw).toMatchObject({
        [kickoffIdField]: kickoffId,
        ...telemetry,
      });
      expect(mockHttpClient?.action).toHaveBeenCalledTimes(2);
    }
  );
});
