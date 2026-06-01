import { describe, expect, it } from "vitest";
import {
  createDailyLimitError,
  createNotebookLimitError,
  createSourceLimitError,
  ErrorCode,
  getFeatureLimit,
  getFreeLimit,
  getProLimit,
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
      limit: 5,
      current: 3,
      limitType: "notebook",
      feature: undefined,
      isPro: false,
    });
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
    expect(getFeatureLimit("audio", true)).toBe(100);
    expect(getFeatureLimit("infographic", true)).toBe(100);
  });

  it("returns free limits when isPro=false", () => {
    expect(getFeatureLimit("chat", false)).toBe(50);
    expect(getFeatureLimit("audio", false)).toBe(1);
    expect(getFeatureLimit("infographic", false)).toBe(5);
  });

  it("getFreeLimit and getProLimit return correct values", () => {
    expect(getFreeLimit("flashcard")).toBe(5);
    expect(getProLimit("flashcard")).toBe(100);
  });
});
