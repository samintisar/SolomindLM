import { describe, expect, it } from "vitest";
import { isFeedbackAdminEmail, parseAdminEmails } from "./feedbackAdmin";

describe("feedbackAdmin", () => {
  it("parses a comma-separated list, trims, lowercases, drops blanks", () => {
    expect(parseAdminEmails(" A@x.com, b@Y.com ,, c@z.com ")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
  });

  it("returns [] for an empty string", () => {
    expect(parseAdminEmails("")).toEqual([]);
  });

  it("matches an email case-insensitively against the allowlist", () => {
    expect(isFeedbackAdminEmail("Dev@Solomind.com", "dev@solomind.com")).toBe(true);
  });

  it("rejects an email not on the allowlist", () => {
    expect(isFeedbackAdminEmail("other@x.com", "dev@solomind.com")).toBe(false);
  });

  it("rejects undefined/empty email", () => {
    expect(isFeedbackAdminEmail(undefined, "dev@solomind.com")).toBe(false);
    expect(isFeedbackAdminEmail("", "dev@solomind.com")).toBe(false);
  });
});
