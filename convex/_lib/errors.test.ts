import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  createConcurrentRunLimitError,
  createDailyLimitError,
  createNotebookLimitError,
  createProRequiredError,
  createRetryLimitError,
  createSourceLimitError,
  ErrorCode,
  getFeatureLimit,
  getFeatureWindow,
  getFreeLimit,
  getProLimit,
  isProOnlyFeature,
  isRetryableHttpStatus,
} from "./errors";

describe("createNotebookLimitError", () => {
  it("has correct code, limitType, and isPro=false by default", () => {
    const err = createNotebookLimitError(3, 5);
    expect(err.code).toBe(ErrorCode.NOTEBOOK_LIMIT_REACHED);
    expect(err.limitType).toBe("notebook");
    expect(err.current).toBe(3);
    expect(err.limit).toBe(5);
    expect(err.isPro).toBe(false);
    expect(err.data).toEqual({
      code: ErrorCode.NOTEBOOK_LIMIT_REACHED,
      message: err.message,
      limit: 5,
      current: 3,
      limitType: "notebook",
      feature: undefined,
      window: undefined,
      isPro: false,
    });
  });

  it("is a ConvexError so production passes its data to the client", () => {
    const err = createNotebookLimitError(3, 5);
    expect(err).toBeInstanceOf(ConvexError);
    expect(err.message).toBe(
      "Notebook limit reached (3/5). Please upgrade to create more notebooks."
    );
  });

  it("sets isPro=true when passed", () => {
    const err = createNotebookLimitError(50, 100, true);
    expect(err.isPro).toBe(true);
    expect(err.data.isPro).toBe(true);
  });
});

describe("createSourceLimitError", () => {
  it("has correct fields", () => {
    const err = createSourceLimitError(20, 20, true);
    expect(err.code).toBe(ErrorCode.SOURCE_LIMIT_REACHED);
    expect(err.limitType).toBe("source");
    expect(err.current).toBe(20);
    expect(err.limit).toBe(20);
    expect(err.isPro).toBe(true);
  });

  it("free-tier message surfaces the higher Pro per-notebook source cap", () => {
    const err = createSourceLimitError(20, 20, false);
    expect(err.message).toContain("200 sources per notebook");
  });
});

describe("createDailyLimitError", () => {
  it("has correct feature and fields", () => {
    const err = createDailyLimitError("chat", 50, 50);
    expect(err.code).toBe(ErrorCode.DAILY_LIMIT_REACHED);
    expect(err.limitType).toBe("daily");
    expect(err.feature).toBe("chat");
    expect(err.current).toBe(50);
    expect(err.limit).toBe(50);
  });

  it("names the window the limit applies to", () => {
    expect(createDailyLimitError("chat", 10, 10).message).toMatch(/^Daily chat message limit/);
    expect(createDailyLimitError("audio", 3, 3).message).toMatch(/^Weekly audio overview limit/);
    expect(createDailyLimitError("audio", 20, 20, true).message).toMatch(/^Daily audio overview/);
    const review = createDailyLimitError("literatureReview", 1, 1);
    expect(review.message).toMatch(/^30-day literature review limit reached \(1\/1\)/);
    expect(review.data.window).toBe("month");
  });
});

describe("createProRequiredError", () => {
  it("marks the feature as not on the Free plan", () => {
    const err = createProRequiredError("deepResearch");
    expect(err.code).toBe(ErrorCode.FEATURE_REQUIRES_PRO);
    expect(err.limitType).toBe("plan");
    expect(err.feature).toBe("deepResearch");
    expect(err.isPro).toBe(false);
    expect(err.message).toBe("Deep research is a Pro feature. Upgrade to Pro to use it.");
  });
});

describe("run limit errors", () => {
  it("concurrent run error carries the in-progress count and cap", () => {
    const err = createConcurrentRunLimitError("literatureReview", 3, 3, true);
    expect(err.code).toBe(ErrorCode.CONCURRENT_RUN_LIMIT_REACHED);
    expect(err.limitType).toBe("concurrent");
    expect(err.data).toMatchObject({ current: 3, limit: 3, isPro: true });
  });

  it("retry error carries the retry count and cap", () => {
    const err = createRetryLimitError("deepResearch", 3, 3, true);
    expect(err.code).toBe(ErrorCode.RETRY_LIMIT_REACHED);
    expect(err.limitType).toBe("retry");
    expect(err.message).toContain("retried 3 times");
  });
});

describe("isRetryableHttpStatus", () => {
  it("returns true for retryable status codes", () => {
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(504)).toBe(true);
  });

  it("returns false for non-retryable status codes", () => {
    expect(isRetryableHttpStatus(200)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
  });

  it("returns true for undefined (unknown)", () => {
    expect(isRetryableHttpStatus(undefined)).toBe(true);
  });
});

describe("getFeatureLimit", () => {
  it("returns pro limits when isPro=true", () => {
    expect(getFeatureLimit("chat", true)).toBe(500);
    expect(getFeatureLimit("audio", true)).toBe(20);
    expect(getFeatureLimit("infographic", true)).toBe(10);
    expect(getFeatureLimit("literatureReview", true)).toBe(10);
    expect(getFeatureLimit("deepResearch", true)).toBe(15);
    expect(getFeatureLimit("mindmap", true)).toBe(100);
  });

  it("returns free limits when isPro=false", () => {
    expect(getFeatureLimit("chat", false)).toBe(10);
    expect(getFeatureLimit("audio", false)).toBe(3);
    expect(getFeatureLimit("mindmap", false)).toBe(1);
    expect(getFeatureLimit("literatureReview", false)).toBe(1);
  });

  it("Pro-only features have no Free allowance", () => {
    expect(isProOnlyFeature("infographic")).toBe(true);
    expect(isProOnlyFeature("deepResearch")).toBe(true);
    expect(isProOnlyFeature("literatureReview")).toBe(false);
    expect(getFeatureLimit("infographic", false)).toBe(0);
    expect(getFeatureLimit("deepResearch", false)).toBe(0);
  });

  it("getFreeLimit and getProLimit return correct values", () => {
    expect(getFreeLimit("flashcard")).toBe(1);
    expect(getProLimit("flashcard")).toBe(100);
  });
});

describe("getFeatureWindow", () => {
  it("uses each plan's window", () => {
    expect(getFeatureWindow("audio", false)).toBe("week");
    expect(getFeatureWindow("audio", true)).toBe("day");
    expect(getFeatureWindow("literatureReview", false)).toBe("month");
    expect(getFeatureWindow("literatureReview", true)).toBe("day");
  });

  it("falls back to Pro's window for a Pro-only feature", () => {
    expect(getFeatureWindow("deepResearch", false)).toBe("day");
  });
});
