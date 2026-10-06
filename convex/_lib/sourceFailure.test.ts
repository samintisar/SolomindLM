import { describe, expect, it } from "vitest";
import { sourceFailureMessage, UserFacingSourceError } from "./sourceFailure";

describe("sourceFailureMessage", () => {
  it("uses the message written for the user when there is one", () => {
    const error = new UserFacingSourceError("We couldn't read the PDF at this link.", "OCR failed");
    expect(sourceFailureMessage(error, "unknown")).toBe("We couldn't read the PDF at this link.");
  });

  it.each(["rate_limit", "llm_timeout"] as const)("asks for a retry later on %s", (type) => {
    expect(sourceFailureMessage(new Error("HTTP 429"), type)).toMatch(/try again/i);
  });

  it("never shows internal error text", () => {
    const message = sourceFailureMessage(
      new Error('mistral HTTP 401: {"detail":"Invalid API Key"}'),
      "unknown"
    );
    expect(message).not.toMatch(/mistral|401|API Key/i);
  });
});
