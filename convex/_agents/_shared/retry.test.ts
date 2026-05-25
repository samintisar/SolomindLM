import { describe, it, expect, vi } from "vitest";
import {
  invokeWithRetry,
  createRetryWrapper,
  invokeWithHttpRetry,
  isHttpAwareRetryableError,
  RetryPolicies,
} from "./retry";
import { ExternalServiceError } from "../../_lib/errors";

describe("isHttpAwareRetryableError", () => {
  it("returns ExternalServiceError.retryable when error is ExternalServiceError", () => {
    const retryableErr = new ExternalServiceError("Tavily", "fail", { retryable: true });
    expect(isHttpAwareRetryableError(retryableErr)).toBe(true);

    const nonRetryableErr = new ExternalServiceError("Tavily", "fail", { retryable: false });
    expect(isHttpAwareRetryableError(nonRetryableErr)).toBe(false);
  });

  it("parses HTTP status codes from message", () => {
    expect(isHttpAwareRetryableError(new Error("HTTP 429 too many requests"))).toBe(true);
    expect(isHttpAwareRetryableError(new Error("HTTP 503 service unavailable"))).toBe(true);
    expect(isHttpAwareRetryableError(new Error("HTTP 500 internal error"))).toBe(true);
    expect(isHttpAwareRetryableError(new Error("HTTP 404 not found"))).toBe(false);
    expect(isHttpAwareRetryableError(new Error("HTTP 401 unauthorized"))).toBe(false);
  });

  it("falls back to isRetryableError for non-HTTP messages", () => {
    expect(isHttpAwareRetryableError(new Error("rate limit exceeded"))).toBe(true);
    expect(isHttpAwareRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isHttpAwareRetryableError(new Error("validation failed"))).toBe(false);
    expect(isHttpAwareRetryableError(new Error("not found"))).toBe(false);
  });
});

describe("invokeWithRetry", () => {
  it("returns result on first successful call", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await invokeWithRetry(fn, { maxAttempts: 3 }, "test");
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable errors then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockRejectedValueOnce(new Error("500 error"))
      .mockResolvedValue("success");

    const result = await invokeWithRetry(fn, { maxAttempts: 3, baseDelayMs: 10 }, "test");
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("validation failed"));
    await expect(invokeWithRetry(fn, { maxAttempts: 3 }, "test")).rejects.toThrow(
      "validation failed"
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws last error after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("rate limit"));
    await expect(
      invokeWithRetry(fn, { maxAttempts: 2, baseDelayMs: 10 }, "test_phase")
    ).rejects.toThrow("rate limit");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry callback before each retry", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValue("success");

    await invokeWithRetry(fn, { maxAttempts: 2, baseDelayMs: 10, onRetry }, "test");
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });

  it("uses custom retryableErrors predicate", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom transient"))
      .mockResolvedValue("success");

    const customRetryable = (err: Error) => err.message.includes("custom transient");
    const result = await invokeWithRetry(
      fn,
      { maxAttempts: 2, baseDelayMs: 10, retryableErrors: customRetryable },
      "test"
    );
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies jitter when configured", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValue("success");

    const start = Date.now();
    await invokeWithRetry(fn, { maxAttempts: 2, baseDelayMs: 50, jitter: true }, "test");
    const elapsed = Date.now() - start;

    // With jitter, delay should be around 50ms +/- 25%
    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(200);
  });

  it("does not retry after the final attempt", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("500"));
    await expect(invokeWithRetry(fn, { maxAttempts: 1, baseDelayMs: 10 }, "test")).rejects.toThrow(
      "500"
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("createRetryWrapper", () => {
  it("creates a reusable retry function with fixed config", async () => {
    const withRetry = createRetryWrapper({ maxAttempts: 2, baseDelayMs: 10 });
    const fn = vi.fn().mockRejectedValueOnce(new Error("rate limit")).mockResolvedValue("wrapped");

    const result = await withRetry(fn, "phase");
    expect(result).toBe("wrapped");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("RetryPolicies", () => {
  it("exponential policy has no jitter", () => {
    expect(RetryPolicies.exponential.jitter).toBe(false);
    expect(RetryPolicies.exponential.maxAttempts).toBe(3);
    expect(RetryPolicies.exponential.baseDelayMs).toBe(1000);
  });

  it("jitter policy has jitter enabled", () => {
    expect(RetryPolicies.jitter.jitter).toBe(true);
  });

  it("aggressive policy has more attempts and shorter delay", () => {
    expect(RetryPolicies.aggressive.maxAttempts).toBe(5);
    expect(RetryPolicies.aggressive.baseDelayMs).toBe(500);
    expect(RetryPolicies.aggressive.jitter).toBe(true);
  });

  it("conservative policy has fewer attempts and longer delay", () => {
    expect(RetryPolicies.conservative.maxAttempts).toBe(2);
    expect(RetryPolicies.conservative.baseDelayMs).toBe(2000);
    expect(RetryPolicies.conservative.jitter).toBe(false);
  });

  it("http policy uses isHttpAwareRetryableError", () => {
    expect(RetryPolicies.http.retryableErrors).toBe(isHttpAwareRetryableError);
    expect(RetryPolicies.http.jitter).toBe(true);
  });
});

describe("invokeWithHttpRetry", () => {
  it("uses http policy defaults", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValue("ok");

    const result = await invokeWithHttpRetry(fn, "fetch", { baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("allows overriding retryableErrors", async () => {
    const customChecker = vi.fn().mockReturnValue(true);
    const fn = vi.fn().mockRejectedValueOnce(new Error("anything")).mockResolvedValue("ok");

    const result = await invokeWithHttpRetry(fn, "fetch", {
      baseDelayMs: 10,
      retryableErrors: customChecker,
    });
    expect(result).toBe("ok");
    expect(customChecker).toHaveBeenCalled();
  });

  it("preserves http retryableErrors when overrides don't specify one", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("HTTP 429")).mockResolvedValue("ok");

    const result = await invokeWithHttpRetry(fn, "fetch", { baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
