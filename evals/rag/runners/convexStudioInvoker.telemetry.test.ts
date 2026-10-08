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

import {
  createConvexStudioInvokers,
  pickStudioInvokeTelemetry,
  STUDIO_INVOKER_FACTORIES,
} from "./convexStudioInvoker";

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

const registeredKinds = Object.keys(STUDIO_INVOKER_FACTORIES) as Array<
  keyof typeof STUDIO_INVOKER_FACTORIES
>;

describe("pickStudioInvokeTelemetry", () => {
  it("copies token usage, token usage source, and stage spans when present", () => {
    // A whole job status object, as the invokers pass it (extra fields included).
    const status = {
      status: "completed",
      tokenUsage: telemetry.tokenUsage,
      tokenUsageSource: telemetry.tokenUsageSource,
      stageSpans: telemetry.stageSpans,
    };
    expect(pickStudioInvokeTelemetry(status)).toEqual(telemetry);
  });

  it("omits telemetry fields when the status does not include them", () => {
    const status: Parameters<typeof pickStudioInvokeTelemetry>[0] & {
      status: string;
      title: string;
    } = { status: "completed", title: "T" };
    expect(pickStudioInvokeTelemetry(status)).toEqual({});
  });
});

describe("STUDIO_INVOKER_FACTORIES telemetry", () => {
  beforeEach(() => {
    convexBrowserMock.convexHttpClients.length = 0;
    vi.clearAllMocks();
  });

  it("shares one HTTP client across every studio invoker", () => {
    const invokers = createConvexStudioInvokers("https://convex.example", { evalSecret: "s" });
    expect(Object.keys(invokers)).toEqual(registeredKinds);
    expect(convexBrowserMock.convexHttpClients).toHaveLength(1);
  });

  it.each(registeredKinds)(
    "copies token usage, token usage source, and stage spans for %s",
    async (kind) => {
      const kickoffIdField = kickoffIdFields[kind as keyof typeof kickoffIdFields];
      const kickoffId = `${kind}-id`;
      const client = createConvexStudioInvokers("https://convex.example", {
        evalSecret: "secret",
      })[kind]!;
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
      expect(mockHttpClient?.action).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({ evalSecret: "secret", notebookId: "nb" })
      );
      expect(mockHttpClient?.action).toHaveBeenNthCalledWith(2, expect.anything(), {
        evalSecret: "secret",
        [kickoffIdField]: kickoffId,
      });
    }
  );
});
