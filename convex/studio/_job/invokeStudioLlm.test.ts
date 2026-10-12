import { describe, expect, it, vi } from "vitest";
import { invokeWithinBudget } from "./invokeStudioLlm";

describe("invokeWithinBudget", () => {
  it("retries a retryable failure while budget remains", async () => {
    const invoke = vi.fn().mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValue("ok");

    await expect(
      invokeWithinBudget({ invoke, timeoutMs: 5_000, phaseLabel: "Test" })
    ).resolves.toBe("ok");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("does not start another attempt once the shared budget is spent", async () => {
    // The retry backoff (1s) outlasts the 200ms budget, so the retry must not call invoke.
    const invoke = vi.fn().mockRejectedValue(new Error("HTTP 503"));

    await expect(
      invokeWithinBudget({ invoke, timeoutMs: 200, phaseLabel: "Test" })
    ).rejects.toThrow("Test timeout after 200ms");
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
