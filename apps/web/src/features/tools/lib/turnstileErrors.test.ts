import { describe, expect, it } from "vitest";
import { isTurnstileChallengeFailure } from "./turnstileErrors";

describe("isTurnstileChallengeFailure", () => {
  it("matches failed security checks (300xxx and 600xxx error codes)", () => {
    expect(isTurnstileChallengeFailure(new Error("turnstile_300010"))).toBe(true);
    expect(isTurnstileChallengeFailure(new Error("turnstile_600010"))).toBe(true);
  });

  it("does not match load failures, timeouts or other codes", () => {
    for (const message of [
      "turnstile_load_failed",
      "turnstile_timeout",
      "turnstile_expired",
      "turnstile_110200",
      "turnstile_3000100",
      "turnstile_30001",
    ]) {
      expect(isTurnstileChallengeFailure(new Error(message))).toBe(false);
    }
  });

  it("does not match non-errors", () => {
    expect(isTurnstileChallengeFailure("turnstile_300010")).toBe(false);
    expect(isTurnstileChallengeFailure(undefined)).toBe(false);
  });
});
