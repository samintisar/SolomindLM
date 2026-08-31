import { describe, expect, it } from "vitest";
import { throwOnResendSendError } from "./resendSendError";

describe("throwOnResendSendError", () => {
  it("rewrites Resend test-mode restriction", () => {
    expect(() =>
      throwOnResendSendError({ message: "You can only send testing emails to your own email" })
    ).toThrow(/verify a domain/);
  });

  it("passes through other messages", () => {
    expect(() => throwOnResendSendError({ message: "Rate limit" })).toThrow("Rate limit");
  });
});
